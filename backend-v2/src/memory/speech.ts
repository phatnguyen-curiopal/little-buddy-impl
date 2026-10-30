// How one child speaks. Speech recognition writes what it heard, and a young
// child's sounds often come out as other real words ("đau lăn" for "đau
// răng", "cái chăn" for "cái trăng"). What Buddy learns about this child's
// speech, or a parent adds, helps the classifier and the reply read what was
// meant, and the child's own words (a toy, a cartoon) bias recognition.

import type { Queryable } from '../db/index.ts';

export interface LexiconRow {
  id: string;
  kind: 'misheard' | 'term';
  heard: string;
  meant: string;
  source: 'learned' | 'parent';
  seen: number;
}

// One guess is not yet a habit: a learned pattern counts from its second
// time, a parent's at once. A term is only a hint to recognition, so it
// counts at once too.
export function inUse(r: LexiconRow): boolean {
  return r.source === 'parent' || r.kind === 'term' || r.seen >= 2;
}

export async function loadLexicon(q: Queryable, childId: string): Promise<LexiconRow[]> {
  return (await q.query<LexiconRow>(
    `SELECT id, kind, heard, meant, source, seen FROM speech_lexicon
     WHERE child_id = $1 ORDER BY (source = 'parent') DESC, seen DESC, last_seen_at DESC LIMIT 60`,
    [childId],
  )).rows;
}

// Heard and meant, for the classifier and the brief: at most 8.
export function speechHabits(rows: LexiconRow[]): [string, string][] {
  return rows.filter((r) => r.kind === 'misheard' && inUse(r)).slice(0, 8).map((r) => [r.heard, r.meant]);
}

// The child's own words, for recognition's key terms: at most 20.
export function speechTerms(rows: LexiconRow[]): string[] {
  return rows.filter((r) => r.kind === 'term' && inUse(r)).slice(0, 20).map((r) => r.meant);
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60);

// A parent's entry is never overwritten by a learned one.
export async function noteSpeech(
  q: Queryable,
  childId: string,
  entry: { kind: 'misheard' | 'term'; heard: string; meant: string; source: 'learned' | 'parent' },
): Promise<boolean> {
  const heard = clean(entry.heard);
  const meant = clean(entry.meant);
  if (!heard || !meant || (entry.kind === 'misheard' && heard.toLowerCase() === meant.toLowerCase())) return false;
  await q.query(
    `INSERT INTO speech_lexicon (child_id, kind, heard, meant, source) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (child_id, kind, lower(heard)) DO UPDATE SET
       seen = speech_lexicon.seen + 1, last_seen_at = now(),
       meant = CASE WHEN speech_lexicon.source = 'parent' AND EXCLUDED.source <> 'parent' THEN speech_lexicon.meant ELSE EXCLUDED.meant END,
       source = CASE WHEN speech_lexicon.source = 'parent' THEN 'parent' ELSE EXCLUDED.source END`,
    [childId, entry.kind, heard, meant, entry.source],
  );
  return true;
}
