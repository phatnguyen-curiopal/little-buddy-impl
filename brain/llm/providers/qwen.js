// Qwen via Alibaba DashScope's OpenAI-compatible endpoint, non-streaming.
//
// Same wire format as openai.js, so it reuses the OpenAI SDK, but none of
// OpenAI's proprietary fields (reasoning_effort, service_tier, moderation,
// prompt_cache_key): they are not part of the compatible-mode contract. The
// reply model is the only thing that moves; embeddings and the extractors
// stay on OpenAI.

import OpenAI from 'openai';

import { makeResult, toLlmError } from '../result.js';

export const name = 'qwen';
export const keyEnv = 'QWEN_API_KEY';

// DashScope wants temperature in [0, 2), open at the top. Whole numbers are
// nudged by a hundredth because its parser distinguishes int from float and
// answers `temperature=1` with 400 "'temperature' must be Float" (probed on
// the live workspace); JSON.stringify(1) emits the token `1`.
export function clampTemperature(value, warn = () => {}) {
  if (value == null) return null;
  let out = Math.min(1.99, Math.max(0, value));
  if (out !== value) warn(`LLM_TEMPERATURE=${value} is outside [0, 2) for Qwen; using ${out}`);
  if (Number.isInteger(out)) out += 0.01;
  return out;
}

function clampPenalty(value, label, warn) {
  if (value == null) return null;
  const clamped = Math.min(2, Math.max(-2, value));
  if (clamped !== value) warn(`${label}=${value} is outside [-2, 2] for Qwen; using ${clamped}`);
  return clamped;
}

const FINISH = { stop: 'stop', length: 'length', content_filter: 'refusal' };

export function create(config, { warn = () => {} } = {}) {
  const llm = config.llm;
  const model = llm.models.qwen;
  // The only per-provider token cap: the workspace advertises a far larger
  // ceiling, and a reply here is read aloud to a child.
  const maxTokens = llm.qwenMaxTokens;
  const temperature = clampTemperature(llm.temperature, warn);
  const presence = clampPenalty(llm.presencePenalty, 'LLM_PRESENCE_PENALTY', warn);
  const frequency = clampPenalty(llm.frequencyPenalty, 'LLM_FREQUENCY_PENALTY', warn);

  const client = new OpenAI({ apiKey: config.keys.qwen, baseURL: llm.qwenBaseUrl || undefined });

  function buildRequest({ system, messages }) {
    return {
      model,
      // DashScope's compatible mode implements the older field name.
      max_tokens: maxTokens,
      ...(temperature != null && { temperature }),
      ...(presence != null && { presence_penalty: presence }),
      ...(frequency != null && { frequency_penalty: frequency }),
      messages: [{ role: 'system', content: system }, ...messages],
    };
  }

  async function generate({ system, messages, signal }) {
    const started = Date.now();
    let response;
    try {
      response = await client.chat.completions.create(buildRequest({ system, messages }), { signal });
    } catch (err) {
      throw toLlmError(err, signal);
    }
    const choice = response.choices?.[0];
    return makeResult({
      text: choice?.message?.content ?? '',
      provider: name,
      model: response.model || model,
      finish: FINISH[choice?.finish_reason] || 'stop',
      usage: {
        input: response.usage?.prompt_tokens,
        output: response.usage?.completion_tokens,
        cached: response.usage?.prompt_tokens_details?.cached_tokens,
      },
      started,
    });
  }

  const extras = [
    temperature != null && `temp ${temperature}`,
    presence != null && `pres ${presence}`,
    frequency != null && `freq ${frequency}`,
  ].filter(Boolean);

  return {
    name,
    model,
    buildRequest,
    generate,
    describe: () => `qwen ${model} (max ${maxTokens}${extras.length ? `, ${extras.join(', ')}` : ''})`,
  };
}
