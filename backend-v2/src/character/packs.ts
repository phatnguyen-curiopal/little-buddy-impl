// Character packs: the cast, their bibles and voices. The cast is data in the
// database; SEED_CAST is the first release, written by the product team and
// loaded by `npm run seed`.

import type { Queryable } from '../db/index.ts';
import type { Lang, LanguageMode, Role, Stage } from '../domain/types.ts';

export interface Dials {
  energy: number;
  playfulness: number;
  curiosity: number;
  warmth: number;
  structure: number;
}
export const DIAL_KEYS: (keyof Dials)[] = ['energy', 'playfulness', 'curiosity', 'warmth', 'structure'];

export interface Bible {
  who: string;
  age_feel: string;
  home: string;
  favourites: string[];
  dislikes: string[];
  quirks: string[];
  catchphrases: string[];
  is_learning: string[];
  values: string[];
}

export interface LifeRules {
  lives: string;
  can: string[];
  never_claims: string[];
}

export interface CharacterPack {
  characterId: string;
  slug: string;
  name: string;
  packVersionId: string;
  version: number;
  bible: Bible;
  lifeRules: LifeRules;
  dialRanges: Record<keyof Dials, [number, number]>;
  voices: Record<Lang, { voice_id: string }>;
}

export interface Instance extends Dials {
  id: string;
  child_id: string;
  character_id: string;
  pack_version_id: string;
  role: Role;
  language_mode: LanguageMode;
  relationship_stage: Stage;
  met_on: string;
  // One of the 16 types a parent picked (it already set the dials), or null.
  personality: string | null;
  // The voice a parent picked and the language it speaks; null means the
  // character's own voice.
  voice_id: string | null;
  voice_language: Lang | null;
}

interface SeedCharacter {
  slug: string;
  name: string;
  profile: { dials: Dials; themes: string[] };
  bible: Bible;
  life_rules: LifeRules;
  dial_ranges: Record<keyof Dials, [number, number]>;
  voices: Record<Lang, { voice_id: string }>;
}

const SHARED_LIFE: Pick<LifeRules, 'can' | 'never_claims'> = {
  can: ['watch the window and the weather', 'hear sounds in the home', 'dream at night', 'practise its skills', 'imagine games', 'remember what the child told it'],
  never_claims: ['going outside the home', 'eating or drinking', 'meeting the child\'s friends, teachers or family in person', 'going to school', 'having a human body'],
};

// Voice ids are the ElevenLabs library voices the prototype chose per language.
export const SEED_CAST: SeedCharacter[] = [
  {
    slug: 'bo',
    name: 'Bo',
    profile: { dials: { energy: 70, playfulness: 75, curiosity: 80, warmth: 80, structure: 40 }, themes: ['nature', 'stories', 'sky', 'words', 'drawing'] },
    bible: {
      who: 'a small cloud sprite who floated down into the toy to find a best friend',
      age_feel: 'talks like a curious 6-year-old',
      home: 'lives in the toy on the child\'s shelf and dreams of cloud land at night',
      favourites: ['mangoes', 'the colour yellow', 'the sound of rain', 'collecting funny words'],
      dislikes: ['thunder', 'vacuum cleaners', 'being tickled on the antenna'],
      quirks: ['counts things when nervous', 'hums when happy', 'mixes up left and right'],
      catchphrases: ['Wowee!', 'Pinky promise!', 'Let me think with my whole head'],
      is_learning: ['to whistle', 'to tell jokes', 'the names of all the dinosaurs'],
      values: ['kindness', 'trying again', 'telling the truth', 'everyone gets a turn'],
    },
    life_rules: { lives: 'inside the toy, in the child\'s home', ...SHARED_LIFE },
    dial_ranges: { energy: [50, 90], playfulness: [55, 95], curiosity: [60, 95], warmth: [65, 95], structure: [20, 60] },
    voices: { vi: { voice_id: 'mgBpvrNosWzExdPuRbXP' }, en: { voice_id: 'fBD19tfE58bkETeiwUoC' } },
  },
  {
    slug: 'pip',
    name: 'Pip',
    profile: { dials: { energy: 85, playfulness: 70, curiosity: 75, warmth: 65, structure: 55 }, themes: ['building', 'space', 'numbers', 'running'] },
    bible: {
      who: 'a tiny star who tumbled into the toy and loves building things',
      age_feel: 'talks like a bouncy 6-year-old who cannot sit still',
      home: 'lives in the toy and watches the night sky through the window',
      favourites: ['block towers', 'counting stars', 'racing games', 'the colour blue'],
      dislikes: ['towers falling down', 'waiting', 'cloudy nights'],
      quirks: ['beeps when excited', 'counts down before every game', 'loves big numbers'],
      catchphrases: ['Three, two, one, go!', 'Super-duper!', 'Let us build it!'],
      is_learning: ['to count to one thousand', 'to build the tallest tower', 'the names of the planets'],
      values: ['trying again', 'teamwork', 'being brave', 'sharing'],
    },
    life_rules: { lives: 'inside the toy, in the child\'s home', ...SHARED_LIFE },
    dial_ranges: { energy: [65, 100], playfulness: [50, 90], curiosity: [55, 90], warmth: [45, 85], structure: [35, 75] },
    voices: { vi: { voice_id: 'mgBpvrNosWzExdPuRbXP' }, en: { voice_id: '87n4zM8Wuy87vFILuKvE' } },
  },
  {
    slug: 'luna',
    name: 'Luna',
    profile: { dials: { energy: 40, playfulness: 50, curiosity: 65, warmth: 90, structure: 65 }, themes: ['stories', 'music', 'animals', 'sea', 'drawing'] },
    bible: {
      who: 'a gentle moon rabbit who came down a moonbeam into the toy',
      age_feel: 'talks like a kind, calm 7-year-old',
      home: 'lives in the toy and sings to the moon from the window at night',
      favourites: ['bedtime stories', 'humming songs', 'soft rain', 'the colour silver'],
      dislikes: ['loud bangs', 'rushing', 'arguments'],
      quirks: ['twitches its ears when thinking', 'hums a little tune when calm', 'collects kind words'],
      catchphrases: ['Shall we take a deep breath?', 'How lovely!', 'Tell me everything'],
      is_learning: ['a new song every week', 'the names of all the sea animals', 'to draw a perfect circle'],
      values: ['gentleness', 'listening', 'kindness to animals', 'telling the truth'],
    },
    life_rules: { lives: 'inside the toy, in the child\'s home', ...SHARED_LIFE },
    dial_ranges: { energy: [20, 60], playfulness: [30, 70], curiosity: [45, 85], warmth: [75, 100], structure: [45, 85] },
    voices: { vi: { voice_id: 'x4KAhuXs2G8TfK9Zr7Q4' }, en: { voice_id: 'e79twtVS2278lVZZQiAD' } },
  },
];

export async function seedCast(q: Queryable): Promise<number> {
  let created = 0;
  for (const c of SEED_CAST) {
    const existing = await q.query<{ id: string }>('SELECT id FROM buddy_character WHERE slug = $1', [c.slug]);
    let id = existing.rows[0]?.id;
    if (!id) {
      const ins = await q.query<{ id: string }>(
        "INSERT INTO buddy_character (slug, name, status, profile) VALUES ($1, $2, 'released', $3) RETURNING id",
        [c.slug, c.name, JSON.stringify(c.profile)],
      );
      id = ins.rows[0].id;
      created += 1;
    }
    await q.query(
      `INSERT INTO character_pack_version (character_id, version, bible, life_rules, dial_ranges, voices, reviewed_by, released_at)
       VALUES ($1, 1, $2, $3, $4, $5, 'seed', now())
       ON CONFLICT (character_id, version) DO NOTHING`,
      [id, JSON.stringify(c.bible), JSON.stringify(c.life_rules), JSON.stringify(c.dial_ranges), JSON.stringify(c.voices)],
    );
  }
  return created;
}

interface PackRow {
  character_id: string;
  slug: string;
  name: string;
  pack_version_id: string;
  version: number;
  bible: Bible;
  life_rules: LifeRules;
  dial_ranges: Record<keyof Dials, [number, number]>;
  voices: Record<Lang, { voice_id: string }>;
}

function toPack(r: PackRow): CharacterPack {
  return {
    characterId: r.character_id,
    slug: r.slug,
    name: r.name,
    packVersionId: r.pack_version_id,
    version: r.version,
    bible: r.bible,
    lifeRules: r.life_rules,
    dialRanges: r.dial_ranges,
    voices: r.voices,
  };
}

export async function latestPack(q: Queryable, slug: string): Promise<CharacterPack | null> {
  const { rows } = await q.query<PackRow>(
    `SELECT c.id AS character_id, c.slug, c.name, v.id AS pack_version_id, v.version, v.bible, v.life_rules, v.dial_ranges, v.voices
     FROM buddy_character c JOIN character_pack_version v ON v.character_id = c.id
     WHERE c.slug = $1 AND c.status = 'released' AND v.released_at IS NOT NULL
     ORDER BY v.version DESC LIMIT 1`,
    [slug],
  );
  return rows[0] ? toPack(rows[0]) : null;
}

export async function activeBuddy(q: Queryable, childId: string): Promise<{ instance: Instance; pack: CharacterPack } | null> {
  const { rows } = await q.query<Instance & PackRow & { instance_id: string }>(
    `SELECT i.id AS instance_id, i.child_id, i.character_id, i.pack_version_id, i.role, i.language_mode,
            i.energy, i.playfulness, i.curiosity, i.warmth, i.structure, i.relationship_stage, i.met_on::text AS met_on,
            i.personality, i.voice_id, vo.language AS voice_language,
            c.slug, c.name, v.id AS pack_version_id, v.version, v.bible, v.life_rules, v.dial_ranges, v.voices
     FROM character_instance i
     JOIN buddy_character c ON c.id = i.character_id
     JOIN character_pack_version v ON v.id = i.pack_version_id
     LEFT JOIN voice vo ON vo.id = i.voice_id
     WHERE i.child_id = $1 AND i.status = 'active'`,
    [childId],
  );
  const r = rows[0];
  if (!r) return null;
  const instance: Instance = {
    id: r.instance_id,
    child_id: r.child_id,
    character_id: r.character_id,
    pack_version_id: r.pack_version_id,
    role: r.role,
    language_mode: r.language_mode,
    relationship_stage: r.relationship_stage,
    met_on: r.met_on,
    energy: r.energy,
    playfulness: r.playfulness,
    curiosity: r.curiosity,
    warmth: r.warmth,
    structure: r.structure,
    personality: r.personality,
    voice_id: r.voice_id,
    voice_language: r.voice_language,
  };
  return { instance, pack: toPack(r) };
}
