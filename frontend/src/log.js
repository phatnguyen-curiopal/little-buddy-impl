import { useSyncExternalStore } from 'react';

// Every request the console makes lands here, newest first, so the tester
// can see exactly what the backend said. Bounded so a long toy session does
// not grow without limit.
const MAX = 500;
let entries = [];
let seq = 0;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

export function append(entry) {
  seq += 1;
  entries = [{ id: seq, at: Date.now(), ...entry }, ...entries].slice(0, MAX);
  emit();
}

export function clear() {
  entries = [];
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLog() {
  return useSyncExternalStore(subscribe, () => entries);
}
