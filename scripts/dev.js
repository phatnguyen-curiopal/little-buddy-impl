// Starts what the website needs (backend-v2 and the frontend) in one
// terminal, each line prefixed with its service. No dependency on purpose:
// this is a dev convenience, not part of any service.
//
//   npm run dev           from the repo root; Ctrl+C stops both
//
// If one server exits, the other is stopped too: a half-running site (say,
// pages with no API behind them) only fails later with a confusing error.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

// backend-v2 runs as dev:lite: its API, voice service and worker on the
// in-process PostgreSQL the tests use, so it needs no database server, and
// with no OpenAI or ElevenLabs keys it answers with its fake gateway. The
// first backend and the brain are not used by the site any more.
const SERVICES = [
  { name: 'backend-v2', dir: 'backend-v2', script: 'dev:lite', color: 36, ports: [3100, 3101] },
  { name: 'frontend', dir: 'frontend', script: 'dev', color: 33, ports: [5174] },
];

const width = Math.max(...SERVICES.map((s) => s.name.length));
const tag = (s) => (process.stdout.isTTY ? `\x1b[${s.color}m${s.name.padEnd(width)}\x1b[0m` : s.name.padEnd(width));

// A missing install fails inside a child with a long stack trace; checking
// first gives one clear line per problem instead.
const problems = [];
for (const s of SERVICES) {
  if (!existsSync(path.join(root, s.dir, 'node_modules'))) problems.push(`${s.dir}: run "npm install" in ${s.dir}/`);
}
// A server left over from an earlier run holds its port, and the new one
// would die with EADDRINUSE mid-startup; say so before starting anything.
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
for (const s of SERVICES) {
  for (const port of s.ports) {
    if (await portInUse(port)) problems.push(`${s.dir}: port ${port} is already in use (a dev server still running?)`);
  }
}
if (problems.length) {
  for (const p of problems) console.error(`dev: ${p}`);
  process.exit(1);
}

const children = new Map();
let stopping = false;

function pipeLines(stream, s, out) {
  let buffered = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    for (const line of lines) out.write(`${tag(s)} | ${line}\n`);
  });
  stream.on('end', () => {
    if (buffered) out.write(`${tag(s)} | ${buffered}\n`);
  });
}

// npm on Windows runs through cmd.exe, so killing the npm process leaves
// node running and holding the port; taskkill /T takes the whole tree.
function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) kill(child);
  // Give the children a moment to print their last lines.
  setTimeout(() => process.exit(code), 300);
}

for (const s of SERVICES) {
  const child = spawn('npm', ['run', s.script], {
    cwd: path.join(root, s.dir),
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? '1' : '0' },
  });
  children.set(s.name, child);
  pipeLines(child.stdout, s, process.stdout);
  pipeLines(child.stderr, s, process.stderr);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`${tag(s)} | exited (${signal ?? code}); stopping the others`);
    stopAll(code || 1);
  });
}

console.log('dev: backend-v2 http://localhost:3100 (voice :3101, data in backend-v2/.pglite/)  site http://localhost:5174/app (Ctrl+C stops both)');

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
