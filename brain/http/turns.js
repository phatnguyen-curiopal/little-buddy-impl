import { timingSafeEqual } from 'node:crypto';
import express from 'express';

import { errorFields } from '../lib/log.js';
import { TurnAbort } from '../llm/result.js';
import { runTurn } from '../turn/run_turn.js';
import { SUBJECT_RE, decodeMetaHeader, validateMeta } from './validate.js';

// The brain accepts up to 6 MB of PCM (about three minutes at 16 kHz).
const BODY_LIMIT = '6mb';

export function bearerAuth(token) {
  const expected = Buffer.from(`Bearer ${token}`);
  return (req, res, next) => {
    const given = Buffer.from(String(req.headers.authorization || ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}

function invalid(res, details) {
  res.status(400).json({ error: 'invalid_request', details });
}

export function turnsRouter(deps) {
  const { config, log, history, learner } = deps;
  const router = express.Router();
  router.use(bearerAuth(config.brainToken));

  router.post(
    '/turns',
    express.raw({ type: 'application/octet-stream', limit: BODY_LIMIT }),
    express.json({ limit: '64kb' }),
    async (req, res) => {
      const isVoice = req.is('application/octet-stream');
      const isText = req.is('application/json');
      if (!isVoice && !isText) {
        invalid(res, [{ field: 'content-type', message: 'must be application/octet-stream or application/json' }]);
        return;
      }
      let audio = null;
      let raw;
      if (isVoice) {
        raw = decodeMetaHeader(req.get('x-lb-turn'));
        if (!raw) {
          invalid(res, [{ field: 'x-lb-turn', message: 'must be base64url JSON' }]);
          return;
        }
        audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (audio.length % 2) {
          invalid(res, [{ field: 'body', message: 'PCM16 must have an even byte length' }]);
          return;
        }
      } else {
        raw = req.body;
      }
      const { meta, errors } = validateMeta(raw, { requireText: Boolean(isText) });
      if (errors) {
        invalid(res, errors);
        return;
      }

      // One controller for the whole turn: the backend hanging up and the
      // deadline both pull it, and every upstream call carries its signal.
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(new TurnAbort('timeout')), config.turnTimeoutMs);
      res.on('close', () => {
        if (!res.writableFinished) controller.abort(new TurnAbort('closed'));
      });

      try {
        const { response, commit } = await runTurn(deps, {
          meta,
          audio,
          text: meta.text ?? null,
          signal: controller.signal,
        });
        if (controller.signal.aborted && controller.signal.reason?.kind === 'closed') {
          log.info('turn_aborted', { turn_id: meta.turn_id, subject: meta.subject });
          return;
        }
        res.json(response);
        commit();
        log.info('turn_done', {
          turn_id: meta.turn_id,
          subject: meta.subject,
          provider: response.provider,
          no_speech: response.no_speech,
          emotion: response.emotion,
          has_audio: Boolean(response.audio_b64),
          usage: response.usage,
          timings_ms: response.timings_ms,
        });
      } catch (err) {
        if (controller.signal.reason?.kind === 'closed') {
          log.info('turn_aborted', { turn_id: meta.turn_id, subject: meta.subject });
          return;
        }
        if (err?.name === 'SpeechError' || err?.name === 'LlmError') {
          const error = err.name === 'SpeechError' ? 'stt_failed' : 'llm_failed';
          const kind = err.kind === 'aborted' ? 'timeout' : err.kind;
          log.warn('turn_failed', { turn_id: meta.turn_id, subject: meta.subject, error, ...errorFields(err) });
          res.status(502).json({ error, kind });
          return;
        }
        log.error('turn_crashed', { turn_id: meta.turn_id, subject: meta.subject, ...errorFields(err) });
        res.status(500).json({ error: 'internal' });
      } finally {
        clearTimeout(deadline);
      }
    },
  );

  router.delete('/subjects/:subject', async (req, res) => {
    const subject = String(req.params.subject || '').toLowerCase();
    if (!SUBJECT_RE.test(subject)) {
      invalid(res, [{ field: 'subject', message: 'must be child:<uuid> or device:<uuid>:<uuid>' }]);
      return;
    }
    try {
      const counts = await learner.wipe(subject);
      history.wipeSubject(subject);
      log.info('subject_wiped', { subject, ...counts });
      res.status(204).end();
    } catch (err) {
      log.error('subject_wipe_failed', { subject, ...errorFields(err) });
      res.status(500).json({ error: 'internal' });
    }
  });

  return router;
}
