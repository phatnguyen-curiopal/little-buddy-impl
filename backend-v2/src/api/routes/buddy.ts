import type { FastifyInstance, FastifyRequest } from 'fastify';

import { localTime } from '../../character/mood.ts';
import { DIAL_KEYS, latestPack, type Dials } from '../../character/packs.ts';
import { PERSONALITY_RE, dialsForType } from '../../character/personality.ts';
import { QUESTIONS, matchCharacters, targetFromAnswers, tuneDials, validateAnswers, type Answer, type CastMember, type Target } from '../../character/questionnaire.ts';
import type { Queryable } from '../../db/index.ts';
import type { Lang } from '../../domain/types.ts';
import { HttpError, badRequest, conflict, notFound } from '../../util/errors.ts';
import { childFor, ifMatch, sendWithEtag, type ApiDeps } from '../context.ts';

function localeOf(req: FastifyRequest): Lang {
  return String(req.headers['accept-language'] ?? '').toLowerCase().startsWith('en') ? 'en' : 'vi';
}

// character_voices are the character's own voice per language, the one a
// Buddy speaks with when no voice is picked.
const INSTANCE_VIEW = `SELECT i.id, c.slug AS character_slug, c.name AS character_name, i.role, i.language_mode,
    i.energy, i.playfulness, i.curiosity, i.warmth, i.structure, i.relationship_stage, i.met_on::text AS met_on,
    i.personality, i.voice_id, jsonb_build_object('vi', v.voices->'vi'->>'voice_id', 'en', v.voices->'en'->>'voice_id') AS character_voices,
    i.created_at, i.xmin::text AS etag
  FROM character_instance i JOIN buddy_character c ON c.id = i.character_id
  JOIN character_pack_version v ON v.id = i.pack_version_id
  WHERE i.child_id = $1 AND i.status = 'active'`;

function shapeInstance(r: Record<string, unknown>) {
  const dials = Object.fromEntries(DIAL_KEYS.map((k) => [k, r[k]]));
  const { energy: _e, playfulness: _p, curiosity: _c, warmth: _w, structure: _s, ...rest } = r;
  return { ...rest, dials } as unknown as Record<string, unknown> & { etag: string };
}

async function castMembers(q: Queryable): Promise<CastMember[]> {
  const r = await q.query<CastMember>("SELECT slug, name, profile FROM buddy_character WHERE status = 'released' ORDER BY slug");
  return r.rows;
}

// Creates the child's Buddy from a questionnaire target and seeds the
// child model with the favourites the child picked.
async function createInstance(q: Queryable, childId: string, timeZone: string, slug: string, target: Target, setupFacts: boolean) {
  const pack = await latestPack(q, slug);
  if (!pack) throw notFound('character');
  const cast = (await castMembers(q)).find((c) => c.slug === slug);
  const dials = tuneDials(cast?.profile.dials ?? target.dials, target.dials, pack.dialRanges);
  const ins = await q.query<{ id: string }>(
    `INSERT INTO character_instance (child_id, character_id, pack_version_id, role, language_mode, energy, playfulness, curiosity, warmth, structure, met_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date) RETURNING id`,
    [childId, pack.characterId, pack.packVersionId, target.role, target.language, dials.energy, dials.playfulness, dials.curiosity, dials.warmth, dials.structure, localTime(timeZone).date],
  );
  if (target.avoid.length) {
    await q.query(
      'UPDATE child_controls SET topics_to_avoid = (SELECT array_agg(DISTINCT t) FROM unnest(topics_to_avoid || $2::text[]) t), updated_at = now() WHERE child_id = $1',
      [childId, target.avoid.slice(0, 20)],
    );
  }
  if (setupFacts) {
    for (const f of target.favourites) {
      await q.query(
        "INSERT INTO fact (child_id, category, statement, source, confidence) VALUES ($1, $2, $3, 'setup', 0.9)",
        [childId, f.category, f.statement],
      );
    }
  }
  return ins.rows[0].id;
}

export function registerBuddy(app: FastifyInstance, deps: ApiDeps) {
  const { db } = deps;

  app.get('/characters', async () => {
    const r = await db.query<{ slug: string; name: string; who: string; themes: string[]; voices: { vi: string | null; en: string | null } }>(
      `SELECT c.slug, c.name, v.bible->>'who' AS who, ARRAY(SELECT jsonb_array_elements_text(c.profile->'themes')) AS themes,
         jsonb_build_object('vi', v.voices->'vi'->>'voice_id', 'en', v.voices->'en'->>'voice_id') AS voices
       FROM buddy_character c
       JOIN LATERAL (SELECT bible, voices FROM character_pack_version WHERE character_id = c.id AND released_at IS NOT NULL ORDER BY version DESC LIMIT 1) v ON true
       WHERE c.status = 'released' ORDER BY c.slug`,
    );
    return { data: r.rows };
  });

  // The voices a parent can pick, each speaking one language.
  app.get('/voices', async () => {
    const r = await db.query('SELECT id, name, language FROM voice ORDER BY language, sort, name');
    return { data: r.rows };
  });

  app.get('/questionnaire', async (req) => {
    const locale = localeOf(req);
    return {
      locale,
      questions: QUESTIONS.map((q) => ({
        id: q.id, by: q.by, multi: Boolean(q.multi), free: Boolean(q.free), text: q.text[locale],
        options: q.options.map((o) => ({ value: o.value, label: o.label[locale], picture: o.picture })),
      })),
    };
  });

  app.post('/children/:childId/questionnaire', {
    schema: {
      body: {
        type: 'object', required: ['answers'], additionalProperties: false,
        properties: {
          answers: {
            type: 'array', maxItems: 20,
            items: {
              type: 'object', required: ['question', 'answer', 'by'], additionalProperties: false,
              properties: {
                question: { type: 'string', maxLength: 40 },
                answer: { anyOf: [{ type: 'string', maxLength: 60 }, { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 60 } }] },
                by: { type: 'string', enum: ['child', 'parent'] },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const answers = (req.body as { answers: Answer[] }).answers;
    const problems = validateAnswers(answers);
    if (problems.length) throw badRequest('Some answers are not valid', problems.map((p) => ({ field: 'answers', code: p })));
    const target = targetFromAnswers(answers, localeOf(req));
    const ranked = matchCharacters(target, await castMembers(db));
    if (!ranked.length) throw new HttpError(503, 'no-cast', 'No characters are released yet');
    const best = ranked[0];
    const pack = await latestPack(db, best.slug);
    const cast = (await castMembers(db)).find((c) => c.slug === best.slug);
    const dials: Dials = pack && cast ? tuneDials(cast.profile.dials, target.dials, pack.dialRanges) : target.dials;
    const saved = await db.query<{ id: string }>(
      `INSERT INTO questionnaire_response (child_id, answers, target_profile, matched_character_id, match_score)
       SELECT $1, $2, $3, id, $5 FROM buddy_character WHERE slug = $4 RETURNING id`,
      [child.id, JSON.stringify(answers), JSON.stringify(target), best.slug, best.score],
    );
    return reply.code(201).send({
      questionnaire_id: saved.rows[0].id,
      match: { character: { slug: best.slug, name: best.name }, score: best.score, dials },
      alternatives: ranked.slice(1, 3),
    });
  });

  async function targetFor(childId: string, questionnaireId: string | undefined): Promise<Target> {
    if (!questionnaireId) throw badRequest('questionnaire_id is required', [{ field: 'questionnaire_id', code: 'required' }]);
    const r = await db.query<{ target_profile: Target }>('SELECT target_profile FROM questionnaire_response WHERE id = $1 AND child_id = $2', [questionnaireId, childId]);
    if (!r.rows[0]) throw notFound('questionnaire');
    return r.rows[0].target_profile;
  }

  const confirmSchema = {
    body: {
      type: 'object', required: ['questionnaire_id', 'character_slug'], additionalProperties: false,
      properties: { questionnaire_id: { type: 'string', format: 'uuid' }, character_slug: { type: 'string', maxLength: 40 }, confirm: { type: 'boolean' } },
    },
  };

  app.post('/children/:childId/buddy', { schema: confirmSchema }, async (req, reply) => {
    const child = await childFor(deps, req);
    const body = req.body as { questionnaire_id: string; character_slug: string };
    const target = await targetFor(child.id, body.questionnaire_id);
    await db.tx(async (q) => {
      const existing = await q.query("SELECT 1 FROM character_instance WHERE child_id = $1 AND status = 'active'", [child.id]);
      if (existing.rowCount) throw conflict('buddy-exists', 'This child already has a Buddy; use the change endpoint');
      await createInstance(q, child.id, child.time_zone, body.character_slug, target, true);
    });
    const r = await db.query(INSTANCE_VIEW, [child.id]);
    return sendWithEtag(reply, shapeInstance(r.rows[0]), 201);
  });

  app.get('/children/:childId/buddy', async (req, reply) => {
    const child = await childFor(deps, req);
    const r = await db.query(INSTANCE_VIEW, [child.id]);
    if (!r.rows[0]) throw notFound('Buddy');
    return sendWithEtag(reply, shapeInstance(r.rows[0]));
  });

  app.patch('/children/:childId/buddy', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          role: { type: 'string', enum: ['friend', 'sibling', 'parent_figure', 'teacher'] },
          language_mode: { type: 'string', enum: ['vi', 'en', 'bilingual'] },
          dials: { type: 'object', additionalProperties: false, properties: Object.fromEntries(DIAL_KEYS.map((k) => [k, { type: 'integer', minimum: 0, maximum: 100 }])) },
          personality: { type: ['string', 'null'], pattern: PERSONALITY_RE.source },
          voice_id: { type: ['string', 'null'], maxLength: 64 },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const etag = ifMatch(req);
    const body = req.body as { role?: string; language_mode?: string; dials?: Partial<Dials>; personality?: string | null; voice_id?: string | null };
    const current = (await db.query<{ id: string; slug: string; language_mode: string; personality: string | null; voice_id: string | null; voice_language: string | null } & Dials>(
      `SELECT i.id, c.slug, i.language_mode, i.personality, i.voice_id, vo.language AS voice_language,
              i.energy, i.playfulness, i.curiosity, i.warmth, i.structure
       FROM character_instance i JOIN buddy_character c ON c.id = i.character_id LEFT JOIN voice vo ON vo.id = i.voice_id
       WHERE i.child_id = $1 AND i.status = 'active'`,
      [child.id],
    )).rows[0];
    if (!current) throw notFound('Buddy');
    const pack = await latestPack(db, current.slug);
    const ranges = pack?.dialRanges ?? (Object.fromEntries(DIAL_KEYS.map((k) => [k, [0, 100]])) as Record<keyof Dials, [number, number]>);
    // A personality type sets all five dials; dials sent with it still win.
    // Either way they stay inside the character's ranges, so it remains itself.
    const personality = 'personality' in body ? (body.personality ?? null) : current.personality;
    const dials = (body.personality ? dialsForType(body.personality, ranges) : { ...current }) as Dials;
    for (const k of DIAL_KEYS) {
      const want = body.dials?.[k];
      if (want === undefined) continue;
      const [lo, hi] = ranges[k];
      dials[k] = Math.min(hi, Math.max(lo, want));
    }
    // A picked voice speaks one language, and Buddy speaks one language out
    // loud: its own, or in bilingual mode the child's first language (the
    // voice service's speechLanguage). The voice must be that one, and a
    // switch away from it drops a voice that no longer fits.
    const mode = body.language_mode ?? current.language_mode;
    const speaks = mode === 'bilingual' ? (child.languages[0] === 'en' ? 'en' : 'vi') : mode;
    const suits = (language: string | null) => language === speaks;
    let voiceId = current.voice_id;
    if ('voice_id' in body) {
      // An empty value clears it as null does (a "default voice" option may send "").
      voiceId = body.voice_id || null;
      if (voiceId) {
        const voice = (await db.query<{ language: string }>('SELECT language FROM voice WHERE id = $1', [voiceId])).rows[0];
        if (!voice) throw badRequest('There is no such voice', [{ field: 'voice_id', code: 'enum' }]);
        if (!suits(voice.language)) throw badRequest('This voice speaks another language', [{ field: 'voice_id', code: 'language' }]);
      }
    } else if (voiceId && !suits(current.voice_language)) {
      voiceId = null;
    }
    const r = await db.query(
      `UPDATE character_instance SET role = coalesce($3, role), language_mode = coalesce($4, language_mode),
              energy = $5, playfulness = $6, curiosity = $7, warmth = $8, structure = $9, personality = $10, voice_id = $11
       WHERE id = $1 AND xmin::text = $2 RETURNING id`,
      [current.id, etag, body.role ?? null, body.language_mode ?? null, dials.energy, dials.playfulness, dials.curiosity, dials.warmth, dials.structure, personality, voiceId],
    );
    if (!r.rowCount) throw new HttpError(412, 'stale-write', 'Buddy changed since you loaded it. Reload and try again.');
    const view = await db.query(INSTANCE_VIEW, [child.id]);
    return sendWithEtag(reply, shapeInstance(view.rows[0]));
  });

  app.post('/children/:childId/buddy/change', { schema: confirmSchema }, async (req, reply) => {
    const child = await childFor(deps, req);
    const body = req.body as { questionnaire_id: string; character_slug: string; confirm?: boolean };
    if (body.confirm !== true) throw new HttpError(409, 'confirm-required', 'Changing character starts a new friendship; send "confirm": true');
    const target = await targetFor(child.id, body.questionnaire_id);
    await db.tx(async (q) => {
      await q.query("UPDATE character_instance SET status = 'archived' WHERE child_id = $1 AND status = 'active'", [child.id]);
      await createInstance(q, child.id, child.time_zone, body.character_slug, target, false);
    });
    const r = await db.query(INSTANCE_VIEW, [child.id]);
    return sendWithEtag(reply, shapeInstance(r.rows[0]), 201);
  });
}
