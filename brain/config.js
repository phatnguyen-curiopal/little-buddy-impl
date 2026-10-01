// The only module that reads the environment. loadConfig is pure (env in,
// frozen object out) so tests can build as many configurations as they need,
// and every mistake in .env fails at boot instead of on a child's sentence.

export const DEFAULT_BRAIN_TOKEN = 'dev-brain-token-change-me';
const DEV_DATABASE_URL = 'postgres://littlebuddy:littlebuddy@localhost:5432/littlebuddy_brain';
const ELEVENLABS_DEFAULT_BASE = 'https://api.elevenlabs.io';

const NODE_ENVS = new Set(['development', 'test', 'production']);
export const PROVIDERS = ['openai', 'anthropic', 'qwen'];
const KEY_ENVS = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', qwen: 'QWEN_API_KEY' };

function fail(message) {
  throw new Error(`config: ${message}`);
}

function str(env, name, fallback = '') {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = String(raw).trim();
  return value === '' ? fallback : value;
}

function int(env, name, fallback, min, max) {
  const raw = str(env, name);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function num(env, name, fallback, min, max) {
  const raw = str(env, name);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

// Sampling knobs: empty means "do not send the field", which is load-bearing
// because reasoning-family models reject temperature and penalties with a 400.
function optionalNum(env, name) {
  const raw = str(env, name);
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`${name} must be a number or empty`);
  return value;
}

// Flags follow the prototype's two conventions: most are on unless set to 0,
// a few experimental ones are off unless set to 1.
function onUnlessZero(env, name) {
  return str(env, name) !== '0';
}
function offUnlessOne(env, name) {
  return str(env, name) === '1';
}

export function loadConfig(env = process.env) {
  const nodeEnv = str(env, 'NODE_ENV', 'development');
  if (!NODE_ENVS.has(nodeEnv)) fail(`NODE_ENV must be one of ${[...NODE_ENVS].join(', ')}`);
  const isProd = nodeEnv === 'production';
  const warnings = [];

  // --- Service -------------------------------------------------------------
  const brainToken = str(env, 'BRAIN_TOKEN', DEFAULT_BRAIN_TOKEN);
  if (isProd && (brainToken === DEFAULT_BRAIN_TOKEN || brainToken.length < 32)) {
    fail('BRAIN_TOKEN is the default or shorter than 32 chars; refusing to boot');
  }
  const databaseUrl = str(env, 'DATABASE_URL', isProd ? '' : DEV_DATABASE_URL);
  if (!databaseUrl) fail('DATABASE_URL is required in production');

  // --- API keys ------------------------------------------------------------
  const keys = {
    openai: str(env, 'OPENAI_API_KEY'),
    anthropic: str(env, 'ANTHROPIC_API_KEY'),
    qwen: str(env, 'QWEN_API_KEY'),
    elevenlabs: str(env, 'ELEVENLABS_API_KEY'),
  };
  // A brain that cannot transcribe or speak has no job, so this one is fatal.
  if (!keys.elevenlabs) fail('ELEVENLABS_API_KEY is required');

  // --- LLM -----------------------------------------------------------------
  const llmEnabled = onUnlessZero(env, 'LLM_ENABLED');
  const provider = str(env, 'LLM_PROVIDER', 'anthropic').toLowerCase();
  if (!PROVIDERS.includes(provider)) fail(`LLM_PROVIDER must be one of ${PROVIDERS.join(', ')}`);
  if (llmEnabled && !keys[provider]) fail(`${KEY_ENVS[provider]} is required for LLM_PROVIDER=${provider}`);
  const qwenBaseUrl = str(env, 'QWEN_BASE_URL');
  // The DashScope endpoint is regional and per workspace, so there is no
  // sensible default; an empty one would be a 404 on the first turn.
  if (llmEnabled && provider === 'qwen' && !qwenBaseUrl) fail('QWEN_BASE_URL is required for LLM_PROVIDER=qwen');

  const thinking = str(env, 'LLM_THINKING', 'disabled').toLowerCase();
  if (thinking !== 'disabled' && thinking !== 'adaptive') fail('LLM_THINKING must be disabled or adaptive');
  const moderation = str(env, 'LLM_MODERATION').toLowerCase();
  if (moderation && moderation !== 'score' && moderation !== 'block') fail('LLM_MODERATION must be empty, score or block');

  const llm = {
    enabled: llmEnabled,
    provider,
    models: {
      openai: str(env, 'OPENAI_MODEL', 'gpt-4o-mini'),
      anthropic: str(env, 'ANTHROPIC_MODEL', 'claude-opus-5'),
      qwen: str(env, 'QWEN_MODEL', 'qwen-plus-character'),
    },
    qwenBaseUrl,
    maxTokens: int(env, 'LLM_MAX_TOKENS', 1024, 16, 32000),
    qwenMaxTokens: int(env, 'QWEN_MAX_TOKENS', int(env, 'LLM_MAX_TOKENS', 1024, 16, 32000), 16, 32000),
    systemPromptOverride: str(env, 'LLM_SYSTEM_PROMPT'),
    effort: str(env, 'LLM_EFFORT'),
    thinking,
    temperature: optionalNum(env, 'LLM_TEMPERATURE'),
    presencePenalty: optionalNum(env, 'LLM_PRESENCE_PENALTY'),
    frequencyPenalty: optionalNum(env, 'LLM_FREQUENCY_PENALTY'),
    serviceTier: str(env, 'LLM_SERVICE_TIER'),
    moderation,
    cache: onUnlessZero(env, 'LLM_CACHE'),
    historyMaxTurns: int(env, 'HISTORY_MAX_TURNS', 12, 0, 200),
  };

  // Knobs that exist on one vendor only: an env that silently does nothing
  // is worse than one that says so once at boot.
  if (provider === 'anthropic' && (llm.presencePenalty != null || llm.frequencyPenalty != null)) {
    warnings.push('LLM_PRESENCE_PENALTY/LLM_FREQUENCY_PENALTY are ignored under anthropic');
  }
  if (provider !== 'openai' && (llm.serviceTier || llm.moderation)) {
    warnings.push(`LLM_SERVICE_TIER/LLM_MODERATION are OpenAI-only and ignored under ${provider}`);
  }
  if (provider !== 'openai' && !llm.cache) {
    warnings.push(`LLM_CACHE=0 is a no-op for the reply under ${provider}`);
  }
  if (provider === 'qwen' && llm.effort) warnings.push('LLM_EFFORT is ignored under qwen');

  // --- Speech --------------------------------------------------------------
  const sttModel = str(env, 'ELEVENLABS_STT_MODEL', 'scribe_v2');
  // The batch endpoint rejects realtime models with a hard 400.
  if (/realtime/.test(sttModel)) fail(`ELEVENLABS_STT_MODEL=${sttModel} is a realtime model; batch takes scribe_v1 or scribe_v2`);
  const ttsOutputFormat = str(env, 'TTS_OUTPUT_FORMAT', 'pcm_16000');
  if (!/^pcm_\d+$/.test(ttsOutputFormat)) fail('TTS_OUTPUT_FORMAT must be pcm_* (the toy plays raw PCM16)');
  const speech = {
    sttModel,
    keyterms: onUnlessZero(env, 'STT_KEYTERMS'),
    keytermsMax: int(env, 'STT_KEYTERMS_MAX', 100, 0, 1000),
    audioEvents: offUnlessOne(env, 'STT_AUDIO_EVENTS'),
    noVerbatim: offUnlessOne(env, 'STT_NO_VERBATIM'),
    logging: onUnlessZero(env, 'STT_LOGGING'),
    ttsEnabled: onUnlessZero(env, 'TTS_ENABLED'),
    ttsModel: str(env, 'TTS_MODEL', 'eleven_flash_v2_5'),
    ttsOutputFormat,
    ttsSampleRate: Number(ttsOutputFormat.split('_')[1]) || 16000,
  };

  // --- Memory --------------------------------------------------------------
  const retrieval = str(env, 'MEMORY_RETRIEVAL', 'both').toLowerCase();
  if (!['both', 'summary', 'verbatim'].includes(retrieval)) fail('MEMORY_RETRIEVAL must be both, summary or verbatim');
  const namesModel = str(env, 'MEMORY_NAMES_MODEL', 'gpt-5.4-mini');
  const memory = {
    enabled: offUnlessOne(env, 'MEMORY_ENABLED'),
    retrieval,
    waitMs: int(env, 'MEMORY_WAIT_MS', 600, 0, 60000),
    topK: int(env, 'MEMORY_TOP_K', 3, 1, 20),
    minScore: num(env, 'MEMORY_MIN_SCORE', 0.25, -1, 1),
    dedupeScore: num(env, 'MEMORY_DEDUPE_SCORE', 0.97, 0, 1),
    context: onUnlessZero(env, 'MEMORY_CONTEXT'),
    contextMinScore: num(env, 'MEMORY_CONTEXT_MIN_SCORE', 0.15, -1, 1),
    names: onUnlessZero(env, 'MEMORY_NAMES'),
    namesModel,
    nameTrust: Math.max(1, int(env, 'MEMORY_NAME_TRUST', 2, 1, 100)),
    nameContext: onUnlessZero(env, 'MEMORY_NAME_CONTEXT'),
    nameContexts: int(env, 'MEMORY_NAME_CONTEXTS', 3, 1, 20),
    nameFix: onUnlessZero(env, 'MEMORY_NAME_FIX'),
    profile: onUnlessZero(env, 'MEMORY_PROFILE'),
    profileModel: str(env, 'MEMORY_PROFILE_MODEL', namesModel),
    profileTop: int(env, 'MEMORY_PROFILE_TOP', 10, 1, 50),
    summary: onUnlessZero(env, 'MEMORY_SUMMARY'),
    summaryPoints: int(env, 'MEMORY_SUMMARY_POINTS', 8, 1, 50),
    summaryTop: int(env, 'MEMORY_SUMMARY_TOP', 2, 0, 20),
    summaryMinScore: num(env, 'MEMORY_SUMMARY_MIN_SCORE', 0.2, -1, 1),
    recent: int(env, 'MEMORY_RECENT', 3, 0, 20),
  };
  // Name notes and correction ride on the names table.
  memory.nameContext = memory.names && memory.nameContext;
  memory.nameFix = memory.names && memory.nameFix;
  // Embeddings and the extractors are OpenAI calls whatever answers the turn.
  if (memory.enabled && !keys.openai) fail('OPENAI_API_KEY is required when MEMORY_ENABLED=1 (embeddings and extractors)');

  // --- Bot life ------------------------------------------------------------
  const botLife = {
    enabled: offUnlessOne(env, 'BOT_LIFE_ENABLED'),
    moodFeel: offUnlessOne(env, 'BOT_MOOD_FEEL'),
  };

  // --- Debug taps ----------------------------------------------------------
  // Both write a child's words to disk, which production must never do.
  const debug = {
    llmLogFile: str(env, 'LLM_LOG_FILE'),
    sttDumpWav: str(env, 'STT_DUMP_WAV'),
  };
  if (isProd && (debug.llmLogFile || debug.sttDumpWav)) {
    fail('LLM_LOG_FILE and STT_DUMP_WAV hold children\'s words and are refused in production');
  }

  // --- Test seams ----------------------------------------------------------
  const seams = {
    openaiBaseUrl: str(env, 'OPENAI_BASE_URL'),
    anthropicBaseUrl: str(env, 'ANTHROPIC_BASE_URL'),
    // The prototype used ws(s):// for this seam; batch speaks HTTP to the
    // same host, so an old value keeps working.
    elevenlabsBaseUrl: str(env, 'ELEVENLABS_BASE_URL', ELEVENLABS_DEFAULT_BASE).replace(/^ws/, 'http').replace(/\/+$/, ''),
  };

  return Object.freeze({
    nodeEnv,
    isProd,
    logLevel: str(env, 'LOG_LEVEL', nodeEnv === 'test' ? 'silent' : 'info'),
    host: '127.0.0.1',
    port: int(env, 'PORT', 8080, 0, 65535),
    brainToken,
    databaseUrl,
    turnTimeoutMs: int(env, 'TURN_TIMEOUT_MS', 40000, 1000, 600000),
    keys: Object.freeze(keys),
    llm: Object.freeze(llm),
    speech: Object.freeze(speech),
    memory: Object.freeze(memory),
    botLife: Object.freeze(botLife),
    debug: Object.freeze(debug),
    seams: Object.freeze(seams),
    warnings: Object.freeze(warnings),
  });
}
