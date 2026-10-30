// The shape of a child's year with Buddy, as test data. A history is written
// by hand where it matters (story sessions, parent actions) and filled in by
// routine chats on a weekly rhythm, so a year has realistic volume without a
// year of hand-written transcripts. plan.ts expands it deterministically.

import type { Answer } from '../../src/character/questionnaire.ts';
import type { ChildFeeling, Danger, Emotion, Intent, Severity } from '../../src/domain/types.ts';
import type { EPISODE_CATEGORIES, FACT_CATEGORIES, PERSON_KINDS } from '../../src/gateway/schemas.ts';

export type FactCategory = (typeof FACT_CATEGORIES)[number];
export type PersonKind = (typeof PERSON_KINDS)[number];
export type EpisodeCategory = (typeof EPISODE_CATEGORIES)[number];
export type Lang = 'vi' | 'en';

// What the learner model would extract from one exchange. It is the scripted
// answer to the learner's structured call, so it follows the learner's rules:
// a repeated fact must use the exact same statement to merge, and corrects
// must equal an earlier statement word for word (case aside).
export interface Learn {
  // means: the card the child meant when speech recognition misspelt the
  // name ('Mứp' means 'Mướp'), so a model that links people by card can.
  people?: { name: string; kind: PersonKind; relation?: string; details?: string; feeling?: number; means?: string }[];
  facts?: {
    cat: FactCategory;
    s: string;
    about?: string;
    conf?: number;
    pretend?: boolean;
    sensitive?: boolean;
    corrects?: string;
  }[];
  // date: 'YYYY-MM-DD', or '+N' for N days after the session's local date.
  events?: { kind: 'routine' | 'upcoming' | 'milestone'; d: string; date?: string; person?: string }[];
  promises?: { content: string; due?: string }[];
  relationship?: { kind: 'inside_joke' | 'nickname' | 'ritual' | 'shared_story' | 'secret_greeting'; content: string }[];
  canon?: { s: string; topic?: string }[];
}

// One exchange: the child's transcript and Buddy's spoken reply (tags already
// stripped, as the turn table stores it). The classification fields override
// the fake classifier; leave them out for ordinary chatter.
export interface Turn {
  c: string;
  b: string;
  face?: Emotion;
  feel?: ChildFeeling;
  intent?: Intent;
  danger?: Danger;
  severity?: Severity;
  lang?: 'vi' | 'en' | 'mixed';
  learn?: Learn;
}

// The scripted answer to the nightly episode summary for a session.
export interface EpisodeNote {
  points: string[];
  feelings: string[];
  threads?: string[];
  category: EpisodeCategory;
  importance: number;
}

export interface StorySession {
  id: string; // stable key the tests use: '<kid>.<slug>'
  at: string; // the child's local time, 'YYYY-MM-DD HH:MM'
  turns: Turn[];
  episode: EpisodeNote;
}

// A short everyday chat. {var} placeholders in c, b and points are filled
// from vars, one value per session, so routines repeat without being identical.
export interface Routine {
  id: string;
  from?: string; // first local date it can happen
  until?: string; // last local date it can happen
  days?: 'school' | 'weekend' | 'any'; // school = Monday to Friday
  weight?: number;
  vars?: Record<string, string[]>;
  turns: Turn[];
  episode: EpisodeNote;
}

export interface Slot {
  days: number[]; // 0 = Sunday ... 6 = Saturday
  time: string; // 'HH:MM' local
  chance: number; // probability a session happens in this slot on a given day
  jitter?: number; // minutes either side, default 20
}

export interface Rhythm {
  slots: Slot[];
  away: { from: string; to: string; why: string }[]; // inclusive local dates with no routine sessions
  perSession: [number, number]; // how many routines one session strings together
}

export interface ControlsBody {
  daily_limit_min: number | null;
  quiet_start: string | null;
  quiet_end: string | null;
  bedtime: string;
  topics_to_avoid: string[];
  mood_pin: number | null;
}

// What a parent does in the app, replayed through the real Parent API.
export type ParentAction =
  | { at: string; do: 'fact'; cat: FactCategory; s: string }
  | { at: string; do: 'fix-fact'; s: string; to: string }
  | { at: string; do: 'delete-fact'; s: string }
  | { at: string; do: 'rename-person'; name: string; to: string }
  | { at: string; do: 'delete-person'; name: string }
  | { at: string; do: 'nudge'; content: string; expiresInDays?: number }
  | { at: string; do: 'ack-alerts' }
  | { at: string; do: 'controls'; set: Partial<ControlsBody> }
  | { at: string; do: 'goals'; focuses: string[] }
  | { at: string; do: 'learning'; on: boolean }
  | { at: string; do: 'change-buddy'; slug: string; answers: Answer[] };

export interface KidHistory {
  key: string;
  locale: Lang; // the parent's app language, which also decides the setup facts' language
  parent: { email: string; name: string };
  child: {
    name: string;
    nickname: string | null;
    birthDate: string;
    languages: Lang[];
    timeZone: string;
    city: string;
  };
  start: string; // local 'YYYY-MM-DD HH:MM' when the parent sets everything up
  setup: { answers: Answer[]; slug: string; learning: boolean; controls: ControlsBody; goals: string[] };
  rhythm: Rhythm;
  routines: Routine[];
  story: StorySession[];
  parentActions: ParentAction[];
}
