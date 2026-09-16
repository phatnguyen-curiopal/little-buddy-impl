// Every deliberate failure is an HttpError so the error middleware can render
// one stable JSON shape. `extra` is spread into the error body; the device API
// uses it to hand back server_time on every rejection.
export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (code = 'validation_error', message, extra) =>
  new HttpError(400, code, message, extra);
export const unauthorized = (code = 'unauthorized', message, extra) =>
  new HttpError(401, code, message, extra);
export const forbidden = (code, message, extra) =>
  new HttpError(403, code, message, extra);
export const notFound = (code = 'not_found', message) =>
  new HttpError(404, code, message);
export const conflict = (code, message) =>
  new HttpError(409, code, message);

export function tooMany(retryAfterSec) {
  const err = new HttpError(429, 'rate_limited', 'too many requests');
  err.retryAfter = retryAfterSec;
  return err;
}
