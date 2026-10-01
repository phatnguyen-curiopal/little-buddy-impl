import http from 'node:http';

// A stand-in for the brain service (brain/docs/contract.md) so the backend
// pipeline is tested without it. Imports nothing from the app: brain-mode
// test files start it before their first config import, since BRAIN_URL
// must name its port. Every request is recorded with its decoded metadata
// and whether the backend hung up before the answer (an abort).

export const PCM = (bytes, seed = 1) => {
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i += 1) buf[i] = (i * 31 + seed) & 0xff;
  return buf;
};

export function reply(overrides = {}, { audioBytes = 0 } = {}) {
  return {
    no_speech: false,
    heard: 'con mèo',
    reply: 'Mèo con dễ thương quá!',
    emotion: 'happy',
    audio_b64: audioBytes ? PCM(audioBytes, 7).toString('base64') : null,
    audio_rate: audioBytes ? 16000 : null,
    provider: 'openai',
    model: 'stub',
    usage: { input: 1, output: 1, cached: 0 },
    timings_ms: { stt: 0, memory: 0, llm: 0, tts: 0, total: 0 },
    ...overrides,
  };
}

function decodeMeta(req, body) {
  if ((req.headers['content-type'] ?? '').startsWith('application/json')) {
    const { text, ...meta } = JSON.parse(body.toString('utf8'));
    return { meta, text };
  }
  const header = req.headers['x-lb-turn'];
  return { meta: header ? JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) : null, text: undefined };
}

export async function startBrainStub() {
  const calls = [];
  const waiters = [];
  // (call, res) => void; tests swap it per case.
  let handler = (call, res) => json(res, 200, reply());

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    try {
      for await (const chunk of req) chunks.push(chunk);
    } catch {
      return;
    }
    const body = Buffer.concat(chunks);
    const call = { method: req.method, url: req.url, headers: req.headers, body, aborted: false };
    if (req.method === 'POST') Object.assign(call, decodeMeta(req, body));
    call.closed = new Promise((resolve) => {
      res.on('close', () => {
        if (!res.writableEnded) call.aborted = true;
        resolve();
      });
    });
    calls.push(call);
    for (const w of waiters.splice(0)) w();
    handler(call, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    setHandler(fn) {
      handler = fn;
    },
    reset() {
      calls.length = 0;
      handler = (call, res) => json(res, 200, reply());
    },
    // Resolves with the first recorded call (optionally of a method) once
    // it has arrived.
    async nextCall(method = null, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = calls.find((c) => !method || c.method === method);
        if (found) return found;
        if (Date.now() > deadline) throw new Error('brain stub: no call arrived');
        await new Promise((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

export function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Never answers: the call ends only when the backend hangs up.
export const hang = () => {};
