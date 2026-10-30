// "Forget everything": erases what Buddy learned and the friendship's
// history, in one transaction, and keeps the profile, controls, toy,
// character choice, alerts, digests and usage (API design, section 4).

import type { Db } from '../db/index.ts';

export async function forgetEverything(db: Db, childId: string): Promise<void> {
  await db.tx(async (q) => {
    for (const table of ['fact', 'person', 'child_event', 'episode', 'relationship_item', 'trait', 'what_works', 'turn', 'chat_session']) {
      await q.query(`DELETE FROM ${table} WHERE child_id = $1`, [childId]);
    }
    for (const table of ['buddy_canon', 'diary_entry', 'story_arc', 'mood_day']) {
      await q.query(`DELETE FROM ${table} WHERE instance_id IN (SELECT id FROM character_instance WHERE child_id = $1)`, [childId]);
    }
    await q.query(
      "UPDATE character_instance SET relationship_stage = 'meeting', met_on = current_date WHERE child_id = $1 AND status = 'active'",
      [childId],
    );
  });
}
