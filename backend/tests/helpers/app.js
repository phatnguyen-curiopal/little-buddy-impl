import http from 'node:http';
import { createApp } from '../../app.js';

// Boots the real app on an ephemeral port and returns a small fetch wrapper.
// The raw http server is exposed so the WebSocket upgrade handler can be
// attached exactly as server.js does.
export async function startTestServer({ attach } = {}) {
  const app = createApp();
  const server = http.createServer(app);
  if (attach) attach(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(method, path, { body, raw, token, headers = {} } = {}) {
    const h = { ...headers };
    let payload;
    if (raw !== undefined) {
      payload = raw;
    } else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) h.authorization = `Bearer ${token}`;
    const res = await fetch(baseUrl + path, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, text, headers: res.headers };
  }

  return {
    app,
    server,
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}`,
    api,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
