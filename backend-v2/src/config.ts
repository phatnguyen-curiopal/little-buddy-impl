// The only module that reads process.env. loadConfig is pure, so tests build
// a config from a plain object instead of mutating the environment.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Env = 'development' | 'test' | 'production';

export interface Config {
  env: Env;
  host: string;
  apiPort: number;
  voicePort: number;
  // Proxy hops to trust for the client address (2 behind Cloudflare and
  // nginx), so rate limits see each visitor, not the proxy; 0 trusts none.
  trustProxy: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  databaseUrl: string;
  jwtSecret: string;
  deviceKek: string;
  gateway: 'live' | 'fake';
  openai: {
    apiKey: string;
    baseUrl: string;
    replyModel: string;
    fastModel: string;
    backgroundModel: string;
    embeddingModel: string;
    replyEffort: string | null;
    fastEffort: string | null;
    backgroundEffort: string | null;
    serviceTier: string | null;
  };
  elevenlabs: {
    apiKey: string;
    baseUrl: string;
    sttModel: string;
    sttRealtimeModel: string;
    sttStreaming: boolean;
    ttsModel: string;
    ttsFallbackModel: string;
    audioTags: boolean;
  };
  voice: {
    allowTextTurns: boolean;
    maxTurnSeconds: number;
    pingIntervalSec: number;
    helloTimeoutMs: number;
    recallBudgetMs: number;
    sessionIdleMs: number;
    // Buddy may speak first when a parent opts in; off until the product
    // decision changes (it was "temporarily no").
    speakFirst: boolean;
  };
  auth: {
    emailDevEcho: boolean;
    googleClientIds: string[];
    appleClientIds: string[];
    accessTtlSec: number;
    refreshTtlDays: number;
  };
}

const DEV_JWT = 'dev-only-jwt-secret-change-me-0123456789';
const DEV_KEK = 'dev-only-device-kek-change-me-0123456789';

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function int(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`config: ${name} must be a non-negative integer`);
  return n;
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function orNull(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const mode = (env.NODE_ENV ?? 'development') as Env;
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('config: NODE_ENV must be development, test or production');
  const prod = mode === 'production';

  const config: Config = {
    env: mode,
    host: env.HOST || '127.0.0.1',
    apiPort: int(env.API_PORT, 3100, 'API_PORT'),
    voicePort: int(env.VOICE_PORT, 3101, 'VOICE_PORT'),
    trustProxy: int(env.TRUST_PROXY, 0, 'TRUST_PROXY'),
    logLevel: (env.LOG_LEVEL as Config['logLevel']) || (mode === 'test' ? 'error' : 'info'),
    databaseUrl: env.DATABASE_URL || 'postgres://littlebuddy:littlebuddy@localhost:5432/littlebuddy_v2',
    jwtSecret: env.JWT_SECRET || DEV_JWT,
    deviceKek: env.DEVICE_KEK || DEV_KEK,
    gateway: env.GATEWAY === 'live' ? 'live' : 'fake',
    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, ''),
      replyModel: env.OPENAI_REPLY_MODEL || 'gpt-5.6-sol',
      fastModel: env.OPENAI_FAST_MODEL || 'gpt-5.6-luna',
      backgroundModel: env.OPENAI_BACKGROUND_MODEL || env.OPENAI_REPLY_MODEL || 'gpt-5.6-sol',
      embeddingModel: env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      replyEffort: orNull(env.OPENAI_REPLY_EFFORT),
      // Current models accept none, low, medium, high and xhigh; "minimal" is refused.
      fastEffort: env.OPENAI_FAST_EFFORT === undefined ? 'none' : orNull(env.OPENAI_FAST_EFFORT),
      backgroundEffort: env.OPENAI_BACKGROUND_EFFORT === undefined ? 'low' : orNull(env.OPENAI_BACKGROUND_EFFORT),
      serviceTier: orNull(env.OPENAI_SERVICE_TIER),
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY || '',
      baseUrl: (env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/+$/, ''),
      sttModel: env.ELEVENLABS_STT_MODEL || 'scribe_v2',
      sttRealtimeModel: env.ELEVENLABS_STT_REALTIME_MODEL || 'scribe_v2_realtime',
      // Streaming is the default; 0 falls back to one batch request per turn.
      sttStreaming: flag(env.ELEVENLABS_STT_STREAMING, true),
      ttsModel: env.ELEVENLABS_TTS_MODEL || 'eleven_v4_turbo',
      ttsFallbackModel: env.ELEVENLABS_TTS_FALLBACK_MODEL || 'eleven_flash_v2_5',
      audioTags: flag(env.ELEVENLABS_AUDIO_TAGS, true),
    },
    voice: {
      allowTextTurns: flag(env.ALLOW_TEXT_TURNS, !prod),
      maxTurnSeconds: int(env.MAX_TURN_SECONDS, 30, 'MAX_TURN_SECONDS'),
      pingIntervalSec: int(env.PING_INTERVAL_SEC, 30, 'PING_INTERVAL_SEC'),
      helloTimeoutMs: int(env.HELLO_TIMEOUT_MS, 10_000, 'HELLO_TIMEOUT_MS'),
      recallBudgetMs: int(env.RECALL_BUDGET_MS, 300, 'RECALL_BUDGET_MS'),
      sessionIdleMs: int(env.SESSION_IDLE_MS, 30 * 60_000, 'SESSION_IDLE_MS'),
      speakFirst: flag(env.SPEAK_FIRST, false),
    },
    auth: {
      emailDevEcho: flag(env.EMAIL_DEV_ECHO, !prod),
      googleClientIds: list(env.GOOGLE_CLIENT_IDS),
      appleClientIds: list(env.APPLE_CLIENT_IDS),
      accessTtlSec: int(env.ACCESS_TTL_SEC, 15 * 60, 'ACCESS_TTL_SEC'),
      refreshTtlDays: int(env.REFRESH_TTL_DAYS, 60, 'REFRESH_TTL_DAYS'),
    },
  };

  if (prod) {
    // Production refuses to boot on anything that would be unsafe with real children.
    if (config.jwtSecret === DEV_JWT || config.jwtSecret.length < 32) throw new Error('config: set a JWT_SECRET of 32+ characters');
    if (config.deviceKek === DEV_KEK || config.deviceKek.length < 32) throw new Error('config: set a DEVICE_KEK of 32+ characters');
    if (config.voice.allowTextTurns) throw new Error('config: ALLOW_TEXT_TURNS is refused in production');
    if (config.auth.emailDevEcho) throw new Error('config: EMAIL_DEV_ECHO is refused in production');
    if (config.gateway !== 'live') throw new Error('config: GATEWAY must be live in production');
  }
  if (config.gateway === 'live') {
    if (!config.openai.apiKey) throw new Error('config: OPENAI_API_KEY is required when GATEWAY=live');
    if (!config.elevenlabs.apiKey) throw new Error('config: ELEVENLABS_API_KEY is required when GATEWAY=live');
  }
  return config;
}

// Loads backend-v2/.env into process.env when present; real environment
// variables win, because loadEnvFile never overwrites what is already set.
export function loadEnvFile(): void {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export function configFromProcess(): Config {
  loadEnvFile();
  return loadConfig(process.env);
}
