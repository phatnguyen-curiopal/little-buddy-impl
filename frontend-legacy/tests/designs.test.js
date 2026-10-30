import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_DESIGN, DESIGNS, designOf, normalizeDesign } from '../src/lib/designs.js';
import { DEFAULT_PROFILE } from '../src/lib/personality.js';

test('three designs, orbit by default, the same codes as the backend', async () => {
  assert.deepEqual(DESIGNS, ['orbit', 'volt', 'glim']);
  assert.equal(DEFAULT_DESIGN, 'orbit');
  assert.equal(DEFAULT_PROFILE.design, DEFAULT_DESIGN);
  const roles = await readFile(new URL('../../backend/personalization/roles.js', import.meta.url), 'utf8');
  assert.match(roles, /DESIGNS = Object\.freeze\(\['orbit', 'volt', 'glim'\]\)/);
});

test('an unknown or missing design falls back to the default', () => {
  assert.equal(normalizeDesign('volt'), 'volt');
  assert.equal(normalizeDesign('classic'), 'orbit');
  assert.equal(normalizeDesign(undefined), 'orbit');
  assert.equal(normalizeDesign(null), 'orbit');
});

test('a toy is drawn in its own design; one without a profile in the default', () => {
  assert.equal(designOf({ profile: { design: 'glim' } }), 'glim');
  assert.equal(designOf({ profile: null }), 'orbit');
  assert.equal(designOf(undefined), 'orbit');
});

test('every shape the stylesheet uses is generated', async () => {
  const css = await readFile(new URL('../src/styles/buddy.css', import.meta.url), 'utf8');
  const shapes = await readFile(new URL('../src/styles/buddy-shapes.css', import.meta.url), 'utf8');
  const used = new Set([...css.matchAll(/var\(--bd-((?:m[A-Z]|[a-z])\w*)\)/g)].map((m) => m[1]));
  const known = new Set([...shapes.matchAll(/--bd-(\w+): polygon/g)].map((m) => m[1]));
  const vars = new Set(['el', 'er', 'm', 'lx', 'ly', 'gx', 'gy', 'vc', 'vg', 'ga', 'spring', 'ease']);
  const missing = [...used].filter((name) => !known.has(name) && !vars.has(name));
  assert.deepEqual(missing, []);
  // Every shape has the same point count, or clip-path cannot morph between them.
  const counts = new Set([...shapes.matchAll(/polygon\(([^)]*)\)/g)].map((m) => m[1].split(',').length));
  assert.equal(counts.size, 1);
});
