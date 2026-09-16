import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBody, isUuid, normalizeEmail } from '../../lib/validate.js';

const details = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'validation_error');
    return err.extra.details;
  }
  assert.fail('expected validation to throw');
};

test('email is trimmed and lowercased; invalid emails fail', () => {
  const out = validateBody({ email: '  Foo@Example.COM ' }, { email: { type: 'email', required: true } });
  assert.equal(out.email, 'foo@example.com');
  const errs = details(() => validateBody({ email: 'nope' }, { email: { type: 'email', required: true } }));
  assert.deepEqual(errs.map((e) => e.field), ['email']);
});

test('required fields are reported together, not one at a time', () => {
  const errs = details(() => validateBody({}, { a: { type: 'string', required: true }, b: { type: 'int', required: true } }));
  assert.deepEqual(errs.map((e) => e.field).sort(), ['a', 'b']);
});

test('string bounds and trimming; passwords keep whitespace', () => {
  assert.equal(validateBody({ n: '  hi  ' }, { n: { type: 'string' } }).n, 'hi');
  assert.equal(validateBody({ p: '  pw  ' }, { p: { type: 'string', trim: false } }).p, '  pw  ');
  details(() => validateBody({ p: 'short' }, { p: { type: 'string', min: 8 } }));
  details(() => validateBody({ p: 'x'.repeat(9) }, { p: { type: 'string', max: 8 } }));
  details(() => validateBody({ p: 42 }, { p: { type: 'string' } }));
});

test('int range, uuid, enum and nullable', () => {
  assert.equal(validateBody({ y: 2020 }, { y: { type: 'int', min: 2000, max: 2100 } }).y, 2020);
  details(() => validateBody({ y: 1999 }, { y: { type: 'int', min: 2000, max: 2100 } }));
  details(() => validateBody({ y: '2020' }, { y: { type: 'int' } }));
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(validateBody({ id: id.toUpperCase() }, { id: { type: 'uuid' } }).id, id);
  details(() => validateBody({ id: 'abc' }, { id: { type: 'uuid' } }));
  assert.equal(validateBody({ k: 'b' }, { k: { type: 'enum', values: ['a', 'b'] } }).k, 'b');
  details(() => validateBody({ k: 'c' }, { k: { type: 'enum', values: ['a', 'b'] } }));
  assert.equal(validateBody({ c: null }, { c: { type: 'uuid', nullable: true } }).c, null);
  details(() => validateBody({ c: null }, { c: { type: 'uuid', required: true } }));
});

test('unknown fields are dropped and a non-object body counts as empty', () => {
  assert.deepEqual(validateBody({ a: 'x', evil: 1 }, { a: { type: 'string' } }), { a: 'x' });
  assert.deepEqual(validateBody('str', { a: { type: 'string' } }), {});
  assert.deepEqual(validateBody([1], { a: { type: 'string' } }), {});
});

test('helpers', () => {
  assert.equal(isUuid('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isUuid('x'), false);
  assert.equal(normalizeEmail(' A@B.C '), 'a@b.c');
  assert.equal(normalizeEmail(5), '');
});
