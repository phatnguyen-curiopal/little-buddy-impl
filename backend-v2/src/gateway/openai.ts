// OpenAI over plain fetch: streaming chat for replies, strict JSON schema for
// the classifier and the background jobs, embeddings and moderation.

import type { Config } from '../config.ts';
import type { ChatMessage } from '../domain/types.ts';
import { GatewayError } from '../util/errors.ts';
import { EMBEDDING_DIMS, type Usage } from './types.ts';

type Fetch = typeof fetch;

function toGatewayError(err: unknown, signal?: AbortSignal): GatewayError {
  if (err instanceof GatewayError) return err;
  if (signal?.aborted || (err as Error)?.name === 'AbortError') return new GatewayError('aborted', 'request aborted');
  return new GatewayError('upstream', `openai request failed: ${(err as Error)?.message ?? 'unknown'}`);
}

async function* sseData(body: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        if (data) yield data;
      }
      nl = buf.indexOf('\n');
    }
  }
}

export function createOpenAi(cfg: Config['openai'], fetchImpl: Fetch = fetch) {
  const headers = { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' };

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (err) {
      throw toGatewayError(err, signal);
    }
    if (!res.ok) {
      // The error body can echo the request, which holds a child's words, so
      // only the status travels on.
      await res.arrayBuffer().catch(() => null);
      throw new GatewayError('upstream', `openai ${path} http ${res.status}`, res.status);
    }
    return res;
  }

  async function* chatStream(opts: {
    model: string;
    messages: ChatMessage[];
    maxTokens: number;
    effort?: string | null;
    cacheKey?: string;
    signal?: AbortSignal;
    onUsage?: (u: Usage) => void;
  }): AsyncGenerator<string> {
    const res = await post('/v1/chat/completions', {
      model: opts.model,
      messages: opts.messages,
      stream: true,
      stream_options: { include_usage: true },
      // max_tokens is deprecated on this endpoint; this budget includes reasoning.
      max_completion_tokens: opts.maxTokens,
      ...(opts.effort && { reasoning_effort: opts.effort }),
      ...(cfg.serviceTier && { service_tier: cfg.serviceTier }),
      ...(opts.cacheKey && { prompt_cache_key: opts.cacheKey }),
    }, opts.signal);
    try {
      for await (const data of sseData(res.body as unknown as AsyncIterable<Uint8Array>)) {
        const event = JSON.parse(data);
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) yield delta;
        if (event.usage && opts.onUsage) {
          opts.onUsage({
            inputTokens: event.usage.prompt_tokens ?? 0,
            cachedTokens: event.usage.prompt_tokens_details?.cached_tokens ?? 0,
            outputTokens: event.usage.completion_tokens ?? 0,
          });
        }
      }
    } catch (err) {
      throw toGatewayError(err, opts.signal);
    }
  }

  async function chatJson<T>(opts: {
    model: string;
    name: string;
    schema: Record<string, unknown>;
    system: string;
    user: string;
    effort?: string | null;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<T> {
    const res = await post('/v1/chat/completions', {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: opts.name, schema: opts.schema, strict: true } },
      max_completion_tokens: opts.maxTokens ?? 4000,
      ...(opts.effort && { reasoning_effort: opts.effort }),
    }, opts.signal);
    const body = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
    const message = body.choices?.[0]?.message;
    if (!message?.content || message.refusal) throw new GatewayError('invalid', `openai ${opts.name}: no structured content`);
    try {
      return JSON.parse(message.content) as T;
    } catch {
      throw new GatewayError('invalid', `openai ${opts.name}: content is not JSON`);
    }
  }

  async function embeddings(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await post('/v1/embeddings', {
      model: cfg.embeddingModel,
      input: texts,
      // text-embedding-3-large is 3072 wide; shortening keeps it in the schema's 1,536.
      ...(cfg.embeddingModel.includes('large') && { dimensions: EMBEDDING_DIMS }),
    }, signal);
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async function moderation(text: string, signal?: AbortSignal): Promise<{ flagged: boolean; categories: string[] }> {
    const res = await post('/v1/moderations', { model: 'omni-moderation-latest', input: text }, signal);
    const body = (await res.json()) as { results?: { flagged: boolean; categories: Record<string, boolean> }[] };
    const result = body.results?.[0];
    return {
      flagged: Boolean(result?.flagged),
      categories: Object.entries(result?.categories ?? {}).filter(([, v]) => v).map(([k]) => k),
    };
  }

  return { chatStream, chatJson, embeddings, moderation };
}
