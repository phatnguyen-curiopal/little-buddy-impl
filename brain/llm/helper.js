// OpenAI JSON calls for the memory side (extractors and name correction).
// Always OpenAI, whatever LLM_PROVIDER says, exactly as in the prototype:
// these are json_object calls, and embeddings need the same key anyway.

import OpenAI from 'openai';

export function createOpenAiClient(config) {
  return new OpenAI({
    apiKey: config.keys.openai || 'missing',
    ...(config.seams.openaiBaseUrl && { baseURL: config.seams.openaiBaseUrl }),
  });
}

export function createHelper(client, { llmLog = null } = {}) {
  // Resolves to the parsed object, or {} when the model answered something
  // that is not JSON: a malformed extraction costs a lesson, never a turn.
  // purpose only labels the call in LLM_LOG_FILE.
  async function json({ model, system, user, serviceTier = '', signal, purpose = 'json' }) {
    const started = Date.now();
    const asked = { purpose, provider: 'openai', model, system, messages: [{ role: 'user', content: user }] };
    let response;
    try {
      response = await client.chat.completions.create(
        {
          model,
          ...(serviceTier && { service_tier: serviceTier }),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        signal ? { signal } : undefined,
      );
    } catch (err) {
      llmLog?.record({ ...asked, ms: Date.now() - started, error: err });
      throw err;
    }
    const content = response.choices?.[0]?.message?.content || '';
    llmLog?.record({
      ...asked,
      model: response.model || model,
      ms: Date.now() - started,
      finish: response.choices?.[0]?.finish_reason,
      usage: response.usage && {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        cached: response.usage.prompt_tokens_details?.cached_tokens ?? 0,
      },
      answer: content,
    });
    try {
      const parsed = JSON.parse(content || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return { json };
}
