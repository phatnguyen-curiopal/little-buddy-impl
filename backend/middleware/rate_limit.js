import { createHash } from 'node:crypto';
import redis from '../store/redis.js';
import { tooMany } from '../lib/http_error.js';
import log from '../lib/log.js';

// Fixed-window counter in Redis. Parent-facing routes fail open when Redis
// is unavailable: locking every parent out because a cache is down is worse
// than a short window without brute-force protection. The device side makes
// the opposite choice, because there a failure spends money.
export function rateLimit({ name, limit, windowSec, key }) {
  return async (req, res, next) => {
    const redisKey = `rl:${name}:${key(req)}`;
    let count;
    let ttl;
    try {
      const results = await redis.multi().incr(redisKey).expire(redisKey, windowSec, 'NX').ttl(redisKey).exec();
      count = results[0][1];
      ttl = results[2][1];
    } catch (err) {
      log.warn('rate_limit_unavailable', { name, err_message: err.message });
      return next();
    }
    if (count > limit) return next(tooMany(Math.max(ttl, 1)));
    next();
  };
}

// Emails are personal data; the key holds only a short hash of one.
export function emailKey(email) {
  return createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex').slice(0, 16);
}
