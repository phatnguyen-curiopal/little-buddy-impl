// The learner: after every turn, one structured call proposes what to
// remember, and this module reconciles it with what is already known, all
// in one transaction.

import type { Db, Queryable } from '../db/index.ts';
import type { ModelGateway } from '../gateway/types.ts';
import { LEARN_SCHEMA, type LearnResult } from '../gateway/schemas.ts';
import type { Logger } from '../log.ts';
import { localTime } from '../character/mood.ts';
import { alsoWord, bareName, cueFrom, kindsMatch, matchName, nameKey, type PersonCard } from './names.ts';
import { noteSpeech } from './speech.ts';
import { toVectorLiteral } from './vec.ts';

const LEARN_SYSTEM = [
  'You keep the memory of a toy friend for one child aged 4 to 8. From the latest exchange, extract what the CHILD said about',
  'themselves and their world, and what BUDDY said about itself. Return only the JSON. Empty lists are fine; never invent.',
  '- people: the people, pets, named toys and places the child talked about, with kind and relation. feeling from -1',
  '  (dislikes) to 1 (loves), 0 if unclear. name: the name alone ("Mít", not "bạn Mít"). ref: the known one\'s ref',
  '  (p1, p2...) when it is one of them, else null; two people with the same name are different when their relation',
  '  differs. called: the words the child used for it, with the title or animal word ("bạn Mít", "con chó Mực", "bà',
  '  ngoại"). also_word: when a new name is also an ordinary word, its meaning ("jackfruit" for Mít), else null. A name',
  '  that is also an ordinary word counts only when the child means the named one: "ăn mít" and "nấu mực" are food, not',
  '  people. Family words alone (bà, ông, bố, mẹ, ba, má, bà ngoại) name family members. Never record a school or class',
  '  name, a street address or a phone number; a place is a city, hometown, park or someone\'s home.',
  '- facts: short statements about the child, in the language the child used ("loves mangoes", "thích xoài"). about: the',
  '  ref or name of who the fact is about when it is someone else, else null. confidence 0.5 for a passing remark, 0.9 when clearly',
  '  stated. reality: pretend for imaginary things ("I have a dragon at home"). sensitivity: sensitive for health, family',
  '  conflict, money or body worries. corrects: the exact known fact this replaces when the child corrected Buddy, else null.',
  '- events: upcoming days, routines and milestones (a lost tooth). date as YYYY-MM-DD when known, else null. person: the',
  '  ref or name of who it is about, else null.',
  '- promises: what BUDDY promised to do or ask about later. due as YYYY-MM-DD when known, else null.',
  '- relationship: new nicknames, inside jokes, rituals, secret greetings or stories made together.',
  '- canon: what BUDDY said about itself (favourites, skills, its day) that must stay consistent later.',
  '- words: in bilingual play, second-language words BUDDY taught in its reply (by buddy) or the CHILD said in their second',
  '  language (by child), with the meaning in the other language; else an empty list.',
  '- Growth: when the child shows that something they found hard or were scared of is now fine, add a strengths fact and put',
  '  the old fact in corrects.',
  '- misheard: words speech recognition wrote wrongly for this young child, with what they meant, only when the talk shows it',
  '  (they confirmed Buddy\'s guess, or nothing else makes sense): "đau lăn" for "đau răng". Else an empty list.',
  '- terms: the child\'s own words a recogniser may not know (a toy\'s or cartoon\'s name, a made-up word they keep using), never',
  '  everyday words.',
  '- If the speaker is clearly not the child (a sibling or friend introduced themselves), extract nothing about the child.',
].join('\n');

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
const short = (s: string | null | undefined, n = 200) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const validDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
// Where a child can be found is never stored, whatever the model returns.
const PRIVATE_PLACE = /school|kindergarten|class|address|street|trường|lớp|mẫu giáo|địa chỉ|đường|số nhà/i;

// One roster line per known card, with a ref the model answers with:
// p1: Mướp (pet, cat; called "con mèo mướp"; also the word "mướp": loofah)
function rosterLine(p: PersonCard, i: number): string {
  const word = alsoWord(p);
  const extra = [p.relation ? `${p.kind}, ${p.relation}` : p.kind, ...p.cues.map((c) => `called "${c}"`), ...(word ? [`also the word "${p.display_name.toLowerCase()}": ${word}`] : [])];
  return `p${i + 1}: ${p.display_name} (${extra.join('; ')})`;
}

interface TurnRow {
  id: string;
  child_id: string;
  session_id: string;
  child_text: string;
  reply_text: string;
  created_at: Date;
}

export async function learnFromTurn(deps: { db: Db; gateway: ModelGateway; log: Logger }, turnId: string): Promise<{ written: number; skipped?: string }> {
  const { db, gateway, log } = deps;
  const turn = (await db.query<TurnRow>('SELECT id, child_id, session_id, child_text, reply_text, created_at FROM turn WHERE id = $1', [turnId])).rows[0];
  if (!turn) return { written: 0, skipped: 'turn gone' };
  const child = (
    await db.query<{ learning_enabled: boolean; time_zone: string; instance_id: string | null }>(
      `SELECT c.learning_enabled, c.time_zone, i.id AS instance_id
       FROM child c LEFT JOIN character_instance i ON i.child_id = c.id AND i.status = 'active'
       WHERE c.id = $1`,
      [turn.child_id],
    )
  ).rows[0];
  if (!child) return { written: 0, skipped: 'child gone' };
  // Learning off means nothing about the child is written, by consent.
  if (!child.learning_enabled) return { written: 0, skipped: 'learning off' };

  const people = (
    await db.query<PersonCard>(
      `SELECT id, display_name, name_key, aliases, kind, relation, cues, also_word
       FROM person WHERE child_id = $1 AND status = 'active' ORDER BY mentions DESC, first_mentioned_at, display_name`,
      [turn.child_id],
    )
  ).rows;
  const refs = new Map(people.map((p, i) => [`p${i + 1}`, p]));
  const known = (
    await db.query<{ statement: string }>(
      "SELECT statement FROM fact WHERE child_id = $1 AND status = 'active' ORDER BY last_seen_at DESC LIMIT 30",
      [turn.child_id],
    )
  ).rows.map((r) => r.statement);

  const today = localTime(child.time_zone).date;
  // The exchange before this one: a child's "Dạ!" confirms the guess Buddy
  // checked there, which is how a misheard word is learned.
  const before = (
    await db.query<{ child_text: string; reply_text: string }>(
      'SELECT child_text, reply_text FROM turn WHERE session_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 1',
      [turn.session_id, turn.created_at],
    )
  ).rows[0];
  const extracted = await gateway.structured<LearnResult>({
    tier: 'fast',
    name: 'learn',
    schema: LEARN_SCHEMA,
    system: LEARN_SYSTEM,
    user: [
      `Today: ${today}`,
      `Known people, pets, toys and places:\n${people.map(rosterLine).join('\n') || 'none'}`,
      `Known facts: ${known.join('; ') || 'none'}`,
      ...(before ? [`Before that, the child said: ${before.child_text || '(nothing)'}`, `and Buddy replied: ${before.reply_text}`] : []),
      `Child said: ${turn.child_text}`,
      `Buddy replied: ${turn.reply_text}`,
    ].join('\n'),
  });

  const facts = (extracted.facts ?? []).map((f) => ({ ...f, statement: short(f.statement), confidence: clamp01(f.confidence) })).filter((f) => f.statement);
  const newPeople = (extracted.people ?? [])
    .map((p) => ({ ...p, name: bareName(short(p.name, 60)) }))
    .filter((p) => p.name && !(p.kind === 'place' && PRIVATE_PLACE.test(`${p.relation ?? ''} ${p.name}`)));
  const canon = (extracted.canon ?? []).map((c) => ({ ...c, statement: short(c.statement) })).filter((c) => c.statement);
  const items = (extracted.relationship ?? []).map((r) => ({ ...r, content: short(r.content) })).filter((r) => r.content);
  const promises = (extracted.promises ?? []).map((p) => ({ ...p, content: short(p.content) })).filter((p) => p.content);
  const events = (extracted.events ?? []).map((e) => ({ ...e, description: short(e.description) })).filter((e) => e.description);
  const words = (extracted.words ?? []).map((w) => ({ ...w, word: short(w.word, 40) })).filter((w) => w.word && (w.language === 'vi' || w.language === 'en'));

  const texts = [
    ...facts.map((f) => f.statement),
    ...newPeople.map((p) => `${p.name} ${p.relation ?? p.kind}`),
    ...canon.map((c) => c.statement),
    ...items.map((r) => r.content),
  ];
  const vectors = texts.length ? (await gateway.embed(texts)).map(toVectorLiteral) : [];
  let v = 0;
  const factVecs = facts.map(() => vectors[v++]);
  const personVecs = newPeople.map(() => vectors[v++]);
  const canonVecs = canon.map(() => vectors[v++]);
  const itemVecs = items.map(() => vectors[v++]);

  const written = await db.tx(async (q) => {
    let n = 0;
    const roster = [...people];
    // A ref from the model, or a name: an exact name or a misheard one within
    // the same kind of card. A ref to the wrong kind (a pet for a person) is
    // ignored rather than trusted.
    const who = (ref: string | null | undefined, name: string, kind?: string) => {
      const byRef = ref ? refs.get(ref) : undefined;
      if (byRef && (!kind || kindsMatch(byRef.kind, kind))) return byRef;
      return matchName(roster, name, kind);
    };
    for (const [i, p] of newPeople.entries()) {
      const hit = who(p.ref, p.name, p.kind);
      const cue = cueFrom(p.called, hit?.display_name ?? p.name);
      if (hit) {
        const cues = cue && !hit.cues.includes(cue) ? [...hit.cues, cue].slice(-4) : hit.cues;
        await q.query(
          `UPDATE person SET mentions = mentions + 1, last_mentioned_at = now(), closeness = least(1, closeness + 0.05),
                  feeling = (feeling + $2) / 2, relation = coalesce(relation, $3), cues = $4, also_word = coalesce(also_word, $5)
           WHERE id = $1`,
          [hit.id, clamp01((p.feeling + 1) / 2) * 2 - 1, p.relation, cues, short(p.also_word, 60) || null],
        );
        hit.cues = cues;
      } else {
        const card: PersonCard = {
          id: '', display_name: p.name, name_key: nameKey(p.name), aliases: [], kind: p.kind, relation: p.relation,
          cues: cue ? [cue] : [], also_word: short(p.also_word, 60) || null,
        };
        const ins = await q.query<{ id: string }>(
          `INSERT INTO person (child_id, display_name, name_key, kind, relation, details, feeling, closeness, embedding, cues, also_word)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0.2, $8, $9, $10) RETURNING id`,
          [turn.child_id, p.name, card.name_key, p.kind, p.relation, JSON.stringify(p.details ? { note: short(p.details) } : {}), clamp01((p.feeling + 1) / 2) * 2 - 1, personVecs[i], card.cues, card.also_word],
        );
        card.id = ins.rows[0].id;
        roster.push(card);
      }
      n += 1;
    }

    for (const [i, f] of facts.entries()) {
      const personId = f.about ? (who(f.about, f.about)?.id ?? null) : null;
      // Superseded first, so the new fact cannot merge into the one it
      // replaces; linked afterwards, which is how growth is found later.
      const replaced = f.corrects
        ? (await q.query<{ id: string }>(
          "UPDATE fact SET status = 'superseded' WHERE child_id = $1 AND status = 'active' AND lower(statement) = lower($2) RETURNING id",
          [turn.child_id, short(f.corrects)],
        )).rows.map((r) => r.id)
        : [];
      const dup = (
        await q.query<{ id: string }>(
          `SELECT id FROM fact
           WHERE child_id = $1 AND category = $2 AND status = 'active'
             AND (lower(statement) = lower($3) OR (embedding IS NOT NULL AND (embedding <=> $4) < 0.15))
           ORDER BY (embedding <=> $4) LIMIT 1`,
          [turn.child_id, f.category, f.statement, factVecs[i]],
        )
      ).rows[0];
      let factId: string;
      if (dup) {
        factId = dup.id;
        await q.query(
          'UPDATE fact SET mentions = mentions + 1, confidence = least(1, confidence + 0.1), weight = 1, last_seen_at = now() WHERE id = $1',
          [factId],
        );
      } else {
        const ins = await q.query<{ id: string }>(
          `INSERT INTO fact (child_id, person_id, category, statement, source, confidence, reality, sensitivity, embedding)
           VALUES ($1, $2, $3, $4, 'child', $5, $6, $7, $8) RETURNING id`,
          [turn.child_id, personId, f.category, f.statement, f.confidence, f.reality, f.sensitivity, factVecs[i]],
        );
        factId = ins.rows[0].id;
      }
      await q.query(
        'INSERT INTO fact_evidence (fact_id, turn_id, observed_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [factId, turn.id, turn.created_at],
      );
      if (replaced.length) await q.query('UPDATE fact SET superseded_by = $2 WHERE id = ANY($1::uuid[])', [replaced, factId]);
      n += 1;
    }

    // How this child speaks: what recognition got wrong, and their own words.
    for (const m of extracted.misheard ?? []) {
      if (await noteSpeech(q, turn.child_id, { kind: 'misheard', heard: m.heard, meant: m.meant, source: 'learned' })) n += 1;
    }
    for (const term of extracted.terms ?? []) {
      if (await noteSpeech(q, turn.child_id, { kind: 'term', heard: term, meant: term, source: 'learned' })) n += 1;
    }

    // A word the child says comes back for review later and later: 1, 3, 7,
    // 14, then 30 days. A word Buddy teaches keeps its schedule.
    for (const w of words) {
      const usedNow = w.by === 'child' ? 1 : 0;
      await q.query(
        `INSERT INTO word_bank (child_id, word, word_key, language, meaning, taught, used)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (child_id, language, word_key) DO UPDATE SET
           taught = word_bank.taught + EXCLUDED.taught, used = word_bank.used + EXCLUDED.used,
           meaning = coalesce(word_bank.meaning, EXCLUDED.meaning), last_seen_at = now(),
           next_review_at = CASE WHEN EXCLUDED.used > 0
             THEN now() + make_interval(days => (ARRAY[1, 3, 7, 14, 30])[least(word_bank.used + 1, 5)])
             ELSE word_bank.next_review_at END`,
        [turn.child_id, w.word, w.word.toLowerCase(), w.language, short(w.meaning, 60) || null, 1 - usedNow, usedNow],
      );
      n += 1;
    }

    for (const e of events) {
      const date = validDate(e.date);
      const personId = e.person ? (who(e.person, e.person)?.id ?? null) : null;
      // Ask about an upcoming day the afternoon after it, on the child's
      // clock (the database runs in UTC); routines and milestones need no
      // follow-up.
      await q.query(
        `INSERT INTO child_event (child_id, person_id, kind, description, starts_on, follow_up_due)
         VALUES ($1, $2, $3, $4, $5::date,
                 CASE WHEN $3 = 'upcoming'
                   THEN (coalesce($5::date + 1, (now() AT TIME ZONE $6)::date + 1) + time '16:00') AT TIME ZONE $6
                   ELSE NULL END)`,
        [turn.child_id, personId, e.kind, e.description, date, child.time_zone],
      );
      n += 1;
    }

    for (const p of promises) {
      await q.query(
        `INSERT INTO relationship_item (child_id, kind, content, due_at)
         VALUES ($1, 'promise', $2, coalesce(($3::date + time '16:00') AT TIME ZONE $4, now() + interval '1 day'))`,
        [turn.child_id, p.content, validDate(p.due), child.time_zone],
      );
      n += 1;
    }

    for (const [i, r] of items.entries()) {
      const exists = await q.query(
        "SELECT 1 FROM relationship_item WHERE child_id = $1 AND kind = $2 AND lower(content) = lower($3) AND status = 'active'",
        [turn.child_id, r.kind, r.content],
      );
      if (exists.rowCount) continue;
      await q.query('INSERT INTO relationship_item (child_id, kind, content, embedding) VALUES ($1, $2, $3, $4)', [turn.child_id, r.kind, r.content, itemVecs[i]]);
      n += 1;
    }

    if (child.instance_id) {
      for (const [i, c] of canon.entries()) {
        const dupCanon = await q.query(
          `SELECT 1 FROM buddy_canon WHERE instance_id = $1 AND status = 'active'
             AND (lower(statement) = lower($2) OR (embedding IS NOT NULL AND (embedding <=> $3) < 0.1))`,
          [child.instance_id, c.statement, canonVecs[i]],
        );
        if (dupCanon.rowCount) continue;
        await q.query(
          "INSERT INTO buddy_canon (instance_id, statement, topic, source, turn_id, embedding) VALUES ($1, $2, $3, 'said', $4, $5)",
          [child.instance_id, c.statement, c.topic, turn.id, canonVecs[i]],
        );
        n += 1;
      }
    }
    return n;
  });

  log.debug('learned from turn', { turn_id: turn.id, child_id: turn.child_id, written });
  return { written };
}

export async function personCount(q: Queryable, childId: string): Promise<number> {
  const r = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM person WHERE child_id = $1', [childId]);
  return r.rows[0].n;
}
