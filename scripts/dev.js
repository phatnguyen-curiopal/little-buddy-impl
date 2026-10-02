// Starts the three dev servers the web demo needs (brain, backend, frontend) in
// one terminal, each line prefixed with its service. No dependency on
// purpose: this is a dev convenience, not part of any service.
//
//   npm run dev           from the repo root; Ctrl+C stops all three
//
// If one server exits, the others are stopped too: a half-running demo
// (say, a backend with no brain) only fails later with a confusing turn error.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

// Order matters only for readability of the first lines: the backend does
// not call the brain at boot, and Vite proxies lazily.
const SERVICES = [
  { name: 'brain', dir: 'brain', color: 35, needsEnv: true, port: 8080, host: '127.0.0.1' },
  { name: 'backend', dir: 'backend', color: 36, needsEnv: true, port: 3000 },
  { name: 'frontend', dir: 'frontend', color: 33, needsEnv: false, port: 5174 },
];

const width = Math.max(...SERVICES.map((s) => s.name.length));
const tag = (s) => (process.stdout.isTTY ? `\x1b[${s.color}m${s.name.padEnd(width)}\x1b[0m` : s.name.padEnd(width));

// Missing installs or .env files fail inside a child with a long stack
// trace; checking first gives one clear line per problem instead.
const problems = [];
for (const s of SERVICES) {
  const dir = path.join(root, s.dir);
  if (!existsSync(path.join(dir, 'node_modules'))) problems.push(`${s.dir}: run "npm install" in ${s.dir}/`);
  if (s.needsEnv && !existsSync(path.join(dir, '.env'))) problems.push(`${s.dir}: copy ${s.dir}/.env.example to ${s.dir}/.env`);
}
// A server left over from an earlier run holds its port, and the new one
// would die with EADDRINUSE mid-startup; say so before starting anything.
function portInUse(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: host ?? 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
for (const s of SERVICES) {
  if (await portInUse(s.port, s.host)) problems.push(`${s.dir}: port ${s.port} is already in use (a dev server still running?)`);
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
  const child = spawn('npm', ['run', 'dev'], {
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

console.log('dev: brain http://127.0.0.1:8080  backend http://localhost:3000  frontend http://localhost:5174/app/talk (Ctrl+C stops all)');

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
