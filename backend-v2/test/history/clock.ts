// One clock for the app and the database. PGlite's PostgreSQL reads the time
// through JavaScript's Date, so mocking Date moves now() and current_date in
// SQL together with every Date.now() in the backend. Timers stay real, so
// recall budgets and the worker loop behave as usual.

import { mock } from 'node:test';

export interface Clock {
  set(at: Date | number): void;
  now(): Date;
  advance(ms: number): void;
  stop(): void;
}

export function startClock(at: Date | number): Clock {
  const ms = (v: Date | number) => (typeof v === 'number' ? v : v.getTime());
  mock.timers.enable({ apis: ['Date'], now: ms(at) });
  return {
    set: (v) => mock.timers.setTime(ms(v)),
    now: () => new Date(),
    advance: (d) => mock.timers.setTime(Date.now() + d),
    stop: () => mock.timers.reset(),
  };
}
