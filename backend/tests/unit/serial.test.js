import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialFor, parseSerial, isBatchLabel } from '../../devices/serial.js';

test('serial is label-dash-4-digit-index and parses back', () => {
  assert.equal(serialFor('2026W38A', 1), '2026W38A-0001');
  assert.equal(serialFor('DEMO01', 9999), 'DEMO01-9999');
  assert.deepEqual(parseSerial('2026W38A-0042'), { batchLabel: '2026W38A', index: 42 });
});

test('invalid labels and indexes are rejected', () => {
  assert.equal(isBatchLabel('ok1'), false, 'lowercase');
  assert.equal(isBatchLabel('AB'), false, 'too short');
  assert.equal(isBatchLabel('A'.repeat(17)), false, 'too long');
  assert.throws(() => serialFor('bad label', 1), /batch label/);
  assert.throws(() => serialFor('OK1', 0), /index/);
  assert.throws(() => serialFor('OK1', 10000), /index/);
  assert.equal(parseSerial('nope'), null);
  assert.equal(parseSerial(42), null);
});
