// One turn, orchestration only: every decision lives in the module it
// names. The caller owns the AbortController (backend hang-up and the turn
// deadline both pull it) and gets back the response plus a `commit` to run
// only if the response actually reached the backend: history and learning
// never record a turn nobody heard.

import { LlmError, abortKind } from '../llm/result.js';
import { memoryBlock, nameContextBlock, nameFixBlock, namesBlock, profileBlock, summaryBlock } from '../memory/blocks.js';
import { trustedNames } from '../memory/names.js';
import { retrieve } from '../memory/retrieve.js';
import { loadLife } from '../persona/life.js';
import { buildSystemPrompt, withContext } from '../persona/prompt.js';
import { textFor } from '../persona/text/index.js';
import { dumpWav, BYTES_PER_SEC } from '../speech/wav.js';
import * as namesStore from '../store/names.js';
import { parseEmotion } from './emotion.js';

export const MIN_SPEECH_SEC = 0.3;
export const TEXT_MAX_CHARS = 2000;

function pick(lines, rand = Math.random) {
  return lines[Math.floor(rand() * lines.length) % lines.length];
}

export async function runTurn(deps, { meta, audio = null, text = null, signal }) {
  const { config, pool, llm, stt, tts, history, learner, log, debugFile } = deps;
  const started = Date.now();
  const timings = { stt: 0, memory: 0, llm: 0, tts: 0, total: 0 };
  const { subject, conversation_id: conversationId, settings, buddy, child } = meta;
  const lang = settings.language;
  const t = textFor(lang);
  const memoryOn = config.memory.enabled;

  // Independent of the input, so both start before STT.
  const namesPromise =
    memoryOn && config.memory.names
      ? namesStore.all(pool, subject).catch((err) => {
          log.warn('names_load_failed', { turn_id: meta.turn_id, err_name: err?.name });
          return [];
        })
      : Promise.resolve([]);
  const lifePromise = loadLife(pool, {
    config,
    deviceId: meta.device_id,
    buddy,
    lang,
    moodPin: settings.mood_pin,
  }).catch((err) => {
    log.warn('botlife_load_failed', { turn_id: meta.turn_id, err_name: err?.name });
    return { block: '', score: null };
  });

  // TTS failure costs the audio, never the turn; only a backend hang-up
  // propagates, because then there is nobody left to answer.
  async function speak(line) {
    if (!config.speech.ttsEnabled || !settings.voice_id) return null;
    const began = Date.now();
    try {
      return await tts.synthesize({ text: line, voiceId: settings.voice_id, languageCode: t.languageCode, signal });
    } catch (err) {
      if (abortKind(signal) === 'closed') throw err;
      log.warn('tts_failed', { turn_id: meta.turn_id, err_kind: err?.kind, err_status: err?.status });
      return null;
    } finally {
      timings.tts = Date.now() - began;
    }
  }

  function respond({ noSpeech, heard, reply, emotion, voice, provider, model, usage }) {
    timings.total = Date.now() - started;
    return {
      no_speech: noSpeech,
      heard,
      reply,
      emotion,
      audio_b64: voice ? voice.pcm.toString('base64') : null,
      audio_rate: voice ? voice.rate : null,
      provider,
      model,
      usage,
      timings_ms: timings,
    };
  }

  async function noSpeech(heard) {
    const reply = pick(t.noSpeech[buddy.role] || t.noSpeech.friend);
    const voice = await speak(reply);
    return {
      response: respond({
        noSpeech: true,
        heard,
        reply,
        emotion: 'confused',
        voice,
        provider: llm.name,
        model: llm.model,
        usage: { input: 0, output: 0, cached: 0 },
      }),
      commit: () => {},
    };
  }

  const names = await namesPromise;

  // --- Input -----------------------------------------------------------------
  let heard;
  const isVoice = Boolean(audio);
  if (isVoice) {
    if (audio.length < MIN_SPEECH_SEC * BYTES_PER_SEC) return noSpeech('');
    const began = Date.now();
    try {
      heard = await stt.transcribe({
        pcm: audio,
        languageCode: t.languageCode,
        // Only trusted names bias the recognizer; a trusted mishearing would
        // teach it the mistake.
        keyterms: trustedNames(names, config.memory.nameTrust).map((row) => row.display),
        signal,
      });
    } finally {
      timings.stt = Date.now() - began;
      dumpWav(config.debug.sttDumpWav, audio, meta.turn_id);
    }
    if (!heard) return noSpeech('');
  } else {
    heard = String(text).trim().slice(0, TEXT_MAX_CHARS);
  }

  // --- Memory ----------------------------------------------------------------
  const past = history.get(subject, conversationId);
  let mem = null;
  if (memoryOn) {
    mem = await retrieve(deps, {
      subject,
      conversationId,
      text: heard,
      isVoice,
      names,
      // Exchanges already in the rolling history would only waste space.
      exclude: past.filter((m) => m.role === 'user').map((m) => m.content),
      lang,
      signal,
    });
    timings.memory = mem.ms;
  }

  // --- Prompt ----------------------------------------------------------------
  const life = await lifePromise;
  const staticPrompt = buildSystemPrompt({
    lang,
    buddy,
    child,
    life: life.block,
    override: config.llm.systemPromptOverride,
  });
  const m = config.memory;
  const system = mem
    ? withContext(staticPrompt, [
        m.names ? namesBlock(names, { trust: m.nameTrust, lang }) : '',
        nameFixBlock(mem.fixes, { lang }),
        m.nameContext ? nameContextBlock(names, mem.spoken, { lang }) : '',
        m.profile ? profileBlock(mem.facts, { lang }) : '',
        m.summary
          ? summaryBlock({
              current: mem.current,
              recent: mem.recent,
              past: mem.past,
              exclude: mem.convIds,
              retrieval: m.retrieval !== 'verbatim',
              verbatim: m.retrieval !== 'summary',
              lang,
            })
          : '',
        memoryBlock(mem.groups, { lang }),
      ])
    : staticPrompt;
  // The raw words go to the model: history must be what was actually said,
  // and the corrector's conclusion rides in the name-fix block instead.
  const messages = [...past, { role: 'user', content: heard }];
  debugFile?.write(
    [
      `turn ${meta.turn_id} -> request to llm`,
      '--- system ---',
      system,
      `--- messages (${messages.length}) ---`,
      ...messages.map((msg) => `[${msg.role}] ${msg.content}`),
    ].join('\n'),
  );

  // --- Reply -----------------------------------------------------------------
  const llmStarted = Date.now();
  let result;
  try {
    result = await llm.generate({ system, messages, signal });
  } finally {
    timings.llm = Date.now() - llmStarted;
  }
  const { emotion, clean, tagged } = parseEmotion(result.text);
  if (!clean) throw new LlmError('empty', 'reply was only a tag');
  // A prompt regression that stops the tags would otherwise look like a run
  // of calm faces; this makes it countable in the logs.
  if (!tagged) log.warn('emotion_tag_missing', { turn_id: meta.turn_id });
  debugFile?.write(`turn ${meta.turn_id} <- reply: ${JSON.stringify(result.text)}\n${'='.repeat(72)}`);
  if (result.moderation?.flagged) {
    log.warn('moderation_flagged', { turn_id: meta.turn_id, categories: result.moderation.top });
  }

  const voice = await speak(clean);

  const response = respond({
    noSpeech: false,
    heard,
    reply: clean,
    emotion,
    voice,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });

  return {
    response,
    commit() {
      // The tagged reply goes into history so the model keeps tagging.
      history.append(subject, conversationId, heard, result.text.trim());
      if (memoryOn && settings.learn) {
        learner.learn({
          subject,
          conversationId,
          userText: heard,
          spokenText: mem?.spoken || heard,
          assistantText: clean,
          lang,
        });
      }
    },
  };
}
