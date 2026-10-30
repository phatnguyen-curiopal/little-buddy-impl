import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { WebSocketServer } from 'ws';

import { CLOSE } from './protocol.ts';
import { DeviceSession } from './session.ts';
import type { VoiceDeps } from './turn.ts';

export function createVoiceServer(deps: VoiceDeps) {
  const registry = new Map<string, DeviceSession>();
  const http: Server = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, connections: registry.size }));
      return;
    }
    res.writeHead(404).end();
  });
  // 64 KB is far above one 20 ms frame (644 bytes) and bounds a bad client.
  const wss = new WebSocketServer({ server: http, path: '/v1/device', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => new DeviceSession(ws, deps, registry).start());

  return {
    registry,
    // Closes a toy's live socket at once, for disable, revoke or unpair.
    kick(deviceId: string): boolean {
      const s = registry.get(deviceId);
      s?.close(CLOSE.BLOCKED, 'toy blocked');
      return Boolean(s);
    },
    listen(port: number, host: string): Promise<number> {
      return new Promise((resolve) => http.listen(port, host, () => resolve((http.address() as AddressInfo).port)));
    },
    async close(): Promise<void> {
      for (const s of registry.values()) s.close(1001, 'server shutting down');
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

export type VoiceServer = ReturnType<typeof createVoiceServer>;
