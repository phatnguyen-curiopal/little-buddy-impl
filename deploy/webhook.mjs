// GitHub push webhook: a push to main of this repo starts a deploy.
//
// This process holds no privilege (systemd DynamicUser) and does one thing
// on a valid push: it rewrites a trigger file. A systemd path unit watches
// that file and starts little-buddy-deploy.service as root, which runs
// deploy/auto_deploy.sh. So a bug here can at worst start a deploy of what
// is already on main. Node 18 compatible (the host's /usr/bin/node), no
// dependencies.
//
//   WEBHOOK_SECRET   the secret set on the GitHub webhook (at least 32 chars)
//   WEBHOOK_REPO     owner/name; pushes from any other repo are ignored
//   WEBHOOK_BRANCH   default main
//   WEBHOOK_PORT     default 9130, bound to 127.0.0.1 (nginx proxies to it)

import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// GitHub caps a delivery at 25 MB.
const MAX_BODY = 25 * 1024 * 1024;

function log(event, fields = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

export function validSignature(secret, body, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Pure decision for one delivery: { status, body, deploy? }. The signature is
// checked before the payload is parsed, so unsigned input is never parsed.
export function decide({ secret, repo, ref, headers, body }) {
  if (!validSignature(secret, body, headers['x-hub-signature-256'])) return { status: 401, body: 'bad signature' };
  const event = headers['x-github-event'];
  if (event === 'ping') return { status: 200, body: 'pong' };
  if (event !== 'push') return { status: 204, body: '' };
  let payload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return { status: 400, body: 'expected a JSON payload' };
  }
  if (payload?.repository?.full_name !== repo || payload.ref !== ref || payload.deleted) return { status: 204, body: '' };
  return { status: 202, body: 'deploy queued', deploy: String(payload.after ?? '') };
}

export function createServer({ secret, repo, branch = 'main', trigger }) {
  const ref = `refs/heads/${branch}`;
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/hooks/deploy') {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      if (res.writableEnded) return;
      const delivery = req.headers['x-github-delivery'];
      const result = decide({ secret, repo, ref, headers: req.headers, body: Buffer.concat(chunks) });
      if (result.deploy !== undefined) {
        try {
          // New content on every push, so the path unit always sees a change
          // and auto_deploy.sh can tell a push that landed mid-deploy.
          await writeFile(trigger, `${Date.now()} ${result.deploy}\n`);
        } catch (err) {
          log('trigger_failed', { delivery, err_message: err.message });
          res.writeHead(500).end();
          return;
        }
      }
      log('delivery', { delivery, github_event: req.headers['x-github-event'], status: result.status, after: result.deploy?.slice(0, 12) });
      res.writeHead(result.status, { 'content-type': 'text/plain' }).end(result.body);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.WEBHOOK_SECRET ?? '';
  const repo = process.env.WEBHOOK_REPO ?? '';
  if (secret.length < 32) throw new Error('WEBHOOK_SECRET is missing or shorter than 32 chars');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('WEBHOOK_REPO must be owner/name');
  const port = Number(process.env.WEBHOOK_PORT || 9130);
  // systemd sets STATE_DIRECTORY from StateDirectory=.
  const trigger = path.join(process.env.STATE_DIRECTORY || '/var/lib/little-buddy-webhook', 'trigger');
  createServer({ secret, repo, branch: process.env.WEBHOOK_BRANCH || 'main', trigger }).listen(port, '127.0.0.1', () => log('listening', { port, repo }));
}
