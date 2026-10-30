// The model gateway: one interface over OpenAI and ElevenLabs. Services call
// this, never a vendor SDK, so models can change without touching Buddy.

import type { ChatMessage, Classification, Lang } from '../domain/types.ts';

export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface StructuredRequest {
  tier: 'fast' | 'background';
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  signal?: AbortSignal;
}

// A streaming transcription for one turn: audio goes in while the child
// talks, partial transcripts come back, and finish() commits and returns the
// final text, so little work is left once the child stops.
export interface SttStream {
  write(pcm: Buffer): void;
  finish(): Promise<string>;
  close(): void;
}

export interface SttStreamOptions {
  language: Lang;
  keyterms: string[];
  signal?: AbortSignal;
  onPartial?: (text: string) => void;
}

// A known name that came up where it could also be an ordinary word or
// someone else: the classifier answers whether the child meant this one.
export interface NameQuestion {
  ref: string;
  name: string;
  who: string;
  word: string | null;
}

export interface ModelGateway {
  transcribe(input: { pcm: Buffer; language: Lang; keyterms: string[]; signal?: AbortSignal }): Promise<string>;
  openTranscription(opts: SttStreamOptions): SttStream;
  classify(input: { text: string; language: Lang; names?: NameQuestion[]; signal?: AbortSignal }): Promise<Classification>;
  reply(input: { messages: ChatMessage[]; cacheKey?: string; signal?: AbortSignal; onUsage?: (u: Usage) => void }): AsyncIterable<string>;
  speak(input: { text: string; voiceId: string; language: Lang; signal?: AbortSignal }): AsyncIterable<Buffer>;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  moderate(text: string, signal?: AbortSignal): Promise<{ flagged: boolean; categories: string[] }>;
  structured<T>(input: StructuredRequest): Promise<T>;
}

export const EMBEDDING_DIMS = 1536;
