import type { Config } from '../config.ts';
import type { Classification } from '../domain/types.ts';
import type { Logger } from '../log.ts';
import { GatewayError } from '../util/errors.ts';
import { createElevenLabs } from './elevenlabs.ts';
import { createOpenAi } from './openai.ts';
import { bufferedStt, createRealtimeStt } from './realtime-stt.ts';
import { CLASSIFY_SCHEMA } from './schemas.ts';
import type { ModelGateway, NameQuestion } from './types.ts';

const CLASSIFY_SYSTEM = [
  'You label one thing a child aged 4 to 8 just said to their toy friend. Return only the JSON.',
  'The words come from speech recognition listening to a young child: sounds may be mispronounced or misheard as other real',
  'words (l for r, ch for tr, dropped or changed sounds; w for r or l in English: "đau lăn" may be "đau răng", "cái chăn" may',
  'be "cái trăng" when the toy asked about the sky). meant: what the child most likely said, using what the toy said just',
  'before and the child\'s speech habits; the words as heard when they are clear. clarity: clear (thinking sounds such as "ừm",',
  '"ờ" are clear: they are thinking); unsure when meant is a guess that changes the answer; unclear when the words are garbled',
  'and you cannot tell what they mean. Label everything below by what they most likely meant.',
  'intent: question, share (telling news), play, story_request, feeling (talking about how they feel), about_buddy (asking about the toy), or other.',
  'feeling: how the child sounds right now.',
  'danger: none, unless the child says that someone hurts them or they are injured (hurt), describes abuse (abuse),',
  'is bullied (bullying), talks about hurting themselves (self_harm), is in a dangerous situation such as being alone',
  'with a stranger or near fire (unsafe), shares an address, phone number, school name or password (personal_info),',
  'or is left out by other children (left_out).',
  'severity: none when danger is none; info for a mild worry; concern for being left out, bullying or unkind words;',
  'urgent for being hurt, abuse, an unsafe situation or self-harm talk.',
  'names: one entry per listed name ref. meant is true only when the child means that named one ("bạn Mít", "con chó',
  'Mực sủa"), false for the ordinary word ("ăn mít", "nấu mực") or someone else with that name. An empty list when no',
  'names are listed.',
].join('\n');

// The questions go in the user message so the system prompt stays one
// cacheable prefix for every turn.
export function classifyUser(
  text: string,
  language: string,
  names: NameQuestion[] = [],
  before: string | null = null,
  habits: [string, string][] = [],
): string {
  const lines = [`Language: ${language}`];
  if (before) lines.push(`The toy said just before: ${before.slice(0, 300)}`);
  if (habits.length) lines.push(`This child's speech habits (heard, then meant): ${habits.map(([h, m]) => `"${h}" for "${m}"`).join('; ')}`);
  lines.push(`The child said: ${text}`);
  if (names.length) {
    lines.push('Names to check:');
    for (const n of names) lines.push(`${n.ref}: ${n.name}, ${n.who}${n.word ? `; also the word "${n.name.toLowerCase()}" (${n.word})` : ''}`);
  }
  return lines.join('\n');
}

export function createLiveGateway(config: Config, log: Logger, fetchImpl: typeof fetch = fetch): ModelGateway {
  const openai = createOpenAi(config.openai, fetchImpl);
  const eleven = createElevenLabs(config.elevenlabs, fetchImpl);
  const batch = (pcm: Buffer, opts: { language: 'vi' | 'en'; keyterms: string[]; signal?: AbortSignal }) =>
    eleven.transcribe({ pcm, language: opts.language, keyterms: opts.keyterms, signal: opts.signal });
  const openStream = config.elevenlabs.sttStreaming
    ? createRealtimeStt(config.elevenlabs, batch, (reason) => log.warn('stt stream fell back to batch', { reason }))
    : bufferedStt(batch);

  return {
    transcribe: (input) => eleven.transcribe(input),
    openTranscription: (opts) => openStream(opts),

    classify: ({ text, language, names, before, habits, signal }) =>
      openai.chatJson<Classification>({
        model: config.openai.fastModel,
        name: 'classify',
        schema: CLASSIFY_SCHEMA,
        system: CLASSIFY_SYSTEM,
        user: classifyUser(text, language, names, before, habits),
        effort: config.openai.fastEffort,
        signal,
      }),

    reply: ({ messages, cacheKey, signal, onUsage }) =>
      openai.chatStream({
        model: config.openai.replyModel,
        messages,
        maxTokens: 1200,
        effort: config.openai.replyEffort,
        cacheKey,
        signal,
        onUsage,
      }),

    async *speak({ text, voiceId, language, signal }) {
      let started = false;
      try {
        for await (const chunk of eleven.speakStream({ text, voiceId, language, model: config.elevenlabs.ttsModel, signal })) {
          started = true;
          yield chunk;
        }
      } catch (err) {
        // Once audio has started, a retry would repeat words the child already heard.
        if (started || (err as GatewayError).kind === 'aborted') throw err;
        log.warn('tts failed, retrying on fallback model', { kind: (err as GatewayError).kind, status: (err as GatewayError).status });
        yield* eleven.speakStream({ text, voiceId, language, model: config.elevenlabs.ttsFallbackModel, signal });
      }
    },

    embed: (texts, signal) => openai.embeddings(texts, signal),
    moderate: (text, signal) => openai.moderation(text, signal),

    structured: ({ tier, name, schema, system, user, signal }) =>
      openai.chatJson({
        model: tier === 'fast' ? config.openai.fastModel : config.openai.backgroundModel,
        name,
        schema,
        system,
        user,
        effort: tier === 'fast' ? config.openai.fastEffort : config.openai.backgroundEffort,
        signal,
      }),
  };
}

export { GatewayError };
