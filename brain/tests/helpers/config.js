import { loadConfig } from '../../config.js';

export const TEST_TOKEN = 'test-brain-token-0123456789abcdef0123456789';

// A full, explicit environment so tests never depend on the developer's
// .env. Memory is on (as in the real .env) but learning is decided per turn.
export function baseEnv(stubEnv = {}) {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL,
    BRAIN_TOKEN: TEST_TOKEN,
    TURN_TIMEOUT_MS: '5000',
    OPENAI_API_KEY: 'sk-test-openai',
    ANTHROPIC_API_KEY: 'sk-test-anthropic',
    QWEN_API_KEY: 'sk-test-qwen',
    ELEVENLABS_API_KEY: 'xi-test',
    LLM_ENABLED: '1',
    LLM_PROVIDER: 'openai',
    OPENAI_MODEL: 'gpt-test',
    ANTHROPIC_MODEL: 'claude-test',
    QWEN_MODEL: 'qwen-test',
    MEMORY_ENABLED: '1',
    MEMORY_RETRIEVAL: 'both',
    MEMORY_WAIT_MS: '2000',
    MEMORY_TOP_K: '4',
    MEMORY_MIN_SCORE: '0.2',
    MEMORY_NAMES_MODEL: 'gpt-helper-test',
    BOT_LIFE_ENABLED: '1',
    TTS_ENABLED: '1',
    ...stubEnv,
  };
}

export function testConfig(stubEnv = {}, overrides = {}) {
  return loadConfig({ ...baseEnv(stubEnv), ...overrides });
}
