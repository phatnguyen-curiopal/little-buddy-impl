import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SCREENS, matchRoute, normalizePath, safeNext, guard } from '../src/lib/routes.js';

test('paths match routes, trailing slashes and queries ignored', () => {
  assert.equal(matchRoute('/').name, 'home');
  assert.equal(matchRoute('/app').name, 'overview');
  assert.equal(matchRoute('/app/').name, 'overview');
  assert.equal(matchRoute('/app/credits?x=1').name, 'credits');
  assert.equal(matchRoute('/app/nope').name, 'notFound');
  assert.equal(normalizePath('/login/'), '/login');
  assert.equal(matchRoute('/app/talk?toy=abc').name, 'talk');
  assert.equal(matchRoute('/app/talk').area, 'app');
});

test('Care is an app screen that takes the child and the section from the query', () => {
  assert.equal(matchRoute('/app/care').name, 'care');
  assert.equal(matchRoute('/app/care?tab=safety&child=c1').name, 'care');
  assert.ok(APP_SCREENS.some((r) => r.name === 'care' && r.path === '/app/care'));
});

test('signed-out visitors to the app go to login with where they wanted to be', () => {
  assert.equal(guard(matchRoute('/app/toys'), 'signedOut', '/app/toys'), '/login?next=%2Fapp%2Ftoys');
  assert.equal(guard(matchRoute('/app'), 'loading', '/app'), null, 'wait while a session is restored');
  assert.equal(guard(matchRoute('/app'), 'signedIn', '/app'), null);
});

test('the query survives the trip through sign-in; the hash does not', () => {
  const next = guard(matchRoute('/app/care'), 'signedOut', '/app/care/?tab=safety&child=c1#top');
  assert.equal(next, `/login?next=${encodeURIComponent('/app/care?tab=safety&child=c1')}`);
  assert.equal(safeNext(decodeURIComponent(next.split('next=')[1])), '/app/care?tab=safety&child=c1');
});

test('signed-in visitors skip the login and register pages', () => {
  assert.equal(guard(matchRoute('/login'), 'signedIn', '/login'), '/app');
  assert.equal(guard(matchRoute('/register'), 'signedIn', '/register'), '/app');
  assert.equal(guard(matchRoute('/'), 'signedIn', '/'), null, 'the marketing page stays reachable');
});

test('only app paths are accepted after login', () => {
  assert.equal(safeNext('/app/credits'), '/app/credits');
  assert.equal(safeNext('/app/talk?toy=t1'), '/app/talk?toy=t1');
  assert.equal(safeNext('https://evil.example'), '/app');
  assert.equal(safeNext('//evil.example/app'), '/app');
  assert.equal(safeNext('/appevil.example'), '/app');
  assert.equal(safeNext('/app/unknown?x=1'), '/app');
  assert.equal(safeNext('/app?'), '/app');
  assert.equal(safeNext(null), '/app');
});
