// The director decides what a turn is for before the model writes a word.
// Rules run top to bottom and the first match wins (technical proposal, s6).

import type { Classification, TurnType } from '../domain/types.ts';
import type { EnergyPhase } from './mood.ts';
import type { Game } from './play.ts';

export interface DirectorInput {
  classification: Classification;
  firstTurnOfSession: boolean;
  dueCount: number;
  energy: EnergyPhase;
  minutesLeft: number | null;
  questionStreak: number;
  ageYears: number | null;
  // A game Buddy offered or started on an earlier turn of this session.
  activeGame?: Game | null;
  // The game to play if this turn turns into play.
  candidateGame?: Game | null;
  // A playful character's roll to start a game unasked.
  wantsToPlay?: boolean;
}

export interface TurnPlan {
  type: TurnType;
  callback: boolean;
  allowQuestion: boolean;
  sentenceLimit: number;
  escalate: boolean;
  game: Game | null;
  // offer: ask first and wait for a yes (startle games); play: start or carry on.
  gameStep: 'offer' | 'play' | null;
  // True when carrying on a game from an earlier turn.
  gameContinues: boolean;
}

const ESCALATING = new Set(['hurt', 'abuse', 'bullying', 'self_harm', 'unsafe']);
const UPSET = new Set(['sad', 'scared', 'angry']);

function pickType(i: DirectorInput): { type: TurnType; escalate: boolean } {
  const c = i.classification;
  if (c.danger !== 'none' && (c.severity === 'concern' || c.severity === 'urgent')) {
    return { type: 'comfort', escalate: ESCALATING.has(c.danger) || c.severity === 'urgent' };
  }
  if (UPSET.has(c.feeling)) return { type: 'comfort', escalate: false };
  // A game in progress goes on (a riddle's guess often sounds like a question).
  if (i.activeGame && i.energy !== 'drowsy') return { type: 'play', escalate: false };
  if (c.intent === 'question') return { type: 'answer', escalate: false };
  if (i.firstTurnOfSession && i.dueCount > 0) return { type: 'follow_up', escalate: false };
  if (i.energy === 'drowsy' || (i.minutesLeft !== null && i.minutesLeft <= 2)) return { type: 'wind_down', escalate: false };
  if (c.intent === 'story_request') return { type: 'story', escalate: false };
  if (c.feeling === 'bored' || c.intent === 'play') return { type: 'play', escalate: false };
  if (i.wantsToPlay && i.candidateGame && (c.intent === 'share' || c.intent === 'other')) return { type: 'play', escalate: false };
  if (c.intent === 'about_buddy') return { type: 'share', escalate: false };
  return { type: 'answer', escalate: false };
}

export function decide(i: DirectorInput): TurnPlan {
  const { type, escalate } = pickType(i);
  const older = i.ageYears !== null && i.ageYears >= 6;
  const game = type === 'play' ? (i.activeGame ?? i.candidateGame ?? null) : null;
  const gameContinues = Boolean(game && i.activeGame);
  return {
    type,
    escalate,
    // A callback in a comforting or winding-down turn reads as not listening.
    callback: type !== 'comfort' && type !== 'wind_down',
    allowQuestion: i.questionStreak < 2,
    sentenceLimit: type === 'wind_down' ? 2 : type === 'story' ? (older ? 6 : 5) : older ? 4 : 3,
    game,
    // A startle needs the child's yes before it happens.
    gameStep: game ? (game.surprise && !gameContinues ? 'offer' : 'play') : null,
    gameContinues,
  };
}

// Buddy speaks first: a soft hello, never a question to answer.
export function greetPlan(): TurnPlan {
  return { type: 'greet', escalate: false, callback: true, allowQuestion: false, sentenceLimit: 2, game: null, gameStep: null, gameContinues: false };
}
