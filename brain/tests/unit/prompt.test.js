import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSystemPrompt, personaBlock, withContext } from '../../persona/prompt.js';
import en from '../../persona/text/en.js';
import vi from '../../persona/text/vi.js';

const buddy = { name: 'Mây', role: 'friend', personality: 'ENFP' };
const child = { name: 'Bông', birth_year: 2020 };

function order(prompt, markers) {
  const at = markers.map((m) => prompt.indexOf(m));
  for (const [i, pos] of at.entries()) assert.ok(pos >= 0, `missing ${markers[i]}`);
  for (let i = 1; i < at.length; i++) assert.ok(at[i - 1] < at[i], `${markers[i - 1]} before ${markers[i]}`);
}

test('vi prompt keeps the prototype section order with the tag rule last', () => {
  const prompt = buildSystemPrompt({ lang: 'vi', buddy, child, life: 'ĐỜI SỐNG CỦA VAI x' });
  assert.ok(prompt.startsWith('Bạn là Mây, một người bạn đồ chơi biết nói chuyện của bạn Bông, sinh năm 2020.'));
  order(prompt, ['AN TOÀN', 'CÁCH NÓI', 'VAI: bạn thân', 'TÍNH CÁCH (khí chất kiểu ENFP', 'ĐỜI SỐNG CỦA VAI', 'KÝ ỨC', '\nCẢM XÚC TRÊN MẶT\n']);
  assert.match(prompt, /mình là Mây, người bạn đồ chơi/);
  assert.match(prompt, /Xưng "tớ", gọi bạn nhỏ là "cậu"/);
  assert.match(prompt, /\[neutral\] \[listening\]/);
  // The speech rules rank above the tag rule, so they must carve out the tag
  // themselves or the model is told to drop it.
  const speech = prompt.slice(prompt.indexOf('CÁCH NÓI'), prompt.indexOf('VAI: bạn thân'));
  assert.match(speech, /NGOẠI LỆ DUY NHẤT: đúng một thẻ cảm xúc/);
});

test('en prompt mirrors the same sections with English pronouns per role', () => {
  const prompt = buildSystemPrompt({ lang: 'en', buddy: { ...buddy, role: 'daddy', personality: 'ISTJ' }, child });
  assert.ok(prompt.startsWith('You are Mây, a talking toy friend of Bông, a child born in 2020.'));
  order(prompt, ['SAFETY', 'HOW TO TALK', 'ROLE: Daddy', 'PERSONALITY (a ISTJ', 'MEMORY', '\nFACE\n']);
  assert.match(prompt, /Call yourself "Daddy" and call the child "sweetie"/);
  assert.doesNotMatch(prompt, /THE LIFE OF THE ROLE/);
  const speech = prompt.slice(prompt.indexOf('HOW TO TALK'), prompt.indexOf('ROLE: Daddy'));
  assert.match(speech, /The ONE exception: exactly one emotion tag/);
});

test('an LLM_SYSTEM_PROMPT override replaces the persona but keeps the tag rule', () => {
  const prompt = buildSystemPrompt({ lang: 'vi', buddy, child, override: 'Bạn là một con robot.' });
  assert.ok(prompt.startsWith('Bạn là một con robot.'));
  assert.doesNotMatch(prompt, /AN TOÀN/);
  assert.match(prompt, /CẢM XÚC TRÊN MẶT/);
  assert.match(prompt, /\[sleepy\]/);
});

test('the reply language rule follows the toy setting, override or not', () => {
  order(buildSystemPrompt({ lang: 'en', buddy, child }), ['MEMORY', '\nLANGUAGE\n', '\nFACE\n']);
  assert.match(buildSystemPrompt({ lang: 'en', buddy, child }), /Always answer in English/);
  assert.match(buildSystemPrompt({ lang: 'vi', buddy, child }), /Luôn trả lời bằng tiếng Việt/);
  assert.match(buildSystemPrompt({ lang: 'en', buddy, child, override: 'You are a robot.' }), /Always answer in English/);
});

test('a toy with no child assigned still gets an identity line', () => {
  assert.match(buildSystemPrompt({ lang: 'vi', buddy, child: null }), /đồ chơi biết nói chuyện của một bạn nhỏ\./);
  assert.match(buildSystemPrompt({ lang: 'en', buddy, child: null }), /toy friend of a young child\./);
});

test('the persona block renders the vibe as bullets and falls back to ENFP', () => {
  const block = personaBlock({ lang: 'vi', role: 'teacher', personality: 'ENFJ' });
  assert.match(block, /^VAI: cô giáo\nXưng "cô"/);
  assert.match(block, /\n- Nồng hậu và giỏi cổ vũ/);
  assert.match(personaBlock({ lang: 'en', role: 'friend', personality: 'XXXX' }), /a ENFP temperament/);
});

test('context blocks ride after the static prompt, empty ones dropped', () => {
  assert.equal(withContext('S', ['', 'A', null, 'B']), 'S\n\nA\n\nB');
  assert.equal(withContext('S', ['', '']), 'S');
});

test('both languages define the same keys, all 16 vibes and all four roles', () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(vi), keys(en));
  assert.deepEqual(keys(vi.vibes), keys(en.vibes));
  assert.equal(keys(vi.vibes).length, 16);
  assert.deepEqual(keys(vi.roles), ['daddy', 'friend', 'mommy', 'teacher']);
  assert.deepEqual(keys(vi.blocks), keys(en.blocks));
  assert.deepEqual(keys(vi.extract), keys(en.extract));
  assert.deepEqual(keys(vi.life.moods), keys(en.life.moods));
  for (const text of [vi, en]) {
    for (const role of keys(text.roles)) assert.ok(text.noSpeech[role].length > 0);
  }
});

test('no em or en dashes anywhere in the prompt text (house rule)', () => {
  const all = JSON.stringify([vi, en], (k, v) => (typeof v === 'function' ? v.toString() : v instanceof RegExp ? v.source : v));
  assert.doesNotMatch(all, new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
});
