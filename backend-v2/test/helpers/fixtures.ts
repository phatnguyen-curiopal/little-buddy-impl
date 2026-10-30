import type { Config } from '../../src/config.ts';
import type { Db } from '../../src/db/index.ts';
import { latestPack } from '../../src/character/packs.ts';
import { provisionDevices, type ManifestEntry } from '../../src/devices/credentials.ts';

export interface Family {
  familyId: string;
  parentId: string;
  childId: string;
  instanceId: string;
  device: ManifestEntry;
}

// A family with one child, an active Buddy (Bo) and one claimed toy.
export async function createFamily(db: Db, config: Config, opts: { learning?: boolean; slug?: string; claimed?: boolean; languageMode?: 'vi' | 'en' | 'bilingual' } = {}): Promise<Family> {
  const fam = (await db.query<{ id: string }>('INSERT INTO family DEFAULT VALUES RETURNING id')).rows[0].id;
  const parent = (await db.query<{ id: string }>(
    "INSERT INTO parent_user (family_id, email, auth_provider, auth_subject) VALUES ($1, $2, 'email', $2) RETURNING id",
    [fam, `p${Math.random().toString(36).slice(2)}@example.com`],
  )).rows[0].id;
  const child = (await db.query<{ id: string }>(
    "INSERT INTO child (family_id, name, birth_date, languages, learning_enabled) VALUES ($1, 'Bông', '2020-05-01', '{en}', $2) RETURNING id",
    [fam, opts.learning ?? true],
  )).rows[0].id;
  await db.query('INSERT INTO child_controls (child_id) VALUES ($1)', [child]);
  const pack = (await latestPack(db, opts.slug ?? 'bo'))!;
  const instance = (await db.query<{ id: string }>(
    `INSERT INTO character_instance (child_id, character_id, pack_version_id, role, language_mode, energy, playfulness, curiosity, warmth, structure, met_on)
     VALUES ($1, $2, $3, 'friend', $4, 70, 70, 80, 80, 40, current_date) RETURNING id`,
    [child, pack.characterId, pack.packVersionId, opts.languageMode ?? 'en'],
  )).rows[0].id;
  const [device] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
  if (opts.claimed !== false) {
    await db.query("UPDATE device SET status = 'active', family_id = $2, child_id = $3, claimed_at = now() WHERE id = $1", [device.device_id, fam, child]);
  }
  return { familyId: fam, parentId: parent, childId: child, instanceId: instance, device };
}
