// Incremental parser for the reply markup:
//   [face:happy][tone:cheerful] Wowee, a new puppy! [whispers] What's its name?
// The face is emitted before any audio is made; sentences are emitted as soon
// as they end, so text-to-speech can start on the first one.

import type { Emotion } from '../domain/types.ts';
import { toEmotion } from './emotions.ts';

export type ParseEvent =
  | { type: 'face'; emotion: Emotion }
  | { type: 'sentence'; spoken: string; clean: string };

const TAG_RE = /\[[^\]]*\]/g;
const BOUNDARY_RE = /[.!?…]+["')\]]*(\s|$)|\n/;

export class ReplyParser {
  private buf = '';
  private faceDone = false;
  private voiceTag: string | null = null;
  private readonly audioTags: boolean;

  constructor(opts: { audioTags: boolean }) {
    this.audioTags = opts.audioTags;
  }

  push(chunk: string): ParseEvent[] {
    this.buf += chunk;
    const events: ParseEvent[] = [];
    if (!this.faceDone && !this.takeFace(events, false)) return events;
    this.takeSentences(events, false);
    return events;
  }

  end(): ParseEvent[] {
    const events: ParseEvent[] = [];
    if (!this.faceDone) this.takeFace(events, true);
    this.takeSentences(events, true);
    return events;
  }

  private takeFace(events: ParseEvent[], final: boolean): boolean {
    const text = this.buf.replace(/^\s+/, '');
    if (text.startsWith('[')) {
      const close = text.indexOf(']');
      if (close < 0) {
        // Wait for the tag to finish, unless the model never closes it.
        if (!final && text.length < 40) return false;
      } else {
        const tag = text.slice(1, close).trim();
        const value = tag.toLowerCase().startsWith('face:') ? tag.slice(5) : tag;
        const emotion = toEmotion(value);
        if (tag.toLowerCase().startsWith('face:') || emotion !== 'neutral' || value.toLowerCase() === 'neutral') {
          events.push({ type: 'face', emotion });
          this.buf = text.slice(close + 1);
          this.faceDone = true;
          return true;
        }
      }
    } else if (!final && text.length === 0) {
      return false;
    }
    events.push({ type: 'face', emotion: 'neutral' });
    this.buf = text;
    this.faceDone = true;
    return true;
  }

  private takeSentences(events: ParseEvent[], final: boolean): void {
    for (;;) {
      const lead = /^\s*\[tone:([^\]]*)\]/i.exec(this.buf);
      if (lead) {
        this.voiceTag = `[${lead[1].trim()}]`;
        this.buf = this.buf.slice(lead[0].length);
        continue;
      }
      const m = BOUNDARY_RE.exec(this.buf);
      if (!m) break;
      const end = m.index + m[0].length;
      this.emit(this.buf.slice(0, end), events);
      this.buf = this.buf.slice(end);
    }
    if (final && this.buf.trim()) {
      this.emit(this.buf, events);
      this.buf = '';
    }
  }

  private emit(raw: string, events: ParseEvent[]): void {
    const clean = raw.replace(TAG_RE, '').replace(/\s+/g, ' ').trim();
    if (!clean) {
      // A line of tags only: the last one becomes the voice for what follows.
      const tags = raw.match(TAG_RE);
      if (tags?.length) this.voiceTag = tags[tags.length - 1];
      return;
    }
    let spoken = clean;
    if (this.audioTags) {
      const body = raw.replace(/\s+/g, ' ').trim();
      // Each sentence is its own speech request, so the current voice tag is
      // repeated unless the sentence opens with a tag of its own.
      spoken = body.startsWith('[') || !this.voiceTag ? body : `${this.voiceTag} ${body}`;
      const tags = body.match(TAG_RE);
      if (tags?.length) this.voiceTag = tags[tags.length - 1];
    }
    events.push({ type: 'sentence', spoken, clean });
  }
}
