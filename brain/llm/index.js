// Strategy registry: the turn asks for `generate` and never learns which
// vendor answered. A refusal or an empty reply is an error kind here, in one
// place, rather than a check every provider repeats.

import * as anthropic from './providers/anthropic.js';
import * as openai from './providers/openai.js';
import * as qwen from './providers/qwen.js';
import { LlmError } from './result.js';

export const providers = { openai, anthropic, qwen };

export function createLlm(config, { warn = () => {}, llmLog = null } = {}) {
  if (!config.llm.enabled) {
    return {
      name: config.llm.provider,
      model: 'off',
      describe: () => 'llm off (LLM_ENABLED=0)',
      generate: async () => {
        throw new LlmError('upstream', 'llm disabled');
      },
    };
  }
  const provider = providers[config.llm.provider].create(config, { warn });
  return {
    name: provider.name,
    model: provider.model,
    describe: provider.describe,
    buildRequest: provider.buildRequest,
    async generate(args) {
      const started = Date.now();
      const asked = { purpose: 'reply', system: args.system, messages: args.messages };
      let result;
      try {
        result = await provider.generate(args);
      } catch (err) {
        llmLog?.record({ ...asked, provider: provider.name, model: provider.model, ms: Date.now() - started, error: err });
        throw err;
      }
      // Logged before the checks below, so a refusal or an empty reply is
      // on record with the prompt that caused it.
      llmLog?.record({
        ...asked,
        provider: result.provider,
        model: result.model,
        ms: Date.now() - started,
        finish: result.finish,
        usage: result.usage,
        flagged: Boolean(result.moderation?.flagged),
        answer: result.text,
      });
      if (result.finish === 'refusal') throw new LlmError('refusal', 'model declined the request');
      if (!result.text.trim()) throw new LlmError('empty', 'empty reply');
      return result;
    },
  };
}
