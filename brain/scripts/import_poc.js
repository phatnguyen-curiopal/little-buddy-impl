// Imports the prototype's world (memories, familiar names, the child
// profile and conversation summaries) into one child subject.
//
//   npm run import:poc -- --source postgres://...@localhost:5433/littlebuddy --child <child uuid>
//   ... --dry-run      print what would be imported and stop
//
// One transaction on the brain side: the subject's rows are deleted first,
// so a re-run is idempotent. The diary is not imported (its dates are
// stale); run seed:botlife instead. Vectors must be 3072-wide; null fact
// and summary vectors are re-embedded before the transaction opens.

import { pathToFileURL } from 'node:url';
import pg from 'pg';

import { loadConfig } from '../config.js';
import { createOpenAiClient } from '../llm/helper.js';
import { renderSummary } from '../memory/blocks.js';
import { EMBED_DIMS, createEmbedder } from '../memory/embed.js';
import { createPool, vectorLiteral, withTransaction } from '../store/db.js';
import * as factsStore from '../store/facts.js';
import * as namesStore from '../store/names.js';
import * as subjectsStore from '../store/subjects.js';
import * as summariesStore from '../store/summaries.js';
import { clusterConversations, mapExchange, mapFact, mapName, mapSummary } from './poc_map.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 100;

function arg(args, name) {
  const at = args.indexOf(name);
  return at > -1 ? String(args[at + 1] || '').trim() : '';
}

async function readSource(source) {
  const tables = await source.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('memories', 'familiar_names', 'child_profile', 'conversation_summaries')`,
  );
  const has = new Set(tables.rows.map((r) => r.table_name));
  const read = async (table, sql) => (has.has(table) ? (await source.query(sql)).rows : []);
  // Wider vectors fail here, before anything is written.
  const dims = await read(
    'memories',
    'SELECT DISTINCT vector_dims(embedding) AS dims FROM memories WHERE embedding IS NOT NULL',
  );
  for (const row of dims) {
    if (Number(row.dims) !== EMBED_DIMS) throw new Error(`memories hold ${row.dims}-dimension vectors, expected ${EMBED_DIMS}`);
  }
  return {
    memories: await read(
      'memories',
      `SELECT id, user_text, assistant_text, embedding::text AS embedding, created_at, conversation_id
         FROM memories ORDER BY created_at, id`,
    ),
    names: await read(
      'familiar_names',
      'SELECT name, display, kind, count, last_heard, contexts, age, relation, species FROM familiar_names',
    ),
    facts: await read(
      'child_profile',
      `SELECT id, category, fact, count, first_heard, last_heard, embedding::text AS embedding
         FROM child_profile ORDER BY id`,
    ),
    summaries: await read(
      'conversation_summaries',
      `SELECT conversation_id, points, next_id, category, created_at, updated_at, embedding::text AS embedding
         FROM conversation_summaries`,
    ),
  };
}

export function mapWorld(world, tag) {
  const conversationIds = clusterConversations(world.memories, tag);
  const facts = world.facts.map(mapFact);
  return {
    exchanges: world.memories.map((row) => mapExchange(row, conversationIds)),
    names: world.names.map(mapName),
    facts: facts.filter(Boolean),
    skippedFacts: facts.filter((f) => !f).length,
    summaries: world.summaries.map(mapSummary),
    clustered: conversationIds.size,
  };
}

async function insertExchanges(client, subject, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params = [];
    const values = chunk.map((row, j) => {
      params.push(subject, row.conversationId, row.userText, row.assistantText, vectorLiteral(row.embedding), row.createdAt);
      const b = j * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::vector, $${b + 6})`;
    });
    await client.query(
      `INSERT INTO exchanges (subject, conversation_id, user_text, assistant_text, embedding, created_at)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sourceUrl = arg(args, '--source');
  const childId = arg(args, '--child').toLowerCase();
  const dryRun = args.includes('--dry-run');
  if (!sourceUrl || !UUID_RE.test(childId)) {
    console.error('usage: npm run import:poc -- --source <postgres url> --child <child uuid> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const subject = `child:${childId}`;
  const config = loadConfig();

  const source = new pg.Client({ connectionString: sourceUrl, connectionTimeoutMillis: 5000 });
  await source.connect();
  let world;
  try {
    world = await readSource(source);
  } finally {
    await source.end();
  }
  const mapped = mapWorld(world, `imp${Date.now().toString(36)}`);
  console.log(
    `[import] source: ${world.memories.length} memories (${mapped.clustered} without a conversation id, clustered), ` +
      `${world.names.length} names, ${world.facts.length} profile facts (${mapped.skippedFacts} in retired categories), ` +
      `${world.summaries.length} summaries`,
  );
  if (dryRun) return;

  // Re-embedding happens outside the transaction: it is the slow part and
  // needs no lock.
  const missing = [...mapped.facts.filter((f) => !f.embedding), ...mapped.summaries.filter((s) => !s.embedding)];
  if (missing.length) {
    if (!config.keys.openai) throw new Error(`${missing.length} rows need re-embedding but OPENAI_API_KEY is not set`);
    const embed = createEmbedder(createOpenAiClient(config));
    for (const fact of mapped.facts) if (!fact.embedding) fact.embedding = await embed(fact.fact);
    for (const summary of mapped.summaries) {
      const text = renderSummary(summary);
      if (!summary.embedding && text) summary.embedding = await embed(text);
    }
    console.log(`[import] re-embedded ${missing.length} rows`);
  }

  const pool = createPool(config.databaseUrl, { max: 2 });
  try {
    await withTransaction(pool, async (client) => {
      const wiped = await subjectsStore.wipe(client, subject);
      console.log(`[import] cleared ${subject}: ${JSON.stringify(wiped)}`);
      await insertExchanges(client, subject, mapped.exchanges);
      for (const row of mapped.names) await namesStore.insertRaw(client, subject, row);
      for (const row of mapped.facts) await factsStore.insertRaw(client, subject, row);
      for (const row of mapped.summaries) await summariesStore.insertRaw(client, subject, row);
    });
    console.log(
      `[import] wrote ${mapped.exchanges.length} exchanges, ${mapped.names.length} names, ` +
        `${mapped.facts.length} facts, ${mapped.summaries.length} summaries into ${subject}`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[import] ${err.message}`);
    process.exitCode = 1;
  });
}
