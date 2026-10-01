// Claude via the Messages API, non-streaming.

import Anthropic from '@anthropic-ai/sdk';

import { makeResult, toLlmError } from '../result.js';

export const name = 'anthropic';
export const keyEnv = 'ANTHROPIC_API_KEY';

const FINISH = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', refusal: 'refusal' };

export function create(config, { warn = () => {} } = {}) {
  const llm = config.llm;
  const model = llm.models.anthropic;
  // Unlike OpenAI, effort always rides here, with low as the default.
  const effort = llm.effort || 'low';
  const thinking = llm.thinking;

  // Claude's range is [0, 1], and adaptive thinking pins temperature to 1
  // API-side, so a custom value there would be a request error.
  const temperature = (() => {
    if (llm.temperature == null) return null;
    if (thinking === 'adaptive') {
      warn('LLM_TEMPERATURE is ignored with LLM_THINKING=adaptive (the API requires temperature 1)');
      return null;
    }
    const clamped = Math.min(1, Math.max(0, llm.temperature));
    if (clamped !== llm.temperature) warn(`LLM_TEMPERATURE=${llm.temperature} is outside [0, 1] for Claude; using ${clamped}`);
    return clamped;
  })();

  // The SDK's base URL has no /v1; it appends the path itself.
  const client = new Anthropic({
    apiKey: config.keys.anthropic,
    ...(config.seams.anthropicBaseUrl && { baseURL: config.seams.anthropicBaseUrl }),
  });

  function buildRequest({ system, messages }) {
    return {
      model,
      max_tokens: llm.maxTokens,
      // The system prompt is its own parameter here, not message zero.
      system,
      messages,
      ...(temperature != null && { temperature }),
      output_config: { effort },
      // Thinking off buys the fastest reply, which is what speech needs.
      thinking: thinking === 'adaptive' ? { type: 'adaptive' } : { type: 'disabled' },
    };
  }

  async function generate({ system, messages, signal }) {
    const started = Date.now();
    let message;
    try {
      message = await client.messages.create(buildRequest({ system, messages }), { signal });
    } catch (err) {
      throw toLlmError(err, signal);
    }
    // A decline arrives as a normal 200 with an empty or partial content
    // array, so stop_reason is checked before the text is trusted.
    const text = (message.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return makeResult({
      text,
      provider: name,
      model: message.model || model,
      finish: FINISH[message.stop_reason] || 'stop',
      usage: {
        input: message.usage?.input_tokens,
        output: message.usage?.output_tokens,
        cached: message.usage?.cache_read_input_tokens,
      },
      started,
    });
  }

  return {
    name,
    model,
    buildRequest,
    generate,
    describe: () =>
      `anthropic ${model} (effort ${effort}, thinking ${thinking}${temperature != null ? `, temp ${temperature}` : ''}, max ${llm.maxTokens})`,
  };
}
