import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, normalizePath, safeNext, guard } from '../src/lib/routes.js';

test('paths match routes, trailing slashes and queries ignored', () => {
  assert.equal(matchRoute('/').name, 'home');
  assert.equal(matchRoute('/app').name, 'overview');
  assert.equal(matchRoute('/app/').name, 'overview');
  assert.equal(matchRoute('/app/credits?x=1').name, 'credits');
  assert.equal(matchRoute('/app/nope').name, 'notFound');
  assert.equal(normalizePath('/login/'), '/login');
});

test('signed-out visitors to the app go to login with where they wanted to be', () => {
  assert.equal(guard(matchRoute('/app/toys'), 'signedOut', '/app/toys'), '/login?next=%2Fapp%2Ftoys');
  assert.equal(guard(matchRoute('/app'), 'loading', '/app'), null, 'wait while a session is restored');
  assert.equal(guard(matchRoute('/app'), 'signedIn', '/app'), null);
});

test('signed-in visitors skip the login and register pages', () => {
  assert.equal(guard(matchRoute('/login'), 'signedIn', '/login'), '/app');
  assert.equal(guard(matchRoute('/register'), 'signedIn', '/register'), '/app');
  assert.equal(guard(matchRoute('/'), 'signedIn', '/'), null, 'the marketing page stays reachable');
});

test('only app paths are accepted after login', () => {
  assert.equal(safeNext('/app/credits'), '/app/credits');
  assert.equal(safeNext('https://evil.example'), '/app');
  assert.equal(safeNext('//evil.example/app'), '/app');
  assert.equal(safeNext('/app/unknown'), '/app');
  assert.equal(safeNext(null), '/app');
});
