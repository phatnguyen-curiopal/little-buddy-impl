// Deterministic stand-ins for OpenAI and ElevenLabs: no keys, no cost, and
// the same output every run, so tests and local development exercise the
// whole pipeline. Replies stream in small chunks to exercise the parser.

import type { ChatMessage, Classification } from '../domain/types.ts';
import { nameKey } from '../memory/names.ts';
import type { DiaryResult, DigestResult, EpisodeResult, LearnResult } from './schemas.ts';
import { EMBEDDING_DIMS, type ModelGateway, type NameQuestion, type StructuredRequest } from './types.ts';

export interface FakeOptions {
  transcript?: string;
  replyFor?: (messages: ChatMessage[]) => string;
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Bag-of-words vectors: texts that share words land close together, which is
// enough to test ranking and merging without a real embedding model.
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const token of nameKey(text).split(/[^a-z0-9]+/).filter(Boolean)) v[hashToken(token) % EMBEDDING_DIMS] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function lastUser(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'user') return messages[i].content;
  return '';
}

// A name question is answered yes when the name appears with its capital in
// the middle of a sentence, the way the recogniser writes a name.
function fakeNames(text: string, names: NameQuestion[]): Classification['names'] {
  return names.map((n) => ({ ref: n.ref, meant: text.split(/(?<=[.!?])\s+/).some((s) => s.slice(1).includes(n.name)) }));
}

export function fakeClassify(text: string, names?: NameQuestion[]): Classification {
  return names?.length ? { ...fakeLabels(text), names: fakeNames(text, names) } : fakeLabels(text);
}

function fakeLabels(text: string): Classification {
  const t = nameKey(text);
  if (/\b(hit me|hurt me|hits me|danh con|danh em)\b/.test(t)) return { intent: 'feeling', feeling: 'scared', danger: 'hurt', severity: 'urgent' };
  if (/\b(nobody played|no one played|left out|khong ai choi)\b/.test(t)) return { intent: 'feeling', feeling: 'sad', danger: 'left_out', severity: 'concern' };
  if (/\b(sad|buon|cry|khoc)\b/.test(t)) return { intent: 'feeling', feeling: 'sad', danger: 'none', severity: 'none' };
  if (/\b(story|ke chuyen)\b/.test(t)) return { intent: 'story_request', feeling: 'happy', danger: 'none', severity: 'none' };
  if (t.includes('?')) return { intent: 'question', feeling: 'neutral', danger: 'none', severity: 'none' };
  return { intent: 'share', feeling: 'happy', danger: 'none', severity: 'none' };
}

function defaultReply(messages: ChatMessage[]): string {
  const said = lastUser(messages);
  const c = fakeClassify(said);
  if (c.feeling === 'sad' || c.feeling === 'scared') return '[face:sad][tone:softly] Oh no, I am sorry. I am right here with you. Do you want to tell me more?';
  if (c.intent === 'question') return '[face:curious][tone:curious] Hmm, that is a great question! What do you think the answer is?';
  return '[face:happy][tone:cheerful] Wowee, that sounds fun! [giggles] Tell me more about it.';
}

function fakeLearn(user: string): LearnResult {
  const out: LearnResult = { people: [], facts: [], events: [], promises: [], relationship: [], canon: [] };
  const said = (/Child said: (.*)/.exec(user)?.[1] ?? '').trim();
  const pet = /\b[Mm]y (dog|cat|bird|fish|rabbit) (?:is called |named )?([A-Z][a-z]+)/.exec(said);
  if (pet) out.people.push({ name: pet[2], kind: 'pet', relation: pet[1], details: null, feeling: 0.8 });
  const friend = /\b[Mm]y (?:best )?friend ([A-Z][a-z]+)/.exec(said);
  if (friend) out.people.push({ name: friend[1], kind: 'friend', relation: 'friend', details: null, feeling: 0.6 });
  const like = /I (?:love|like) ([a-z ]+)/i.exec(said);
  if (like) out.facts.push({ category: 'likes', statement: `likes ${like[1].trim()}`, about: null, confidence: 0.8, reality: 'real', sensitivity: 'normal', corrects: null });
  const fear = /(?:scared of|afraid of) ([a-z ]+)/i.exec(said);
  if (fear) out.facts.push({ category: 'fears', statement: `is scared of ${fear[1].trim()}`, about: null, confidence: 0.7, reality: 'real', sensitivity: 'normal', corrects: null });
  if (/tomorrow/i.test(said)) out.events.push({ kind: 'upcoming', description: said.slice(0, 80), date: null, person: null });
  const buddySaid = (/Buddy replied: (.*)/.exec(user)?.[1] ?? '');
  if (/I'll tell you tomorrow|tomorrow I will/i.test(buddySaid)) out.promises.push({ content: 'tell the child more tomorrow', due: null });
  if (/my favourite .+ is/i.test(buddySaid)) out.canon.push({ statement: /my favourite .+? is [^.!?]+/i.exec(buddySaid)![0], topic: 'favourites' });
  return out;
}

export function createFakeGateway(opts: FakeOptions = {}): ModelGateway & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const count = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };

  return {
    calls,
    async transcribe({ pcm }) {
      count('transcribe');
      return pcm.length < 3200 ? '' : (opts.transcript ?? 'My dog Mochi fell in a puddle');
    },
    // A word per 300 ms of audio, shown in a partial every 900 ms like the
    // realtime model's bursts, so the voice service can classify while the
    // child is talking.
    openTranscription({ onPartial }) {
      count('openTranscription');
      const words = (opts.transcript ?? 'My dog Mochi fell in a puddle').split(' ');
      let bytes = 0;
      let shown = 0;
      let closed = false;
      return {
        write(pcm) {
          if (closed) return;
          const burst = Math.floor(bytes / 28_800);
          bytes += pcm.length;
          if (Math.floor(bytes / 28_800) === burst) return;
          const n = Math.min(words.length, Math.floor(bytes / 9600));
          if (n > shown) {
            shown = n;
            onPartial?.(words.slice(0, n).join(' '));
          }
        },
        async finish() {
          closed = true;
          count('sttFinish');
          return bytes < 3200 ? '' : words.join(' ');
        },
        close() {
          closed = true;
        },
      };
    },
    async classify({ text, names }) {
      count('classify');
      return fakeClassify(text, names);
    },
    async *reply({ messages, signal, onUsage }) {
      count('reply');
      const text = (opts.replyFor ?? defaultReply)(messages);
      for (let i = 0; i < text.length; i += 7) {
        if (signal?.aborted) return;
        yield text.slice(i, i + 7);
      }
      onUsage?.({ inputTokens: 1000, cachedTokens: 0, outputTokens: Math.ceil(text.length / 4) });
    },
    async *speak({ text, signal }) {
      count('speak');
      // 60 ms of silence per character, in 100 ms chunks.
      let remaining = Math.max(1, text.length) * 1920;
      while (remaining > 0) {
        if (signal?.aborted) return;
        const n = Math.min(3200, remaining);
        remaining -= n;
        yield Buffer.alloc(n);
      }
    },
    async embed(texts) {
      count('embed');
      return texts.map(fakeEmbedding);
    },
    async moderate(text) {
      count('moderate');
      return text.includes('FLAGME') ? { flagged: true, categories: ['violence'] } : { flagged: false, categories: [] };
    },
    async structured<T>(req: StructuredRequest): Promise<T> {
      count(`structured:${req.name}`);
      if (req.name === 'classify') return fakeClassify(req.user) as T;
      if (req.name === 'learn') return fakeLearn(req.user) as T;
      if (req.name === 'episode') {
        const result: EpisodeResult = { points: ['Talked with Buddy'], feelings: ['happy'], open_threads: [], category: 'daily_life', importance: 2 };
        return result as T;
      }
      if (req.name === 'diary') {
        const result: DiaryResult = { entries: [{ story: 'watched raindrops race down the window and named the fastest one Zoom', valence: 'bright' }], canon: [] };
        return result as T;
      }
      if (req.name === 'digest') {
        const result: DigestResult = { highlights: ['Talked about pets'], new_interests: [], mood_trend: 'cheerful', people: [], conversation_starters: ['Ask about Mochi'] };
        return result as T;
      }
      return {} as T;
    },
  };
}
