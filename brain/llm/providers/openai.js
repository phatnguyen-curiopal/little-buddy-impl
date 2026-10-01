// GPT via the Chat Completions API, non-streaming.

import OpenAI from 'openai';

import { makeResult, toLlmError } from '../result.js';

export const name = 'openai';
export const keyEnv = 'OPENAI_API_KEY';

function clamp(value, label, lo, hi, warn) {
  if (value == null) return null;
  const clamped = Math.min(hi, Math.max(lo, value));
  if (clamped !== value) warn(`${label}=${value} is outside [${lo}, ${hi}] for OpenAI; using ${clamped}`);
  return clamped;
}

// The top three categories of a flagged side, as data for the log. The
// verdict arrives with the reply, so this is a signal, never a gate: a child
// recounting a playground fight scores as violence and still needs comfort.
export function summarizeModeration(moderation) {
  if (!moderation || typeof moderation !== 'object') return null;
  let flagged = false;
  const scores = [];
  for (const side of ['input', 'output']) {
    const result = moderation[side]?.results?.[0];
    if (!result) continue;
    if (result.flagged) {
      flagged = true;
      for (const [category, score] of Object.entries(result.category_scores || {})) {
        scores.push({ side, category, score: Number(score) });
      }
    }
  }
  const top = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }));
  return { flagged, top };
}

export function create(config, { warn = () => {} } = {}) {
  const llm = config.llm;
  const model = llm.models.openai;
  // Reasoning models and sampling params are mutually exclusive per model;
  // a wrong mix fails loudly as an upstream error on turn one rather than
  // being silently stripped here.
  const temperature = clamp(llm.temperature, 'LLM_TEMPERATURE', 0, 2, warn);
  const presence = clamp(llm.presencePenalty, 'LLM_PRESENCE_PENALTY', -2, 2, warn);
  const frequency = clamp(llm.frequencyPenalty, 'LLM_FREQUENCY_PENALTY', -2, 2, warn);
  let cacheBust = 0;

  const client = new OpenAI({
    apiKey: config.keys.openai,
    ...(config.seams.openaiBaseUrl && { baseURL: config.seams.openaiBaseUrl }),
  });

  // There is no flag that turns prompt caching off; a key unique per request
  // routes it to a cold bucket every time. Absent (not null) while caching
  // is on, so the default body stays exactly what it always was.
  function cacheFields() {
    if (llm.cache) return {};
    cacheBust += 1;
    return { prompt_cache_key: `nocache-${process.pid}-${Date.now()}-${cacheBust}` };
  }

  function buildRequest({ system, messages }) {
    return {
      model,
      // max_tokens is deprecated on this endpoint.
      max_completion_tokens: llm.maxTokens,
      // Sent only when set: reasoning models accept it, others 400 on it.
      ...(llm.effort && { reasoning_effort: llm.effort }),
      ...(llm.serviceTier && { service_tier: llm.serviceTier }),
      // Each side takes an object; the documented string form is a 400.
      ...(llm.moderation && {
        moderation: {
          model: 'omni-moderation-latest',
          policy: { input: { mode: llm.moderation }, output: { mode: llm.moderation } },
        },
      }),
      ...(temperature != null && { temperature }),
      ...(presence != null && { presence_penalty: presence }),
      ...(frequency != null && { frequency_penalty: frequency }),
      ...cacheFields(),
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
    const finishReason = choice?.finish_reason;
    const refused = finishReason === 'content_filter' || Boolean(choice?.message?.refusal);
    return makeResult({
      text: choice?.message?.content ?? '',
      provider: name,
      model: response.model || model,
      finish: refused ? 'refusal' : finishReason === 'length' ? 'length' : 'stop',
      usage: {
        input: response.usage?.prompt_tokens,
        output: response.usage?.completion_tokens,
        cached: response.usage?.prompt_tokens_details?.cached_tokens,
      },
      started,
      moderation: summarizeModeration(response.moderation),
    });
  }

  const extras = [
    llm.effort && `effort ${llm.effort}`,
    llm.serviceTier && `tier ${llm.serviceTier}`,
    llm.moderation && `moderation ${llm.moderation}`,
    temperature != null && `temp ${temperature}`,
    presence != null && `pres ${presence}`,
    frequency != null && `freq ${frequency}`,
    !llm.cache && 'no prompt cache',
  ].filter(Boolean);

  return {
    name,
    model,
    buildRequest,
    generate,
    describe: () => `openai ${model} (max ${llm.maxTokens}${extras.length ? `, ${extras.join(', ')}` : ''})`,
  };
}
