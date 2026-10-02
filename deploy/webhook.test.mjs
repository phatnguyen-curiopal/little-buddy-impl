// node --test deploy/webhook.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, decide, validSignature } from './webhook.mjs';

const secret = 's'.repeat(40);
const repo = 'owner/little-buddy';
const ref = 'refs/heads/main';
const sign = (body, key = secret) => `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;
const push = (over = {}) => Buffer.from(JSON.stringify({ ref, after: 'a'.repeat(40), repository: { full_name: repo }, ...over }));
const run = (body, headers) => decide({ secret, repo, ref, body, headers: { 'x-github-event': 'push', 'x-hub-signature-256': sign(body), ...headers } });

test('the signature must match the exact body and secret', () => {
  const body = push();
  assert.equal(validSignature(secret, body, sign(body)), true);
  assert.equal(validSignature(secret, body, sign(body, 'x'.repeat(40))), false);
  assert.equal(validSignature(secret, Buffer.concat([body, Buffer.from(' ')]), sign(body)), false);
  for (const bad of [undefined, '', 'sha1=abc', sign(body).slice(0, -1)]) assert.equal(validSignature(secret, body, bad), false);
});

test('only a signed push to main of this repo deploys', () => {
  assert.deepEqual(run(push()), { status: 202, body: 'deploy queued', deploy: 'a'.repeat(40) });
  assert.equal(run(push(), { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }).status, 401);
  assert.equal(run(push({ ref: 'refs/heads/feature' })).deploy, undefined);
  assert.equal(run(push({ repository: { full_name: 'someone/else' } })).deploy, undefined);
  assert.equal(run(push({ deleted: true })).deploy, undefined);
  assert.equal(run(push(), { 'x-github-event': 'issues' }).status, 204);
  assert.deepEqual(run(Buffer.from('{}'), { 'x-github-event': 'ping' }), { status: 200, body: 'pong' });
  assert.equal(run(Buffer.from('payload=%7B%7D')).status, 400);
});

test('a valid push rewrites the trigger file; anything else leaves it alone', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lb-hook-'));
  const trigger = path.join(dir, 'trigger');
  const server = createServer({ secret, repo, trigger }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/hooks/deploy`;
  const post = (body, headers) => fetch(url, { method: 'POST', body, headers: { 'x-github-event': 'push', 'x-hub-signature-256': sign(body), ...headers } });
  try {
    assert.equal((await post(push(), { 'x-hub-signature-256': sign(push(), 'y'.repeat(40)) })).status, 401);
    await assert.rejects(readFile(trigger));
    assert.equal((await post(push())).status, 202);
    assert.match(await readFile(trigger, 'utf8'), new RegExp(`^\\d+ ${'a'.repeat(40)}\\n$`));
    assert.equal((await fetch(url.replace('/hooks/deploy', '/'), { method: 'POST' })).status, 404);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
