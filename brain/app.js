import express from 'express';

import { turnsRouter } from './http/turns.js';
import { createDebugFile } from './lib/debug_file.js';
import { createLog, errorFields } from './lib/log.js';
import { createHelper, createOpenAiClient } from './llm/helper.js';
import { createLlm } from './llm/index.js';
import { createEmbedder } from './memory/embed.js';
import { createHistory } from './memory/history.js';
import { createLearner } from './memory/learn.js';
import { createStt } from './speech/stt.js';
import { createTts } from './speech/tts.js';

const HEALTH_TIMEOUT_MS = 2000;

// Everything a turn needs, built once from config. Tests build their own
// with a stub upstream and a test database; nothing here reads the env.
export function createDeps(config, { pool, log = createLog({ level: config.logLevel }) }) {
  const openai = createOpenAiClient(config);
  const embed = createEmbedder(openai);
  const helper = createHelper(openai);
  const deps = {
    config,
    pool,
    log,
    llm: createLlm(config, { warn: (message) => log.warn('config_warning', { message }) }),
    stt: createStt(config),
    tts: createTts(config),
    embed,
    helper,
    history: createHistory({ maxTurns: config.llm.historyMaxTurns }),
    debugFile: createDebugFile(config.debug.llmLogFile),
  };
  deps.learner = createLearner(deps);
  return deps;
}

async function dbUp(pool) {
  let timer;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', async (req, res) => {
    const db = await dbUp(deps.pool);
    res.status(db ? 200 : 503).json({ ok: db, provider: deps.config.llm.provider, db });
  });

  app.use('/v1', turnsRouter(deps));

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // Body-parser failures carry a `type`; they are the caller's mistake.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if (err?.type === 'entity.parse.failed' || err?.status === 400) {
      res.status(400).json({ error: 'invalid_request', details: [{ field: 'body', message: 'malformed body' }] });
      return;
    }
    deps.log.error('request_crashed', errorFields(err));
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
