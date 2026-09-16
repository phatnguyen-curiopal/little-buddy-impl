import { HttpError } from '../lib/http_error.js';
import config from '../config.js';
import log from '../lib/log.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'route not found' } });
}

function send(res, status, code, message, extra) {
  res.status(status).json({ error: { code, message, ...extra } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
    return send(res, err.status, err.code, err.message, err.extra);
  }

  // body-parser failures arrive as plain errors with a `type` field.
  if (err?.type === 'entity.parse.failed') {
    return send(res, 400, 'invalid_json', 'request body is not valid JSON');
  }
  if (err?.type === 'entity.too.large') {
    return send(res, 413, 'payload_too_large', 'request body too large');
  }
  if (err?.type && String(err.type).startsWith('entity.') || err?.type === 'charset.unsupported') {
    return send(res, 400, 'invalid_body', 'request body could not be read');
  }

  log.error('request_failed', {
    req_id: req.id,
    method: req.method,
    path: req.path,
    err_message: err?.message,
    stack: config.isProd ? undefined : err?.stack,
  });
  send(res, 500, 'internal_error', 'something went wrong');
}
