// One local HTTP server standing in for every upstream: OpenAI (chat,
// embeddings), Qwen (OpenAI-compatible), Anthropic (/v1/messages) and
// ElevenLabs (STT, TTS). Each test points the per-provider base-URL seams
// here, programs responses per service, and reads back what was sent.

import http from 'node:http';

export const DIMS = 3072;

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Bag of words hashed into 3072 dims: identical texts score 1, shared words
// score higher than none, which is all the retrieval tests need.
export function fakeEmbedding(text) {
  const vec = new Array(DIMS).fill(0);
  vec[0] = 0.05;
  for (const token of String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) vec[fnv1a(token) % DIMS] += 1;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / norm);
}

function parseMultipart(raw, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!boundary) return {};
  const marker = `--${boundary[1] || boundary[2]}`;
  const fields = {};
  const text = raw.toString('latin1');
  for (const part of text.split(marker).slice(1, -1)) {
    const split = part.indexOf('\r\n\r\n');
    const head = part.slice(0, split);
    const body = part.slice(split + 4, part.length - 2);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (!name) continue;
    const value = /filename="/.test(head) ? { bytes: Buffer.byteLength(body, 'latin1') } : Buffer.from(body, 'latin1').toString('utf8');
    (fields[name] ||= []).push(value);
  }
  return fields;
}

function jsonKind(body) {
  const system = String(body?.messages?.[0]?.content || '');
  if (/TÊN RIÊNG|PROPER NAMES/.test(system)) return 'names';
  if (/sửa lỗi nhận dạng|fix speech recognition/.test(system)) return 'fix';
  if (/hồ sơ ngắn|short profile/.test(system)) return 'profile';
  return 'other';
}

export function chatCompletion(content, { finish = 'stop', model = 'stub-model', usage, extra = {} } = {}) {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content, refusal: null }, finish_reason: finish }],
    usage: usage ?? { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, prompt_tokens_details: { cached_tokens: 3 } },
    ...extra,
  };
}

export function anthropicMessage(text, { stop = 'end_turn', model = 'stub-claude' } = {}) {
  return {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model,
    content: text === null ? [] : [{ type: 'text', text }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 21, output_tokens: 9, cache_read_input_tokens: 4 },
  };
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });

export async function startStub() {
  const calls = [];
  const state = {
    reply: '[happy] Chào bạn nhé!',
    transcript: 'xin chào',
    ttsBytes: 3200,
    handlers: {},
    delays: {},
  };

  const defaults = {
    'openai.chat': () => ({ json: chatCompletion(state.reply) }),
    'qwen.chat': () => ({ json: chatCompletion(state.reply, { model: 'stub-qwen' }) }),
    'openai.json': (call) => {
      const kind = jsonKind(call.body);
      if (kind === 'fix') {
        const user = String(call.body.messages[1].content);
        const sentence = user.split('\n').pop().replace(/^[^:]*:\s*/, '');
        return { json: chatCompletion(JSON.stringify({ text: sentence, fixed: [] })) };
      }
      if (kind === 'profile') return { json: chatCompletion(JSON.stringify({ ops: [] })) };
      return { json: chatCompletion(JSON.stringify({ names: [], summary: { ops: [] } })) };
    },
    'openai.embed': (call) => {
      const inputs = Array.isArray(call.body.input) ? call.body.input : [call.body.input];
      return {
        json: {
          object: 'list',
          data: inputs.map((input, index) => ({ object: 'embedding', index, embedding: fakeEmbedding(input) })),
          model: call.body.model,
          usage: { prompt_tokens: 1, total_tokens: 1 },
        },
      };
    },
    'anthropic.messages': () => ({ json: anthropicMessage(state.reply) }),
    'eleven.stt': () => ({ json: { text: state.transcript, language_code: 'vi' } }),
    'eleven.tts': () => ({ body: Buffer.alloc(state.ttsBytes, 1), type: 'application/octet-stream' }),
  };

  function route(method, path, body) {
    if (method !== 'POST') return 'unknown';
    if (path === '/openai/v1/chat/completions') return body?.response_format?.type === 'json_object' ? 'openai.json' : 'openai.chat';
    if (path === '/openai/v1/embeddings') return 'openai.embed';
    if (path === '/qwen/v1/chat/completions') return 'qwen.chat';
    if (path === '/anthropic/v1/messages') return 'anthropic.messages';
    if (path === '/eleven/v1/speech-to-text') return 'eleven.stt';
    if (path.startsWith('/eleven/v1/text-to-speech/')) return 'eleven.tts';
    return 'unknown';
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://stub');
    const type = String(req.headers['content-type'] || '');
    let body = null;
    if (type.includes('application/json')) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        body = null;
      }
    }
    const call = {
      method: req.method,
      path: url.pathname,
      query: url.searchParams,
      headers: req.headers,
      raw,
      body,
      form: type.includes('multipart/form-data') ? parseMultipart(raw, type) : null,
      aborted: false,
      at: Date.now(),
    };
    call.service = route(req.method, url.pathname, body);
    if (call.service === 'openai.json') call.kind = jsonKind(body);
    calls.push(call);
    res.on('close', () => {
      if (!res.writableFinished) call.aborted = true;
    });

    const handler = state.handlers[call.service] || defaults[call.service];
    const out = handler ? await handler(call, defaults) : { status: 404, json: { error: 'no route' } };
    const delay = out.delayMs ?? state.delays[call.service] ?? 0;
    if (delay) await sleep(delay, res);
    if (res.destroyed || res.writableEnded) return;
    if (out.json !== undefined) {
      res.writeHead(out.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.json));
    } else {
      res.writeHead(out.status || 200, { 'content-type': out.type || 'application/octet-stream' });
      res.end(out.body ?? '');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    calls,
    state,
    env: {
      OPENAI_BASE_URL: `${base}/openai/v1`,
      QWEN_BASE_URL: `${base}/qwen/v1`,
      ANTHROPIC_BASE_URL: `${base}/anthropic`,
      ELEVENLABS_BASE_URL: `${base}/eleven`,
    },
    // Programs one service; `fn(call, defaults)` returns {status, json|body, delayMs}.
    on(service, fn) {
      state.handlers[service] = fn;
    },
    reset() {
      calls.length = 0;
      state.handlers = {};
      state.delays = {};
      state.reply = '[happy] Chào bạn nhé!';
      state.transcript = 'xin chào';
      state.ttsBytes = 3200;
    },
    of(service, kind) {
      return calls.filter((c) => c.service === service && (!kind || c.kind === kind));
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
