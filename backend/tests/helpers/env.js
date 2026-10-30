// Preloaded into every test process via `node --import`. Sets defaults only
// when unset, so CI can point at other hosts; the _test suffix guard in
// db.js is what stops a stray DATABASE_URL from wiping dev data.
const defaults = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://littlebuddy:littlebuddy@localhost:5432/littlebuddy_test',
  REDIS_URL: 'redis://localhost:6379/1',
  JWT_SECRET: 'test-jwt-secret',
  ADMIN_TOKEN: 'test-admin-token',
  DEVICE_KEK: 'test-device-kek-0123456789abcdef',
  LOG_LEVEL: 'silent',
  // scrypt at production cost takes ~100 ms per hash; the suite hashes dozens.
  SCRYPT_COST: '4096',
  DEVICE_AUTH: 'on',
  // The brain service is never needed by the suite: brain-mode files set
  // PROVIDER_MODE and BRAIN_URL (a stub) before their first config import.
  PROVIDER_MODE: 'mock',
  // The suite's balance arithmetic counts from a welcome grant of 10, the
  // value before the demo stage raised the product default to 1000.
  WELCOME_CREDITS: '10',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
