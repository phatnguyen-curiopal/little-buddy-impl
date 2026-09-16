import Redis from 'ioredis';
import config from '../config.js';
import log from '../lib/log.js';

// No offline queue and one retry per command: when Redis is down a request
// must fail fast (or, for parent rate limits, degrade) instead of hanging
// until the socket comes back.
export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('error', (err) => log.warn('redis_error', { err_message: err.message }));

export async function connect() {
  if (redis.status === 'wait') await redis.connect();
}

export function ping() {
  return redis.ping();
}

// quit() on a lazy client that never connected would open a connection just
// to close it, and can hang the process; disconnect() is the right call there.
export async function close() {
  if (redis.status === 'end') return;
  if (redis.status === 'wait') {
    redis.disconnect();
    return;
  }
  await redis.quit();
}

export default redis;
