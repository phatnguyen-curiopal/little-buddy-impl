import { randomUUID } from 'node:crypto';
import http from 'node:http';

import { createApp, createDeps } from '../../app.js';
import { createLog } from '../../lib/log.js';
import { TEST_TOKEN } from './config.js';

// A brain on an ephemeral loopback port, with the given config and pool.
export async function startBrain(config, pool, { logLines = null } = {}) {
  const log = createLog({
    level: logLines ? 'debug' : 'silent',
    write: (line) => logLines?.push(JSON.parse(line)),
  });
  const deps = createDeps(config, { pool, log });
  const server = http.createServer(createApp(deps));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    deps,
    async close() {
      await deps.learner.drain();
      deps.history.close();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export function makeMeta(overrides = {}) {
  const childId = overrides.childId || randomUUID();
  const base = {
    turn_id: randomUUID(),
    conversation_id: overrides.conversation_id || randomUUID(),
    device_id: overrides.device_id || randomUUID(),
    subject: `child:${childId}`,
    child: { name: 'Bông', birth_year: 2020 },
    buddy: { name: 'Buddy', role: 'friend', personality: 'ENFP' },
    settings: { language: 'vi', voice_id: 'voice123', learn: false, mood_pin: null },
  };
  const { childId: _c, settings, buddy, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    buddy: { ...base.buddy, ...(buddy || {}) },
    settings: { ...base.settings, ...(settings || {}) },
  };
}

export async function postText(url, meta, text, { token = TEST_TOKEN, signal } = {}) {
  const res = await fetch(`${url}/v1/turns`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...meta, text }),
    signal,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function postVoice(url, meta, pcm, { token = TEST_TOKEN } = {}) {
  const res = await fetch(`${url}/v1/turns`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
      'x-lb-turn': Buffer.from(JSON.stringify(meta), 'utf8').toString('base64url'),
    },
    body: pcm,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export function pcmSeconds(sec) {
  return Buffer.alloc(Math.round(sec * 32000), 0);
}

export async function waitFor(check, { timeoutMs = 3000, stepMs = 20 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
