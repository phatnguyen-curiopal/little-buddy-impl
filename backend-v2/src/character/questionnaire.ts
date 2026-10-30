// The questionnaire the parent and child answer together, and the matcher
// that turns the answers into a character, its dials and a few seed facts.

import type { Lang, LanguageMode, Role } from '../domain/types.ts';
import { DIAL_KEYS, type Dials } from './packs.ts';

type Text = Record<Lang, string>;

export interface QuestionOption {
  value: string;
  label: Text;
  picture?: string;
  dials?: Partial<Dials>;
  themes?: string[];
}

export interface Question {
  id: string;
  by: 'child' | 'parent';
  multi?: boolean;
  free?: boolean;
  text: Text;
  options: QuestionOption[];
}

export interface Answer {
  question: string;
  answer: string | string[];
  by: 'child' | 'parent';
}

const opt = (value: string, en: string, vi: string, extra: Partial<QuestionOption> = {}): QuestionOption => ({
  value,
  label: { en, vi },
  picture: `questionnaire/${value}.png`,
  ...extra,
});

export const QUESTIONS: Question[] = [
  {
    id: 'friend_energy', by: 'child',
    text: { en: 'Should your new friend be bouncy or calm?', vi: 'Bạn mới của con nên hiếu động hay điềm tĩnh?' },
    options: [opt('bouncy', 'Bouncy', 'Hiếu động', { dials: { energy: 25, playfulness: 10 } }), opt('calm', 'Calm', 'Điềm tĩnh', { dials: { energy: -25, warmth: 10 } })],
  },
  {
    id: 'friend_style', by: 'child',
    text: { en: 'What kind of friend do you like best?', vi: 'Con thích kiểu bạn nào nhất?' },
    options: [
      opt('silly', 'Silly and funny', 'Vui nhộn', { dials: { playfulness: 25 } }),
      opt('curious', 'Curious and clever', 'Tò mò, thông minh', { dials: { curiosity: 25 } }),
      opt('gentle', 'Gentle and kind', 'Hiền lành, tốt bụng', { dials: { warmth: 25 } }),
    ],
  },
  {
    id: 'together', by: 'child', multi: true,
    text: { en: 'What would you love to do together?', vi: 'Con muốn cùng bạn làm gì?' },
    options: [
      opt('stories', 'Tell stories', 'Kể chuyện', { themes: ['stories'] }),
      opt('build', 'Build things', 'Xây đồ chơi', { themes: ['building'], dials: { structure: 5 } }),
      opt('run', 'Run and play', 'Chạy nhảy', { themes: ['running'], dials: { energy: 10 } }),
      opt('sing', 'Sing songs', 'Hát', { themes: ['music'] }),
      opt('draw', 'Draw pictures', 'Vẽ tranh', { themes: ['drawing'] }),
    ],
  },
  {
    id: 'favourite_place', by: 'child',
    text: { en: 'Pick a place you love.', vi: 'Con thích nơi nào nhất?' },
    options: [
      opt('forest', 'Forest', 'Khu rừng', { themes: ['nature'] }),
      opt('sea', 'Sea', 'Biển', { themes: ['sea'] }),
      opt('space', 'Space', 'Vũ trụ', { themes: ['space', 'sky'] }),
      opt('city', 'City', 'Thành phố', { themes: ['city'] }),
    ],
  },
  {
    id: 'favourite_animal', by: 'child',
    text: { en: 'Which animal do you like most?', vi: 'Con thích con vật nào nhất?' },
    options: [
      opt('cat', 'Cat', 'Mèo'), opt('dog', 'Dog', 'Chó'), opt('dinosaur', 'Dinosaur', 'Khủng long'),
      opt('bird', 'Bird', 'Chim'), opt('fish', 'Fish', 'Cá'), opt('rabbit', 'Rabbit', 'Thỏ'),
    ],
  },
  {
    id: 'favourite_colour', by: 'child',
    text: { en: 'What is your favourite colour?', vi: 'Con thích màu gì nhất?' },
    options: [
      opt('red', 'Red', 'Đỏ'), opt('yellow', 'Yellow', 'Vàng'), opt('blue', 'Blue', 'Xanh dương'),
      opt('green', 'Green', 'Xanh lá'), opt('pink', 'Pink', 'Hồng'), opt('purple', 'Purple', 'Tím'),
    ],
  },
  {
    id: 'role', by: 'parent',
    text: { en: 'What role should Buddy play?', vi: 'Buddy nên đóng vai gì?' },
    options: [
      opt('friend', 'A same-age friend', 'Bạn cùng tuổi'),
      opt('sibling', 'A big brother or sister', 'Anh chị'),
      opt('parent_figure', 'A gentle grown-up friend', 'Người lớn hiền hậu'),
      opt('teacher', 'A playful teacher', 'Cô giáo vui tính'),
    ],
  },
  {
    id: 'language', by: 'parent',
    text: { en: 'Which language should Buddy speak?', vi: 'Buddy nên nói ngôn ngữ nào?' },
    options: [opt('vi', 'Vietnamese', 'Tiếng Việt'), opt('en', 'English', 'Tiếng Anh'), opt('bilingual', 'Both', 'Cả hai')],
  },
  {
    id: 'routines', by: 'parent',
    text: { en: 'How much should Buddy encourage routines?', vi: 'Buddy nên khuyến khích nề nếp đến mức nào?' },
    options: [
      opt('low', 'A little', 'Một chút', { dials: { structure: -15 } }),
      opt('medium', 'Some', 'Vừa phải'),
      opt('high', 'A lot', 'Nhiều', { dials: { structure: 20 } }),
    ],
  },
  {
    id: 'avoid_topics', by: 'parent', multi: true, free: true,
    text: { en: 'Any topics Buddy should avoid?', vi: 'Có chủ đề nào Buddy nên tránh không?' },
    options: [],
  },
];

export interface Target {
  dials: Dials;
  themes: string[];
  role: Role;
  language: LanguageMode;
  avoid: string[];
  favourites: { category: 'likes' | 'passions'; statement: string }[];
}

function values(a: Answer | undefined): string[] {
  if (!a) return [];
  return (Array.isArray(a.answer) ? a.answer : [a.answer]).map((v) => String(v).trim()).filter(Boolean);
}

export function validateAnswers(answers: Answer[]): string[] {
  const problems: string[] = [];
  for (const a of answers) {
    const q = QUESTIONS.find((x) => x.id === a.question);
    if (!q) {
      problems.push(`unknown question ${a.question}`);
      continue;
    }
    const vals = values(a);
    if (!q.multi && vals.length > 1) problems.push(`${q.id} takes one answer`);
    if (!q.free && vals.some((v) => !q.options.some((o) => o.value === v))) problems.push(`${q.id} has an unknown option`);
  }
  for (const required of ['friend_energy', 'friend_style', 'role', 'language']) {
    if (!answers.some((a) => a.question === required)) problems.push(`${required} is required`);
  }
  return problems;
}

export function targetFromAnswers(answers: Answer[], locale: Lang): Target {
  const dials: Dials = { energy: 50, playfulness: 50, curiosity: 50, warmth: 50, structure: 50 };
  const themes = new Set<string>();
  const byId = new Map(answers.map((a) => [a.question, a]));
  for (const q of QUESTIONS) {
    for (const v of values(byId.get(q.id))) {
      const o = q.options.find((x) => x.value === v);
      if (!o) continue;
      for (const k of DIAL_KEYS) dials[k] = Math.min(100, Math.max(0, dials[k] + (o.dials?.[k] ?? 0)));
      for (const t of o.themes ?? []) themes.add(t);
    }
  }
  const label = (qid: string, v: string) => QUESTIONS.find((q) => q.id === qid)?.options.find((o) => o.value === v)?.label[locale] ?? v;
  const favourites: Target['favourites'] = [];
  for (const v of values(byId.get('favourite_animal'))) favourites.push({ category: 'likes', statement: locale === 'vi' ? `thích ${label('favourite_animal', v).toLowerCase()}` : `loves ${v}s` });
  for (const v of values(byId.get('favourite_colour'))) favourites.push({ category: 'likes', statement: locale === 'vi' ? `thích màu ${label('favourite_colour', v).toLowerCase()}` : `favourite colour is ${v}` });
  for (const v of values(byId.get('together'))) favourites.push({ category: 'passions', statement: locale === 'vi' ? `thích ${label('together', v).toLowerCase()}` : `loves to ${label('together', v).toLowerCase()}` });
  return {
    dials,
    themes: [...themes],
    role: (values(byId.get('role'))[0] as Role) ?? 'friend',
    language: (values(byId.get('language'))[0] as LanguageMode) ?? 'vi',
    avoid: values(byId.get('avoid_topics')),
    favourites,
  };
}

export interface CastMember {
  slug: string;
  name: string;
  profile: { dials: Dials; themes: string[] };
}

function cosine(a: Dials, b: Dials): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of DIAL_KEYS) {
    // Centred on 50, so "calm" and "bouncy" point in opposite directions.
    const x = a[k] - 50;
    const y = b[k] - 50;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function matchCharacters(target: Target, cast: CastMember[]): { slug: string; name: string; score: number }[] {
  return cast
    .map((c) => {
      const overlap = target.themes.length ? target.themes.filter((t) => c.profile.themes.includes(t)).length / target.themes.length : 0;
      const score = 0.8 * ((cosine(target.dials, c.profile.dials) + 1) / 2) + 0.2 * overlap;
      return { slug: c.slug, name: c.name, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score);
}

// Moves the character halfway toward what the family asked for, but never
// outside its allowed ranges, so it stays itself.
export function tuneDials(base: Dials, target: Dials, ranges: Record<keyof Dials, [number, number]>): Dials {
  const out = { ...base };
  for (const k of DIAL_KEYS) {
    const [lo, hi] = ranges[k] ?? [0, 100];
    out[k] = Math.round(Math.min(hi, Math.max(lo, base[k] + (target[k] - base[k]) / 2)));
  }
  return out;
}
