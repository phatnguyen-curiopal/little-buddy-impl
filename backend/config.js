// Configuration is read from the environment exactly once and frozen, so a
// typo in an env name fails at boot rather than deep inside a request, and no
// module can quietly re-read process.env with a different default.

const DEFAULT_JWT_SECRET = 'dev-jwt-secret-change-me';
const DEFAULT_ADMIN_TOKEN = 'dev-admin-token-change-me';
const KEK_PLACEHOLDER = 'CHANGE_ME';
const DEV_DATABASE_URL = 'postgres://littlebuddy:littlebuddy@localhost:5432/littlebuddy';
const DEV_REDIS_URL = 'redis://localhost:6379/0';

const NODE_ENVS = new Set(['development', 'test', 'production']);

function fail(message) {
  throw new Error(`config: ${message}`);
}

function readInt(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!NODE_ENVS.has(nodeEnv)) fail(`NODE_ENV must be one of ${[...NODE_ENVS].join(', ')}`);
  const isProd = nodeEnv === 'production';

  // Dev and test fall back to the compose defaults so an empty .env boots.
  // Production must be explicit: a wrong default there points at nothing.
  const databaseUrl = env.DATABASE_URL || (isProd ? undefined : DEV_DATABASE_URL);
  const redisUrl = env.REDIS_URL || (isProd ? undefined : DEV_REDIS_URL);
  if (!databaseUrl) fail('DATABASE_URL is required in production');
  if (!redisUrl) fail('REDIS_URL is required in production');

  const jwtSecret = env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const adminToken = env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN;
  const deviceKek = env.DEVICE_KEK || KEK_PLACEHOLDER;
  if (isProd) {
    if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32) {
      fail('JWT_SECRET is the default or shorter than 32 chars; refusing to boot');
    }
    if (adminToken === DEFAULT_ADMIN_TOKEN || adminToken.length < 32) {
      fail('ADMIN_TOKEN is the default or shorter than 32 chars; refusing to boot');
    }
    if (deviceKek === KEK_PLACEHOLDER || deviceKek.length < 32) {
      fail('DEVICE_KEK is the placeholder or shorter than 32 chars; refusing to boot');
    }
  }

  const deviceAuth = (env.DEVICE_AUTH || 'on').toLowerCase();
  if (deviceAuth !== 'on' && deviceAuth !== 'off') fail('DEVICE_AUTH must be on or off');
  if (isProd && deviceAuth === 'off') fail('DEVICE_AUTH=off is refused in production');

  const logLevel = env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info');

  // Only the mock pipeline exists; naming another provider here is a typo
  // until real adapters land, and a typo must not boot.
  const providerMode = (env.PROVIDER_MODE || 'mock').toLowerCase();
  if (providerMode !== 'mock') fail('PROVIDER_MODE must be mock (no other provider is implemented yet)');

  // The demo payment provider marks any purchase paid on request, so it is
  // free credits for anyone; production gets purchases switched off until a
  // real provider exists.
  const paymentProvider = (env.PAYMENT_PROVIDER || (isProd ? 'disabled' : 'demo')).toLowerCase();
  if (paymentProvider !== 'demo' && paymentProvider !== 'disabled') fail('PAYMENT_PROVIDER must be demo or disabled');
  if (isProd && paymentProvider === 'demo') fail('PAYMENT_PROVIDER=demo is refused in production: it gives credits away');

  return Object.freeze({
    nodeEnv,
    isProd,
    port: readInt(env, 'PORT', 3000, 1, 65535),
    logLevel,
    databaseUrl,
    redisUrl,
    jwtSecret,
    adminToken,
    accessTokenTtlSec: readInt(env, 'ACCESS_TOKEN_TTL_SEC', 900, 60, 86400),
    refreshTokenTtlDays: readInt(env, 'REFRESH_TOKEN_TTL_DAYS', 30, 1, 365),
    scryptCost: readInt(env, 'SCRYPT_COST', 32768, 1024, 1048576),
    deviceAuth,
    deviceKek,
    deviceClockSkewSec: readInt(env, 'DEVICE_CLOCK_SKEW_SEC', 300, 10, 3600),
    deviceNonceTtlSec: readInt(env, 'DEVICE_NONCE_TTL_SEC', 900, 60, 86400),
    deviceHeartbeatSec: readInt(env, 'DEVICE_HEARTBEAT_SEC', 60, 1, 3600),
    deviceHeartbeatUnclaimedSec: readInt(env, 'DEVICE_HEARTBEAT_UNCLAIMED_SEC', 5, 1, 3600),
    deviceAuthFailLimit: readInt(env, 'DEVICE_AUTH_FAIL_LIMIT', 30, 1, 100000),
    trustProxy: readInt(env, 'TRUST_PROXY', 0, 0, 10),
    providerMode,
    paymentProvider,
    welcomeCredits: readInt(env, 'WELCOME_CREDITS', 10, 0, 100000),
    turnMaxSec: readInt(env, 'TURN_MAX_SEC', 120, 5, 3600),
    conversationIdleSec: readInt(env, 'CONVERSATION_IDLE_SEC', 300, 10, 86400),
  });
}

export default loadConfig();
