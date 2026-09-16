import { randomUUID } from 'node:crypto';

// A fresh id per request, never taken from the client: the id is what ties a
// log line to a support ticket, so it must not be forgeable.
export function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
