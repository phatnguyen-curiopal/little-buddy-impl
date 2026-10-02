import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vi from '../src/i18n/vi.js';
import en from '../src/i18n/en.js';
import { EMOTIONS } from '../src/lib/emotions.js';
import { APP_SCREENS } from '../src/lib/routes.js';
import { TYPES, GROUPS, QUESTIONS, ROLES } from '../src/lib/personality.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sources(p));
    else if (/\.(jsx?|js)$/.test(entry.name) && !p.includes(`${path.sep}i18n${path.sep}`)) out.push(p);
  }
  return out;
}

test('both languages have exactly the same keys', () => {
  const missingInEn = Object.keys(vi).filter((k) => !(k in en));
  const missingInVi = Object.keys(en).filter((k) => !(k in vi));
  assert.deepEqual(missingInEn, [], 'keys missing in en');
  assert.deepEqual(missingInVi, [], 'keys missing in vi');
});

test('placeholders match between languages', () => {
  for (const key of Object.keys(vi)) {
    assert.deepEqual(placeholders(en[key]), placeholders(vi[key]), `placeholders differ for ${key}`);
  }
});

test('no em dashes in any string (house rule)', () => {
  for (const [lang, dict] of [['vi', vi], ['en', en]]) {
    for (const [k, v] of Object.entries(dict)) assert.ok(!v.includes(String.fromCharCode(0x2014)), `${lang}.${k} has an em dash`);
  }
});

test('every literal key used in the source exists', async () => {
  const used = new Set();
  for (const file of await sources(SRC)) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 100, `only found ${used.size} keys, the scan is probably broken`);
  const missing = [...used].filter((k) => !(k in vi));
  assert.deepEqual(missing, []);
});

test('keys built at runtime exist', () => {
  const dynamic = [
    ...EMOTIONS.flatMap((e) => [`emo_${e}`, `emoWhen_${e}`]),
    ...APP_SCREENS.map((r) => `nav_${r.name}`),
    ...['starter', 'family', 'big'].map((p) => `pack_${p}`),
    ...['disabled', 'no_credits', 'not_claimed', 'daily_limit', 'quiet_hours', 'abandoned', 'failed', 'accepted'].map((r) => `r_${r}`),
    ...['debit', 'purchase', 'welcome', 'grant', 'refund', 'expiry'].map((k) => `l_${k}`),
    ...[1, 2, 3, 4, 5].flatMap((n) => [`demo${n}q`, `demo${n}a`]),
    ...[1, 2, 3].flatMap((n) => [`s${n}t`, `s${n}b`]),
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`sa${n}t`, `sa${n}b`, `q${n}`, `a${n}`]),
    ...['awake', 'resting', 'support', 'revoked'],
    ...TYPES.flatMap((ty) => [`ptype_${ty.code}`, `ptypeDesc_${ty.code}`]),
    ...GROUPS.map((g) => `group_${g}`),
    ...QUESTIONS.flatMap((q) => [`pq${q.n}`, `pq${q.n}a`, `pq${q.n}b`]),
    ...ROLES.flatMap((r) => [`role_${r}`, `roleSays_${r}`]),
    ...['quiz', 'picked', 'default'].map((s) => `source_${s}`),
    ...['rate_limited', 'network_error', 'invalid_credentials', 'email_taken', 'claim_code_invalid', 'purchase_not_pending', 'disabled_by_operator'].map((c) => `err_${c}`),
  ];
  const missing = dynamic.filter((k) => !(k in vi) || !(k in en));
  assert.deepEqual(missing, []);
});
