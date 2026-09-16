import { timingSafeEqual } from 'node:crypto';
import config from '../config.js';
import { unauthorized } from '../lib/http_error.js';

const expected = Buffer.from(config.adminToken, 'utf8');

// Operator endpoints use one shared bearer token. Compared in constant time
// after a length check, because timingSafeEqual throws on unequal lengths.
export function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length) return next(unauthorized());
  const given = Buffer.from(token, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(unauthorized());
  req.admin = { id: 'admin' };
  next();
}
