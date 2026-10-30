// The director decides what a turn is for before the model writes a word.
// Rules run top to bottom and the first match wins (technical proposal, s6).

import type { Classification, TurnType } from '../domain/types.ts';
import type { EnergyPhase } from './mood.ts';

export interface DirectorInput {
  classification: Classification;
  firstTurnOfSession: boolean;
  dueCount: number;
  energy: EnergyPhase;
  minutesLeft: number | null;
  questionStreak: number;
  ageYears: number | null;
}

export interface TurnPlan {
  type: TurnType;
  callback: boolean;
  allowQuestion: boolean;
  sentenceLimit: number;
  escalate: boolean;
}

const ESCALATING = new Set(['hurt', 'abuse', 'bullying', 'self_harm', 'unsafe']);

function pickType(i: DirectorInput): { type: TurnType; escalate: boolean } {
  const c = i.classification;
  if (c.danger !== 'none' && (c.severity === 'concern' || c.severity === 'urgent')) {
    return { type: 'comfort', escalate: ESCALATING.has(c.danger) || c.severity === 'urgent' };
  }
  if (c.feeling === 'sad' || c.feeling === 'scared' || c.feeling === 'angry') return { type: 'comfort', escalate: false };
  if (c.intent === 'question') return { type: 'answer', escalate: false };
  if (i.firstTurnOfSession && i.dueCount > 0) return { type: 'follow_up', escalate: false };
  if (i.energy === 'drowsy' || (i.minutesLeft !== null && i.minutesLeft <= 2)) return { type: 'wind_down', escalate: false };
  if (c.intent === 'story_request') return { type: 'story', escalate: false };
  if (c.feeling === 'bored' || c.intent === 'play') return { type: 'play', escalate: false };
  if (c.intent === 'about_buddy') return { type: 'share', escalate: false };
  return { type: 'answer', escalate: false };
}

export function decide(i: DirectorInput): TurnPlan {
  const { type, escalate } = pickType(i);
  const older = i.ageYears !== null && i.ageYears >= 6;
  return {
    type,
    escalate,
    // A callback in a comforting or winding-down turn reads as not listening.
    callback: type !== 'comfort' && type !== 'wind_down',
    allowQuestion: i.questionStreak < 2,
    sentenceLimit: type === 'wind_down' ? 2 : type === 'story' ? (older ? 6 : 5) : older ? 4 : 3,
  };
}
