// Preloaded into every test process via `node --import`. Defaults only when
// unset; the _test suffix guard in db.js is what stops a stray DATABASE_URL
// from wiping real memories.
const defaults = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://littlebuddy:littlebuddy@localhost:5432/littlebuddy_brain_test',
  LOG_LEVEL: 'silent',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
