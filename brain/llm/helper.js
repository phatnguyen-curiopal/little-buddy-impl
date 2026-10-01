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

export function createHelper(client) {
  // Resolves to the parsed object, or {} when the model answered something
  // that is not JSON: a malformed extraction costs a lesson, never a turn.
  async function json({ model, system, user, serviceTier = '', signal }) {
    const response = await client.chat.completions.create(
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
    try {
      const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return { json };
}
