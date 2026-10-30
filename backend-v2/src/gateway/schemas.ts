// JSON schemas for OpenAI structured outputs. Strict mode needs every
// property listed in required and additionalProperties false, so optional
// values are typed as nullable instead of being left out.

const str = { type: 'string' } as const;
const nullableStr = { type: ['string', 'null'] } as const;
const strList = { type: 'array', items: str } as const;
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: values });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const listOf = (properties: Record<string, unknown>) => ({ type: 'array', items: obj(properties) });

export const INTENTS = ['question', 'share', 'play', 'story_request', 'feeling', 'about_buddy', 'other'] as const;
export const FEELINGS = ['happy', 'excited', 'neutral', 'sad', 'scared', 'angry', 'bored'] as const;
export const DANGERS = ['none', 'hurt', 'abuse', 'bullying', 'self_harm', 'unsafe', 'personal_info', 'left_out'] as const;
export const SEVERITIES = ['none', 'info', 'concern', 'urgent'] as const;
export const PERSON_KINDS = ['family', 'relative', 'friend', 'classmate', 'teacher', 'helper', 'pet', 'pretend', 'toy', 'place', 'other'] as const;
export const FACT_CATEGORIES = [
  'basics', 'likes', 'dislikes', 'fears', 'strengths', 'growing_edges', 'feelings',
  'routines', 'passions', 'play_style', 'dreams', 'family', 'other',
] as const;
export const EPISODE_CATEGORIES = ['family', 'school', 'friends', 'pets', 'feelings', 'play', 'daily_life', 'other'] as const;
export const TRAITS = ['outgoing', 'cautious', 'sensitive', 'persistent', 'curious'] as const;
export type Trait = (typeof TRAITS)[number];

export const CLARITY = ['clear', 'unsure', 'unclear'] as const;

export const CLASSIFY_SCHEMA = obj({
  meant: str,
  clarity: enumOf(CLARITY),
  intent: enumOf(INTENTS),
  feeling: enumOf(FEELINGS),
  danger: enumOf(DANGERS),
  severity: enumOf(SEVERITIES),
  names: listOf({ ref: str, meant: { type: 'boolean' } }),
});

export interface LearnResult {
  // ref, called and also_word are always sent by the live model; scripted
  // learners may leave them out.
  people: {
    name: string;
    kind: (typeof PERSON_KINDS)[number];
    relation: string | null;
    details: string | null;
    feeling: number;
    ref?: string | null;
    called?: string | null;
    also_word?: string | null;
  }[];
  facts: {
    category: (typeof FACT_CATEGORIES)[number];
    statement: string;
    about: string | null;
    confidence: number;
    reality: 'real' | 'pretend';
    sensitivity: 'normal' | 'sensitive';
    corrects: string | null;
  }[];
  events: { kind: 'routine' | 'upcoming' | 'milestone'; description: string; date: string | null; person: string | null }[];
  promises: { content: string; due: string | null }[];
  relationship: { kind: 'inside_joke' | 'nickname' | 'ritual' | 'shared_story' | 'secret_greeting'; content: string }[];
  canon: { statement: string; topic: string | null }[];
  // Second-language words met in play (bilingual mode or an English goal).
  words?: { word: string; language: 'vi' | 'en'; meaning: string | null; by: 'buddy' | 'child' }[];
  // Words speech recognition got wrong for this child, and the child's own
  // words a recogniser may miss.
  misheard?: { heard: string; meant: string }[];
  terms?: string[];
}

export const LEARN_SCHEMA = obj({
  people: listOf({
    name: str,
    kind: enumOf(PERSON_KINDS),
    relation: nullableStr,
    details: nullableStr,
    feeling: { type: 'number' },
    ref: nullableStr,
    called: nullableStr,
    also_word: nullableStr,
  }),
  facts: listOf({
    category: enumOf(FACT_CATEGORIES),
    statement: str,
    about: nullableStr,
    confidence: { type: 'number' },
    reality: enumOf(['real', 'pretend']),
    sensitivity: enumOf(['normal', 'sensitive']),
    corrects: nullableStr,
  }),
  events: listOf({ kind: enumOf(['routine', 'upcoming', 'milestone']), description: str, date: nullableStr, person: nullableStr }),
  promises: listOf({ content: str, due: nullableStr }),
  relationship: listOf({ kind: enumOf(['inside_joke', 'nickname', 'ritual', 'shared_story', 'secret_greeting']), content: str }),
  canon: listOf({ statement: str, topic: nullableStr }),
  words: listOf({ word: str, language: enumOf(['vi', 'en']), meaning: nullableStr, by: enumOf(['buddy', 'child']) }),
  misheard: listOf({ heard: str, meant: str }),
  terms: strList,
});

export interface TraitsResult {
  traits: { name: Trait; value: number; evidence: string }[];
}

export const TRAITS_SCHEMA = obj({
  traits: listOf({ name: enumOf(TRAITS), value: { type: 'number' }, evidence: str }),
});

export interface EpisodeResult {
  points: string[];
  feelings: string[];
  open_threads: string[];
  category: (typeof EPISODE_CATEGORIES)[number];
  importance: number;
}

export const EPISODE_SCHEMA = obj({
  points: strList,
  feelings: strList,
  open_threads: strList,
  category: enumOf(EPISODE_CATEGORIES),
  importance: { type: 'integer' },
});

export interface DiaryResult {
  entries: { story: string; valence: 'bright' | 'normal' | 'grey' }[];
  canon: { statement: string; topic: string | null }[];
}

export const DIARY_SCHEMA = obj({
  entries: listOf({ story: str, valence: enumOf(['bright', 'normal', 'grey']) }),
  canon: listOf({ statement: str, topic: nullableStr }),
});

export interface DigestResult {
  highlights: string[];
  new_interests: string[];
  mood_trend: string;
  people: string[];
  conversation_starters: string[];
}

export const DIGEST_SCHEMA = obj({
  highlights: strList,
  new_interests: strList,
  mood_trend: str,
  people: strList,
  conversation_starters: strList,
});
