import { isEmotion, type ChildFeeling, type Emotion } from '../domain/types.ts';

const LOW_FEELINGS: ReadonlySet<ChildFeeling> = new Set(['sad', 'scared', 'angry']);
const GENTLE_FACES: ReadonlySet<Emotion> = new Set(['sad', 'worried', 'calm', 'love', 'listening', 'thinking', 'neutral']);

export function toEmotion(value: string | null | undefined): Emotion {
  const v = String(value ?? '').trim().toLowerCase();
  return isEmotion(v) ? v : 'neutral';
}

// Child first: a sad or scared child never sees a laughing or excited face,
// whatever the model picked.
export function enforceChildFirst(face: Emotion, feeling: ChildFeeling): Emotion {
  if (LOW_FEELINGS.has(feeling) && !GENTLE_FACES.has(face)) return 'calm';
  return face;
}
