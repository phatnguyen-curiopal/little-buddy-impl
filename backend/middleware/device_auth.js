import { HttpError } from '../lib/http_error.js';
import { verifyDeviceRequest, extractAuth, requireActiveCheck, nowSec } from '../devices/hmac_auth.js';
import { hashBody, EMPTY_BODY_HASH } from '../devices/signing.js';

// Every device rejection carries server_time so a toy with a drifted clock
// can resync from the very response that refused it.
export function deviceError(result) {
  return new HttpError(result.http, result.code, result.message, { server_time: nowSec() });
}

// Passed as express.json({ verify }) on the /v1 router: the signature covers
// the exact bytes sent, not a re-serialization of the parsed object.
export function captureRawBody(req, res, buf) {
  req.rawBody = buf;
}

export async function deviceAuth(req, res, next) {
  const bodyHash = req.rawBody?.length ? hashBody(req.rawBody) : EMPTY_BODY_HASH;
  const { deviceId, ts, nonce, sig } = extractAuth({ headers: req.headers, query: req.query });
  const result = await verifyDeviceRequest({
    method: req.method,
    path: req.baseUrl + req.path,
    deviceId,
    ts,
    nonce,
    sig,
    bodyHash,
    ip: req.ip,
  });
  if (!result.ok) return next(deviceError(result));
  req.device = result.device;
  next();
}

export function requireActive(req, res, next) {
  const blocked = requireActiveCheck(req.device);
  if (blocked) return next(deviceError(blocked));
  next();
}
