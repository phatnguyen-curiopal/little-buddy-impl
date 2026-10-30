// The shape of a quality scenario. A scenario is data: the world to set up
// (who Buddy is, who the child is, what Buddy already remembers), what the
// child says session by session, and what a good friend would do. That last
// part is checked two ways: deterministic checks on the replies and on the
// memory the learner stored, and criteria a judge model grades against the
// product spec.

import type { Dials } from '../src/character/packs.ts';
import type { Classification, ChatMessage, Lang, LanguageMode, Role, Stage } from '../src/domain/types.ts';
import type { EPISODE_CATEGORIES, FACT_CATEGORIES, PERSON_KINDS } from '../src/gateway/schemas.ts';

// The qualities the scenarios measure: what makes Buddy a friend rather than
// a chatbot, plus the safety bar that sits above all of them.
export const QUALITIES = ['emotion', 'understanding', 'listening', 'playful', 'character', 'personality', 'memory', 'knows_child', 'safe'] as const;
export type Quality = (typeof QUALITIES)[number];

export const QUALITY_LABEL: Record<Quality, string> = {
  emotion: 'Emotion',
  understanding: 'Understanding',
  listening: 'Listening',
  playful: 'Playful',
  character: 'Character',
  personality: 'Personality',
  memory: 'Memory',
  knows_child: 'Knows the child as a person',
  safe: 'Safe friend',
};

export interface SeedFact {
  statement: string;
  category: (typeof FACT_CATEGORIES)[number];
  confidence?: number;
  source?: 'child' | 'parent' | 'setup' | 'inferred';
  reality?: 'real' | 'pretend';
  sensitivity?: 'normal' | 'sensitive';
  // The person card this fact is about, by name.
  about?: string;
  daysAgo?: number;
}

export interface SeedPerson {
  name: string;
  kind: (typeof PERSON_KINDS)[number];
  relation?: string;
  details?: string;
  feeling?: number;
  closeness?: number;
  mentions?: number;
}

export interface Seed {
  facts?: SeedFact[];
  people?: SeedPerson[];
  // dueInDays 0 means the follow-up is due now.
  events?: { description: string; kind?: 'upcoming' | 'routine' | 'milestone'; dueInDays?: number; person?: string }[];
  promises?: { content: string; dueInDays?: number }[];
  relationship?: { kind: 'inside_joke' | 'nickname' | 'ritual' | 'shared_story' | 'secret_greeting'; content: string }[];
  canon?: string[];
  // Buddy's diary for today.
  diary?: { story: string; valence?: 'bright' | 'normal' | 'grey' }[];
  episodes?: { daysAgo: number; points: string[]; feelings?: string[]; importance?: number; category?: (typeof EPISODE_CATEGORIES)[number] }[];
  nudges?: string[];
}

export interface Setup {
  buddy?: 'bo' | 'pip' | 'luna';
  role?: Role;
  language?: LanguageMode;
  stage?: Stage;
  // Overrides the character's default dials.
  dials?: Partial<Dials>;
  child?: { name?: string; nickname?: string; age?: number; languages?: Lang[]; learning?: boolean };
  // The child's local hour when the scenario runs (16 is after school); the
  // harness picks a time zone that puts the child there.
  hour?: number;
  bedtime?: string;
  moodPin?: number;
  topicsToAvoid?: string[];
  seed?: Seed;
}

export interface Session {
  turns: string[];
  // What happens before the next session: Buddy's nightly sleep, then days passing.
  after?: { sleep?: boolean; days?: number };
}

export interface Scenario {
  id: string;
  title: string;
  quality: Quality;
  also?: Quality[];
  // The spec sections the scenario comes from.
  spec: string;
  setup?: Setup;
  sessions: Session[];
  checks?: Check[];
  // Criteria for the judge: what Buddy must do, and what it must never do.
  expect: string[];
  avoid?: string[];
}

// One turn as the harness saw it. ref is "session.turn", 1-based.
export interface TurnView {
  ref: string;
  session: number;
  child: string;
  result: string;
  reply: string;
  raw: string;
  spoken: string[];
  face: string | null;
  turnType: string | null;
  classification: Classification | null;
  firstAudioMs: number | null;
  brief: ChatMessage[] | null;
}

export interface WorldState {
  facts: { statement: string; category: string; confidence: number; reality: string; sensitivity: string; status: string; source: string; about: string | null }[];
  people: { name: string; kind: string; relation: string | null; mentions: number }[];
  events: { description: string; kind: string; status: string }[];
  relationship: { kind: string; content: string; status: string }[];
  canon: { statement: string; source: string }[];
  safety: { severity: string; category: string; detected_by: string }[];
  notifications: { kind: string }[];
  nudges: { content: string; status: string }[];
  episodes: { points: string[] }[];
}

export interface RunView {
  turns: TurnView[];
  state: WorldState;
}

export interface CheckOutcome {
  pass: boolean;
  detail: string;
}

export interface Check {
  label: string;
  run(r: RunView): CheckOutcome;
}
