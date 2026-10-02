import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../config.js';

const validProd = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db:5432/lb',
  REDIS_URL: 'redis://cache:6379/0',
  JWT_SECRET: 'j'.repeat(40),
  ADMIN_TOKEN: 'a'.repeat(40),
  DEVICE_KEK: 'k'.repeat(40),
};

test('development boots from an empty env using compose defaults', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.nodeEnv, 'development');
  assert.equal(cfg.isProd, false);
  assert.match(cfg.databaseUrl, /localhost:5432\/littlebuddy$/);
  assert.match(cfg.redisUrl, /localhost:6379/);
  assert.equal(cfg.deviceAuth, 'on');
  assert.equal(cfg.port, 3000);
});

test('config object is frozen', () => {
  const cfg = loadConfig({});
  assert.ok(Object.isFrozen(cfg));
});

test('valid production env loads', () => {
  const cfg = loadConfig(validProd);
  assert.equal(cfg.isProd, true);
  assert.equal(cfg.jwtSecret, validProd.JWT_SECRET);
});

test('production requires DATABASE_URL and REDIS_URL', () => {
  assert.throws(() => loadConfig({ ...validProd, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ ...validProd, REDIS_URL: '' }), /REDIS_URL/);
});

test('production refuses default or short secrets', () => {
  assert.throws(() => loadConfig({ ...validProd, JWT_SECRET: 'dev-jwt-secret-change-me' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ ...validProd, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ ...validProd, ADMIN_TOKEN: 'dev-admin-token-change-me' }), /ADMIN_TOKEN/);
  assert.throws(() => loadConfig({ ...validProd, DEVICE_KEK: 'CHANGE_ME' }), /DEVICE_KEK/);
  assert.throws(() => loadConfig({ ...validProd, DEVICE_KEK: 'tooshort' }), /DEVICE_KEK/);
});

test('production refuses DEVICE_AUTH=off; development allows it', () => {
  assert.throws(() => loadConfig({ ...validProd, DEVICE_AUTH: 'off' }), /DEVICE_AUTH=off/);
  assert.equal(loadConfig({ DEVICE_AUTH: 'off' }).deviceAuth, 'off');
  assert.equal(loadConfig({ DEVICE_AUTH: 'OFF' }).deviceAuth, 'off');
  assert.throws(() => loadConfig({ DEVICE_AUTH: 'maybe' }), /DEVICE_AUTH/);
});

test('rejects unknown NODE_ENV and out-of-range integers', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/);
  assert.throws(() => loadConfig({ DEVICE_CLOCK_SKEW_SEC: '5' }), /DEVICE_CLOCK_SKEW_SEC/);
});

test('turn and credit knobs have defaults and only known providers are accepted', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.providerMode, 'mock');
  assert.equal(cfg.welcomeCredits, 10);
  assert.equal(cfg.turnMaxSec, 120);
  assert.equal(cfg.conversationIdleSec, 300);
  assert.equal(loadConfig({ WELCOME_CREDITS: '0' }).welcomeCredits, 0);
  assert.equal(loadConfig({ PROVIDER_MODE: 'BRAIN' }).providerMode, 'brain');
  assert.throws(() => loadConfig({ PROVIDER_MODE: 'openai' }), /PROVIDER_MODE/);
  assert.throws(() => loadConfig({ TURN_MAX_SEC: '1' }), /TURN_MAX_SEC/);
});

test('demo payments are the dev default and refused in production', () => {
  assert.equal(loadConfig({}).paymentProvider, 'demo');
  assert.equal(loadConfig(validProd).paymentProvider, 'disabled');
  assert.throws(() => loadConfig({ ...validProd, PAYMENT_PROVIDER: 'demo' }), /PAYMENT_PROVIDER=demo/);
  assert.throws(() => loadConfig({ PAYMENT_PROVIDER: 'stripe' }), /PAYMENT_PROVIDER/);
  assert.equal(loadConfig({ PAYMENT_PROVIDER: 'disabled' }).paymentProvider, 'disabled');
});

test('test env defaults log level to silent, development to info', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).logLevel, 'silent');
  assert.equal(loadConfig({}).logLevel, 'info');
});

test('brain defaults: local URL, 45 s timeout, and a stale margin that outlasts it', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.brainUrl, 'http://127.0.0.1:8080');
  assert.equal(cfg.brainTimeoutMs, 45_000);
  assert.equal(cfg.turnStaleSec, 120 + 60);
  // A long brain timeout pushes the margin past the old fixed 60 s.
  const slow = loadConfig({ BRAIN_TIMEOUT_MS: '120000', TURN_MAX_SEC: '30' });
  assert.equal(slow.turnStaleSec, 30 + 135);
  for (const ms of [1000, 45_000, 300_000]) {
    const c = loadConfig({ BRAIN_TIMEOUT_MS: String(ms) });
    assert.ok(ms < (c.turnStaleSec - c.turnMaxSec - 10) * 1000, `brain timeout ${ms} stays under the stale margin`);
  }
  assert.throws(() => loadConfig({ BRAIN_TIMEOUT_MS: '500' }), /BRAIN_TIMEOUT_MS/);
  assert.throws(() => loadConfig({ BRAIN_TIMEOUT_MS: '400000' }), /BRAIN_TIMEOUT_MS/);
  assert.throws(() => loadConfig({ BRAIN_URL: 'not a url' }), /BRAIN_URL/);
  assert.throws(() => loadConfig({ BRAIN_URL: 'ftp://brain' }), /BRAIN_URL/);
});

test('production in brain mode refuses a default or short BRAIN_TOKEN; mock mode does not need one', () => {
  assert.throws(() => loadConfig({ ...validProd, PROVIDER_MODE: 'brain' }), /BRAIN_TOKEN/);
  assert.throws(() => loadConfig({ ...validProd, PROVIDER_MODE: 'brain', BRAIN_TOKEN: 'short' }), /BRAIN_TOKEN/);
  assert.equal(loadConfig({ ...validProd, PROVIDER_MODE: 'brain', BRAIN_TOKEN: 'b'.repeat(40) }).brainToken, 'b'.repeat(40));
  assert.equal(loadConfig(validProd).providerMode, 'mock');
  assert.equal(loadConfig({ PROVIDER_MODE: 'brain' }).providerMode, 'brain');
});

test('brain mode refuses a TURN_MAX_SEC whose full voice turn is over the brain 6 MB body limit', () => {
  assert.equal(loadConfig({ PROVIDER_MODE: 'brain', TURN_MAX_SEC: '196' }).turnMaxSec, 196);
  assert.ok(196 * 32000 <= 6 * 1024 * 1024);
  assert.throws(() => loadConfig({ PROVIDER_MODE: 'brain', TURN_MAX_SEC: '197' }), /TURN_MAX_SEC must be at most 196/);
  assert.equal(loadConfig({ PROVIDER_MODE: 'mock', TURN_MAX_SEC: '600' }).turnMaxSec, 600);
});

test('the web toy is on outside production and off in production unless set', () => {
  assert.equal(loadConfig({}).webToy, true);
  assert.equal(loadConfig({ WEB_TOY: 'off' }).webToy, false);
  assert.equal(loadConfig(validProd).webToy, false);
  assert.equal(loadConfig({ ...validProd, WEB_TOY: 'on' }).webToy, true);
  assert.throws(() => loadConfig({ WEB_TOY: 'maybe' }), /WEB_TOY/);
});

test('HOST binds one interface; unset or empty listens on all', () => {
  assert.equal(loadConfig({}).host, undefined);
  assert.equal(loadConfig({ HOST: '' }).host, undefined);
  assert.equal(loadConfig({ HOST: '127.0.0.1' }).host, '127.0.0.1');
});
