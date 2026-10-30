import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { WebSocketServer, type WebSocket } from 'ws';

import { loadConfig } from '../../src/config.ts';
import { createRealtimeStt } from '../../src/gateway/realtime-stt.ts';
import type { SttStreamOptions } from '../../src/gateway/types.ts';

interface Chunk {
  message_type: string;
  audio_base_64: string;
  commit: boolean;
  sample_rate: number;
}

// A stand-in for ElevenLabs' realtime endpoint; each test scripts how it
// answers, and every connection is recorded.
type Script = (ws: WebSocket, chunks: Chunk[]) => void;

describe('realtime speech recognition', () => {
  let server: WebSocketServer;
  let baseUrl: string;
  let script: Script = () => {};
  const seen: { url: string; key: string | undefined; chunks: Chunk[] }[] = [];

  before(async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const conn = { url: req.url ?? '', key: req.headers['xi-api-key'] as string | undefined, chunks: [] as Chunk[] };
      seen.push(conn);
      ws.on('message', (data) => conn.chunks.push(JSON.parse(data.toString()) as Chunk));
      script(ws, conn.chunks);
    });
  });
  after(() => new Promise((r) => server.close(r)));

  const cfg = () => ({ ...loadConfig({ NODE_ENV: 'test' }).elevenlabs, baseUrl, apiKey: 'test-key' });
  const say = (ws: WebSocket, m: Record<string, unknown>) => ws.send(JSON.stringify(m));
  const audioOf = (chunks: Chunk[]) => Buffer.concat(chunks.map((c) => Buffer.from(c.audio_base_64, 'base64')));
  const opts = (extra: Partial<SttStreamOptions> = {}): SttStreamOptions => ({ language: 'vi', keyterms: ['Bông', 'Mochi'], ...extra });

  it('streams audio after the session starts, shows partials and commits on finish', async () => {
    script = (ws, chunks) => {
      setTimeout(() => say(ws, { message_type: 'session_started', session_id: 's1' }), 30);
      ws.on('message', () => {
        const last = chunks[chunks.length - 1];
        if (last.commit) say(ws, { message_type: 'committed_transcript', text: 'Bông ơi, con vẽ con mèo.' });
        else if (chunks.length === 2) say(ws, { message_type: 'partial_transcript', text: 'Bông ơi' });
      });
    };
    const partials: string[] = [];
    const fallbacks: string[] = [];
    const stt = createRealtimeStt(cfg(), async () => 'batch', (r) => fallbacks.push(r))(opts({ onPartial: (t) => partials.push(t) }));
    // Written before session_started: held, then sent in 100 ms pieces.
    stt.write(Buffer.alloc(8000, 1));
    await new Promise((r) => setTimeout(r, 80));
    stt.write(Buffer.alloc(640, 2));
    assert.equal(await stt.finish(), 'Bông ơi, con vẽ con mèo.');
    assert.deepEqual(partials, ['Bông ơi']);
    assert.deepEqual(fallbacks, []);

    const conn = seen[seen.length - 1];
    const url = new URL(conn.url, baseUrl);
    assert.equal(url.pathname, '/v1/speech-to-text/realtime');
    assert.deepEqual(
      { model: url.searchParams.get('model_id'), format: url.searchParams.get('audio_format'), lang: url.searchParams.get('language_code'), commit: url.searchParams.get('commit_strategy') },
      { model: 'scribe_v2_realtime', format: 'pcm_16000', lang: 'vi', commit: 'manual' },
    );
    assert.deepEqual(url.searchParams.getAll('keyterms'), ['Bông', 'Mochi']);
    assert.equal(conn.key, 'test-key');
    const audio = conn.chunks.filter((c) => !c.commit);
    assert.ok(audio.every((c) => Buffer.from(c.audio_base_64, 'base64').length <= 3200));
    assert.equal(audioOf(audio).length, 8640, 'every byte arrives, in order');
    const commit = conn.chunks[conn.chunks.length - 1];
    assert.deepEqual([commit.commit, commit.audio_base_64, commit.sample_rate], [true, '', 16000]);
  });

  it('commits as soon as the session starts when the child finished first', async () => {
    script = (ws, chunks) => {
      setTimeout(() => say(ws, { message_type: 'session_started' }), 60);
      ws.on('message', () => {
        if (chunks[chunks.length - 1].commit) say(ws, { message_type: 'committed_transcript', text: 'hello' });
      });
    };
    const stt = createRealtimeStt(cfg(), async () => 'batch')(opts());
    stt.write(Buffer.alloc(6400));
    assert.equal(await stt.finish(), 'hello');
    assert.equal(audioOf(seen[seen.length - 1].chunks).length, 6400);
  });

  it('treats a tap with no voice as an empty turn', async () => {
    script = (ws, chunks) => {
      say(ws, { message_type: 'session_started' });
      ws.on('message', () => {
        if (chunks[chunks.length - 1].commit) say(ws, { message_type: 'insufficient_audio_activity', error: 'no speech' });
      });
    };
    const stt = createRealtimeStt(cfg(), async () => 'batch')(opts());
    stt.write(Buffer.alloc(9600));
    assert.equal(await stt.finish(), '');
  });

  it('falls back to the last partial, or to batch on the buffered audio, when the stream fails', async () => {
    script = (ws, chunks) => {
      say(ws, { message_type: 'session_started' });
      ws.on('message', () => {
        if (chunks.length === 1) say(ws, { message_type: 'partial_transcript', text: 'con mèo' });
        if (chunks[chunks.length - 1].commit) say(ws, { message_type: 'transcriber_error', error: 'boom' });
      });
    };
    const fallbacks: string[] = [];
    const withPartial = createRealtimeStt(cfg(), async () => 'batch', (r) => fallbacks.push(r))(opts());
    withPartial.write(Buffer.alloc(3200));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await withPartial.finish(), 'con mèo');

    script = (ws) => ws.close(1011);
    let batchBytes = 0;
    const noPartial = createRealtimeStt(cfg(), async (pcm) => {
      batchBytes = pcm.length;
      return 'from batch';
    }, (r) => fallbacks.push(r))(opts());
    noPartial.write(Buffer.alloc(4000));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await noPartial.finish(), 'from batch');
    assert.equal(batchBytes, 4000);
    assert.deepEqual(fallbacks, ['transcriber_error', 'socket closed']);
  });

  it('stops when the turn is aborted', async () => {
    script = (ws) => say(ws, { message_type: 'session_started' });
    const abort = new AbortController();
    const stt = createRealtimeStt(cfg(), async () => 'batch')(opts({ signal: abort.signal }));
    stt.write(Buffer.alloc(3200));
    abort.abort();
    await assert.rejects(stt.finish(), (e: { kind?: string }) => e.kind === 'aborted');
  });
});
