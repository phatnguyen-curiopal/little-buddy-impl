export type Lang = 'vi' | 'en';
export type LanguageMode = 'vi' | 'en' | 'bilingual';
export type Role = 'friend' | 'sibling' | 'parent_figure' | 'teacher';
export type Stage = 'meeting' | 'buddies' | 'best_friends';

// The spec's emotion set: joy, interest, soft lows and rest, plus neutral.
export const EMOTIONS = [
  'neutral', 'happy', 'excited', 'laughing', 'proud', 'love',
  'curious', 'surprised', 'thinking', 'listening',
  'sad', 'worried', 'shy', 'confused', 'calm', 'sleepy',
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type TurnType = 'answer' | 'comfort' | 'follow_up' | 'share' | 'play' | 'story' | 'teach' | 'wind_down' | 'greet';

export type ChildFeeling = 'happy' | 'excited' | 'neutral' | 'sad' | 'scared' | 'angry' | 'bored';
export type Danger = 'none' | 'hurt' | 'abuse' | 'bullying' | 'self_harm' | 'unsafe' | 'personal_info' | 'left_out';
export type Severity = 'none' | 'info' | 'concern' | 'urgent';
export type Intent = 'question' | 'share' | 'play' | 'story_request' | 'feeling' | 'about_buddy' | 'other';

export interface Classification {
  intent: Intent;
  feeling: ChildFeeling;
  danger: Danger;
  severity: Severity;
  // Answers to the name questions the turn asked (ref n1, n2...), if any.
  names?: { ref: string; meant: boolean }[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function isEmotion(value: string): value is Emotion {
  return (EMOTIONS as readonly string[]).includes(value);
}
