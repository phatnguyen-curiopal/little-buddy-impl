// The model gateway for a replayed year. Everything is the deterministic fake
// except the structured calls a real model would answer differently for every
// child: the learner and the episode summary answer from the history, and the
// diary and digest answer from what the backend put in their prompts.

import { seededUnit } from '../../src/character/mood.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import type { DiaryResult, DigestResult, EpisodeResult, LearnResult } from '../../src/gateway/schemas.ts';
import type { ModelGateway, StructuredRequest } from '../../src/gateway/types.ts';

const EMPTY_LEARN: LearnResult = { people: [], facts: [], events: [], promises: [], relationship: [], canon: [] };

// A few lines of each character's day per language, inside the plausible-life
// rule; the date picks which, so a diary is stable across runs.
const DIARY: Record<string, string[]> = {
  'Bo:Vietnamese': [
    'tớ đếm được mười hai giọt mưa đua nhau trên cửa sổ',
    'tớ mơ thấy mình bay qua một đám mây hình con cá',
    'tớ tập huýt sáo cả buổi sáng nhưng chỉ ra tiếng gió',
    'tớ nghe tiếng mưa rơi tí tách và ngân nga theo',
    'tớ nhìn thấy một chú chim đậu trên ban công',
    'tớ sưu tầm được một từ ngộ nghĩnh mới: lủng lẳng',
    'trời âm u nên tớ hơi lười một chút',
    'tớ thử kể một câu chuyện cười cho cái gối nghe',
  ],
  'Pip:Vietnamese': [
    'anh xây một tòa tháp tưởng tượng cao một trăm tầng',
    'anh đếm được ba mươi bảy ngôi sao qua cửa sổ',
    'anh tập đếm đến một nghìn và mới tới ba trăm',
    'tối qua trời nhiều mây nên anh không thấy sao nào',
    'anh nghĩ ra một trò chơi đua xe mới',
    'anh học thuộc tên tám hành tinh',
    'tòa tháp tưởng tượng của anh bị đổ, anh xây lại',
    'anh đếm ngược ba, hai, một rồi nhảy lên vui sướng',
  ],
  'Luna:English': [
    'I hummed a new song to the moon from the window',
    'I watched soft rain slide down the glass',
    'I practised drawing a perfect circle and it was almost round',
    'I learned the name of a new sea animal: the sea otter',
    'I collected three kind words today',
    'the night was cloudy, so I sang to where the moon should be',
    'I took three deep breaths and felt very calm',
    'I dreamed about a silver boat on a quiet sea',
  ],
};

const DIARY_CANON: Record<string, string[]> = {
  'Bo:Vietnamese': ['tớ có một bộ sưu tập từ ngộ nghĩnh', 'màu tớ thích nhất là màu vàng', 'tớ hay đếm đồ vật khi hồi hộp'],
  'Pip:Vietnamese': ['anh muốn xây tòa tháp cao nhất thế giới', 'màu anh thích nhất là màu xanh dương', 'anh kêu bíp bíp khi vui'],
  'Luna:English': ['my ears twitch when I think hard', 'my favourite colour is silver', 'I am learning a new song every week'],
};

const LOW = /\b(buồn|sợ|lo|giận|sad|scared|worried|upset|angry)\b/i;

function field(user: string, label: string): string {
  return new RegExp(`^${label}: (.*)$`, 'm').exec(user)?.[1]?.trim() ?? '';
}

function listOf(value: string, sep: string): string[] {
  return value && value !== 'none' && value !== 'nothing yet' ? value.split(sep).map((s) => s.trim()).filter(Boolean) : [];
}

function diaryFor(user: string): DiaryResult {
  const name = /^Character: ([^,]+),/m.exec(user)?.[1] ?? 'Bo';
  const language = field(user, 'Language').split('.')[0];
  const date = /Date: (\d{4}-\d{2}-\d{2})/.exec(user)?.[1] ?? '';
  const key = `${name}:${language}`;
  const lines = DIARY[key] ?? DIARY['Bo:Vietnamese'];
  const n = 1 + Math.floor(seededUnit(`${key}:${date}:n`) * 3);
  const entries = Array.from({ length: n }, (_, i) => {
    const r = seededUnit(`${key}:${date}:${i}`);
    return { story: lines[Math.floor(r * lines.length)], valence: (r < 0.15 ? 'grey' : r < 0.55 ? 'normal' : 'bright') as 'grey' | 'normal' | 'bright' };
  });
  // A new piece of canon on the first of some months, as a diary would.
  const canon = date.endsWith('-01') && Number(date.slice(5, 7)) % 4 === 1
    ? [{ statement: (DIARY_CANON[key] ?? [])[Math.floor(Number(date.slice(5, 7)) / 4) % 3], topic: 'self' }].filter((c) => c.statement)
    : [];
  return { entries, canon };
}

function digestFor(user: string): DigestResult {
  const points = listOf(field(user, 'Episodes'), ';');
  const feelings = listOf(field(user, 'Feelings'), ',');
  const learned = listOf(field(user, 'New things Buddy learned'), ';');
  const people = listOf(field(user, 'People mentioned'), ',');
  const low = feelings.filter((f) => LOW.test(f)).length;
  return {
    highlights: [...new Set(points)].slice(0, 3),
    new_interests: learned.slice(0, 3),
    mood_trend: !points.length ? 'a quiet week' : low >= 2 ? 'a few low moments' : 'mostly cheerful',
    people: people.slice(0, 5),
    conversation_starters: people.length ? [`Ask about ${people[0]}`, 'Ask about their favourite moment this week'] : ['Ask about their favourite moment this week'],
  };
}

// When the learn prompt lists the child's people as roster lines
// ("p1: Mướp (pet, ...)"), a model links each person it extracts by ref; so
// does this one, using the card the child meant for a misheard name.
function withRefs(lesson: LearnResult, user: string): LearnResult {
  const same = (s: string) => s.normalize('NFC').toLowerCase().trim();
  const refs = new Map<string, string>();
  for (const m of user.matchAll(/^(p\d+): (.+?) \(/gm)) refs.set(same(m[2]), m[1]);
  if (!refs.size) return lesson;
  return {
    ...lesson,
    people: lesson.people.map((p) => {
      const ref = refs.get(same((p as { means?: string }).means ?? p.name));
      return ref ? { ...p, ref } : p;
    }),
  };
}

export interface HistoryGateway extends ModelGateway {
  calls: Record<string, number>;
  misses: { episode: number };
  teach(childText: string, replyText: string, learned: LearnResult | null): void;
  summarise(transcript: string, episode: EpisodeResult): void;
}

// The transcript the nightly summary sends, built the same way, so the
// scripted summary is found by the exact prompt.
export function episodeTranscript(turns: { c: string; b: string }[]): string {
  return turns.map((t) => `Child: ${t.c}\nBuddy: ${t.b}`).join('\n').slice(0, 12_000);
}

export function createHistoryGateway(): HistoryGateway {
  const fake = createFakeGateway();
  const lessons = new Map<string, LearnResult>();
  const episodes = new Map<string, EpisodeResult>();
  const misses = { episode: 0 };

  return {
    ...fake,
    calls: fake.calls,
    misses,
    teach(childText, replyText, learned) {
      if (learned) lessons.set(`${childText}\u0000${replyText}`, learned);
    },
    summarise(transcript, episode) {
      episodes.set(transcript, episode);
    },
    async structured<T>(req: StructuredRequest): Promise<T> {
      fake.calls[`structured:${req.name}`] = (fake.calls[`structured:${req.name}`] ?? 0) + 1;
      if (req.name === 'learn') {
        const key = `${field(req.user, 'Child said')}\u0000${field(req.user, 'Buddy replied')}`;
        const lesson = lessons.get(key);
        return (lesson ? withRefs(lesson, req.user) : EMPTY_LEARN) as T;
      }
      if (req.name === 'episode') {
        const ep = episodes.get(req.user);
        if (!ep) misses.episode += 1;
        return (ep ?? { points: ['Trò chuyện với Buddy'], feelings: [], open_threads: [], category: 'other', importance: 1 }) as T;
      }
      if (req.name === 'diary') return diaryFor(req.user) as T;
      if (req.name === 'digest') return digestFor(req.user) as T;
      return fake.structured<T>(req);
    },
  };
}
