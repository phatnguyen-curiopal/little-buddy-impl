import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_DESIGN, DESIGNS, ROBOTS, normalizeDesign } from '../src/lib/designs.js';

test('four designs, Miu by default and three robots', () => {
  assert.deepEqual(DESIGNS, ['miu', 'orbit', 'volt', 'glim']);
  assert.equal(DEFAULT_DESIGN, 'miu');
  assert.deepEqual([...ROBOTS].sort(), ['glim', 'orbit', 'volt']);
});

test('an unknown or missing design falls back to the default', () => {
  assert.equal(normalizeDesign('volt'), 'volt');
  assert.equal(normalizeDesign('classic'), 'miu');
  assert.equal(normalizeDesign(undefined), 'miu');
  assert.equal(normalizeDesign(null), 'miu');
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
