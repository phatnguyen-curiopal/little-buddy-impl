// What the parent website needs from backend-v2, driven through the real
// Fastify app over PGlite like api.test.ts: password sign-in, credits and
// purchases, a Buddy's personality type and picked voice, Buddies that live
// only in the browser, pausing and letting go of toys, the code printed on
// the box, and the activity list that never carries a child's words.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { buildApi } from '../../src/api/app.ts';
import { signAccess } from '../../src/auth/jwt.ts';
import { createOidcVerifier, type OidcVerifier } from '../../src/auth/oidc.ts';
import { DIAL_KEYS, SEED_CAST, type Dials } from '../../src/character/packs.ts';
import { loadConfig, type Config } from '../../src/config.ts';
import type { Db } from '../../src/db/index.ts';
import { loadDeviceSecret, makeClaimToken, provisionDevices, type ManifestEntry } from '../../src/devices/credentials.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { silentLogger } from '../../src/log.ts';
import { b64url, fromB64url } from '../../src/util/crypto.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

interface CallOpts {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  ip?: string;
}

// Sign-up allows five accounts an hour per address, so each one here comes
// from an address of its own unless a test pins one to check that limit.
let addresses = 0;
const nextAddress = () => {
  addresses += 1;
  return `10.77.${Math.floor(addresses / 250)}.${(addresses % 250) + 1}`;
};

interface Account {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  parent: { id: string; email: string; display_name: string | null; role: string };
  family: { id: string; name: string | null };
}

interface DeviceRow {
  status: string;
  family_id: string | null;
  child_id: string | null;
  claimed_at: Date | null;
  disabled_by: string | null;
}

// Each describe builds its own app: the sign-in rate limit (a burst of 20 per
// address) lives inside the app, and every inject comes from one address.
function apiFor(db: Db, cfg: Config = config, opts: { blocked?: string[]; oidc?: OidcVerifier } = {}): FastifyInstance {
  return buildApi({
    db,
    config: cfg,
    log: silentLogger,
    queue: createJobQueue(db),
    oidc: opts.oidc ?? createOidcVerifier(cfg.auth),
    onDeviceBlocked: (id) => {
      opts.blocked?.push(id);
    },
  });
}

function call(app: FastifyInstance, method: string, url: string, opts: CallOpts = {}): Promise<LightMyRequestResponse> {
  return app.inject({
    method: method as 'GET',
    url: `/v1${url}`,
    payload: opts.body as object | undefined,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    remoteAddress: opts.ip ?? (url === '/auth/register' ? nextAddress() : undefined),
  });
}

// The problem code names the rule that answered, which a bare status cannot.
function problem(res: LightMyRequestResponse): string {
  return String(res.json().type ?? '').replace('/problems/', '');
}

let seq = 0;
async function register(app: FastifyInstance, opts: { email?: string; password?: string; familyName?: string } = {}): Promise<Account> {
  seq += 1;
  const res = await call(app, 'POST', '/auth/register', {
    body: { email: opts.email ?? `parent${seq}@example.com`, password: opts.password ?? 'correct horse', family_name: opts.familyName ?? `Family ${seq}` },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json() as Account;
}

async function emailSignIn(app: FastifyInstance, email: string): Promise<{ access_token: string; refresh_token: string }> {
  const start = await call(app, 'POST', '/auth/email/start', { body: { email } });
  assert.equal(start.statusCode, 202, start.body);
  const res = await call(app, 'POST', '/auth/email/verify', { body: { email, code: start.json().dev_code } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

async function addChild(app: FastifyInstance, token: string, name = 'Bông'): Promise<string> {
  const res = await call(app, 'POST', '/children', { token, body: { name } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().id as string;
}

async function addWebToy(app: FastifyInstance, token: string, childId: string): Promise<string> {
  const res = await call(app, 'POST', '/devices/web', { token, body: { child_id: childId } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().id as string;
}

function claimByCode(app: FastifyInstance, token: string, code: string, childId: string) {
  return call(app, 'POST', '/devices/claim', { token, body: { claim_code: code, child_id: childId } });
}

async function deviceRow(db: Db, id: string): Promise<DeviceRow> {
  return (await db.query<DeviceRow>('SELECT status, family_id, child_id, claimed_at, disabled_by FROM device WHERE id = $1', [id])).rows[0];
}

async function balanceOf(app: FastifyInstance, token: string): Promise<number> {
  const res = await call(app, 'GET', '/wallet', { token });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().balance as number;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('password sign-in and the family', () => {
  let db: Db;
  let app: FastifyInstance;
  let first: Account;
  let loginRefresh: string;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('registers with a password and answers with tokens, the parent and the family', async () => {
    const res = await call(app, 'POST', '/auth/register', {
      body: { email: 'Mai.Nguyen@Example.COM', password: 'correct horse', family_name: '  Nhà Mai  ', display_name: 'Mai' },
    });
    assert.equal(res.statusCode, 201, res.body);
    first = res.json();
    assert.ok(first.access_token);
    assert.ok(first.refresh_token);
    assert.equal(first.token_type, 'Bearer');
    assert.equal(first.parent.email, 'mai.nguyen@example.com', 'emails are kept lower-cased');
    assert.equal(first.parent.display_name, 'Mai');
    assert.equal(first.family.name, 'Nhà Mai');

    const saved = await db.query<{ email: string; name: string; password_hash: string }>(
      'SELECT p.email, f.name, p.password_hash FROM parent_user p JOIN family f ON f.id = p.family_id WHERE p.id = $1',
      [first.parent.id],
    );
    assert.equal(saved.rows[0].email, 'mai.nguyen@example.com');
    assert.equal(saved.rows[0].name, 'Nhà Mai');
    assert.match(saved.rows[0].password_hash, /^scrypt\$/);
    assert.ok(!saved.rows[0].password_hash.includes('correct horse'), 'only a hash is stored');

    // The access token works straight away, for the family it names.
    const me = await call(app, 'GET', '/me', { token: first.access_token });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().parent.id, first.parent.id);
    assert.equal(me.json().family.id, first.family.id);
  });

  it('gives the new family its welcome credits', async () => {
    const res = await call(app, 'GET', '/wallet', { token: first.access_token });
    assert.equal(res.statusCode, 200);
    assert.equal(config.web.welcomeCredits, 1000);
    assert.equal(res.json().balance, 1000);
    assert.deepEqual(
      res.json().ledger.map((l: { kind: string; delta: number; reason: string }) => [l.kind, l.delta, l.reason]),
      [['grant', 1000, 'welcome']],
    );
  });

  it('refuses an email that is already taken, whatever its case', async () => {
    for (const email of ['mai.nguyen@example.com', 'MAI.NGUYEN@example.com']) {
      const res = await call(app, 'POST', '/auth/register', { body: { email, password: 'another pass', family_name: 'Again' } });
      assert.equal(res.statusCode, 409, email);
      assert.equal(problem(res), 'email-taken');
    }
    const parents = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM parent_user WHERE lower(email) = 'mai.nguyen@example.com'");
    assert.equal(parents.rows[0].n, 1);
    // A refused sign-up leaves no half-made family behind.
    const families = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM family WHERE name = 'Again'");
    assert.equal(families.rows[0].n, 0);
  });

  it('refuses a password under 8 characters', async () => {
    const res = await call(app, 'POST', '/auth/register', { body: { email: 'short@example.com', password: '1234567', family_name: 'Short' } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().errors[0].field, 'password');
    assert.equal((await db.query("SELECT 1 FROM parent_user WHERE email = 'short@example.com'")).rowCount, 0);
  });

  it('refuses a family name that is only spaces as a bad request on sign-up', async () => {
    const res = await call(app, 'POST', '/auth/register', { body: { email: 'spaces@example.com', password: 'long enough', family_name: '   ' } });
    assert.equal(res.statusCode, 400, res.body);
    assert.equal((await db.query("SELECT 1 FROM parent_user WHERE email = 'spaces@example.com'")).rowCount, 0);
  });

  it('signs in with the right password, in any email case, with the same shape as sign-up', async () => {
    for (const email of ['mai.nguyen@example.com', 'MAI.Nguyen@EXAMPLE.com']) {
      const res = await call(app, 'POST', '/auth/login', { body: { email, password: 'correct horse' } });
      assert.equal(res.statusCode, 200, email);
      const body = res.json();
      assert.deepEqual(Object.keys(body).sort(), Object.keys(first).sort());
      assert.deepEqual(body.parent, first.parent);
      assert.deepEqual(body.family, first.family);
      assert.equal(body.token_type, 'Bearer');
      assert.notEqual(body.refresh_token, first.refresh_token, 'each sign-in is its own session');
      loginRefresh = body.refresh_token;
    }
  });

  it('answers a wrong password and an unknown email with the identical 401', async () => {
    const wrong = await call(app, 'POST', '/auth/login', { body: { email: 'mai.nguyen@example.com', password: 'wrong horse' } });
    const unknown = await call(app, 'POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'correct horse' } });
    assert.equal(wrong.statusCode, 401);
    assert.equal(problem(wrong), 'invalid-credentials');
    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(unknown.json(), wrong.json(), 'nothing tells whether an account exists');
    assert.equal(unknown.headers['content-type'], wrong.headers['content-type']);
  });

  it('does not let an account made by emailed code sign in with a password', async () => {
    await emailSignIn(app, 'code.only@example.com');
    // The constant-time dummy's own password is the one most likely to slip through.
    for (const password of ['anything long', 'dummy-password-for-constant-time']) {
      const res = await call(app, 'POST', '/auth/login', { body: { email: 'code.only@example.com', password } });
      assert.equal(res.statusCode, 401, password);
      assert.equal(problem(res), 'invalid-credentials');
    }
    const ghost = await call(app, 'POST', '/auth/login', { body: { email: 'ghost@example.com', password: 'dummy-password-for-constant-time' } });
    assert.equal(ghost.statusCode, 401);
    // Taking the address over with a password is refused too.
    const takeover = await call(app, 'POST', '/auth/register', { body: { email: 'Code.Only@example.com', password: 'long enough', family_name: 'Takeover' } });
    assert.equal(takeover.statusCode, 409);
    assert.equal(problem(takeover), 'email-taken');
  });

  it('still signs in after the scrypt cost rises, since a hash carries its own cost', async () => {
    // Separate apps, so neither spends the main app's sign-in budget.
    const low = apiFor(db);
    const high = apiFor(db, testConfig({ SCRYPT_COST: '2048' }));
    try {
      const reg = await register(low, { email: 'cost@example.com' });
      const res = await call(high, 'POST', '/auth/login', { body: { email: 'cost@example.com', password: 'correct horse' } });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().parent.id, reg.parent.id);
      const wrong = await call(high, 'POST', '/auth/login', { body: { email: 'cost@example.com', password: 'wrong horse' } });
      assert.equal(wrong.statusCode, 401);
    } finally {
      await low.close();
      await high.close();
    }
  });

  it('keeps refresh working after a password sign-in', async () => {
    const res = await call(app, 'POST', '/auth/refresh', { body: { refresh_token: loginRefresh } });
    assert.equal(res.statusCode, 200, res.body);
    const me = await call(app, 'GET', '/me', { token: res.json().access_token });
    assert.equal(me.json().parent.id, first.parent.id);
  });

  it('/me shows the family name and what the site may offer', async () => {
    const me = await call(app, 'GET', '/me', { token: first.access_token });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().family.name, 'Nhà Mai');
    assert.equal(me.json().web_toy, true);
    assert.equal(me.json().payments, 'demo');
  });

  it('renames the family with PATCH /family', async () => {
    const token = first.access_token;
    const res = await call(app, 'PATCH', '/family', { token, body: { name: '  Nhà Bông ' } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().id, first.family.id);
    assert.equal(res.json().name, 'Nhà Bông');
    for (const body of [{}, { name: '' }, { name: 'x'.repeat(81) }]) {
      const bad = await call(app, 'PATCH', '/family', { token, body });
      assert.equal(bad.statusCode, 400, JSON.stringify(body));
    }
    const me = await call(app, 'GET', '/me', { token });
    assert.equal(me.json().family.name, 'Nhà Bông', 'refused renames change nothing');
  });

  it('refuses a family name that is only spaces as a bad request on rename', async () => {
    const res = await call(app, 'PATCH', '/family', { token: first.access_token, body: { name: '   ' } });
    assert.equal(res.statusCode, 400, res.body);
    const me = await call(app, 'GET', '/me', { token: first.access_token });
    assert.equal(me.json().family.name, 'Nhà Bông');
  });
});

describe('welcome credits for every new family', () => {
  let db: Db;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    // Apple and Google stand-in: the route and the welcome are under test, not the token check.
    const oidc = {
      verify: async (_provider: string, idToken: string) => ({ subject: `sub-${idToken}`, email: `${idToken}@example.com` }),
    } as unknown as OidcVerifier;
    app = apiFor(db, config, { oidc });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('welcomes a family made by emailed code, once', async () => {
    const first = await emailSignIn(app, 'kim@example.com');
    assert.equal(await balanceOf(app, first.access_token), 1000);
    const again = await emailSignIn(app, 'kim@example.com');
    assert.equal(await balanceOf(app, again.access_token), 1000, 'signing in again is not a new family');
  });

  it('welcomes a family made with Apple or Google, once', async () => {
    const signIn = async () => {
      const res = await call(app, 'POST', '/auth/oidc', { body: { provider: 'google', id_token: 'gina' } });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().access_token as string;
    };
    assert.equal(await balanceOf(app, await signIn()), 1000);
    assert.equal(await balanceOf(app, await signIn()), 1000);
  });

  it('links an emailed code to the password account without a second welcome', async () => {
    const reg = await register(app, { email: 'Linh@Example.com' });
    const code = await emailSignIn(app, 'LINH@example.com');
    const me = await call(app, 'GET', '/me', { token: code.access_token });
    assert.equal(me.json().parent.id, reg.parent.id);
    assert.equal(await balanceOf(app, code.access_token), 1000);
  });

  it('makes a family with no ledger row when the welcome is zero', async () => {
    // The ledger refuses a zero delta, so a zero welcome must write nothing rather than fail the sign-up.
    const zero = apiFor(db, testConfig({ WELCOME_CREDITS: '0' }));
    try {
      const reg = await register(zero);
      const wallet = await call(zero, 'GET', '/wallet', { token: reg.access_token });
      assert.equal(wallet.json().balance, 0);
      assert.deepEqual(wallet.json().ledger, []);
    } finally {
      await zero.close();
    }
  });
});

describe('credits and purchases', () => {
  let db: Db;
  let app: FastifyInstance;
  let a: Account;
  let b: Account;
  let buyOne: { id: string };

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    a = await register(app);
    b = await register(app);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const buy = (who: Account, body: Record<string, unknown>) => call(app, 'POST', '/purchases', { token: who.access_token, body });
  const pay = (who: Account, id: string, outcome: 'success' | 'decline' = 'success') =>
    call(app, 'POST', `/purchases/${id}/demo-pay`, { token: who.access_token, body: { outcome } });
  const ledgerRows = async (purchaseId: string) =>
    (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM credit_ledger WHERE purchase_id = $1', [purchaseId])).rows[0].n;

  it('lists the credit packs to a visitor without a token', async () => {
    const res = await call(app, 'GET', '/credit-packs');
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(
      res.json().packs.map((p: { id: string; credits: number; price_amount: number; currency: string }) => [p.id, p.credits, p.price_amount, p.currency]),
      [['starter', 20, 49000, 'VND'], ['family', 60, 129000, 'VND'], ['big', 150, 299000, 'VND']],
    );
    // Only the price list is public: the wallet still needs a parent.
    assert.equal((await call(app, 'GET', '/wallet')).statusCode, 401);
    assert.equal((await call(app, 'GET', '/purchases')).statusCode, 401);
  });

  it('opens one purchase per idempotency key', async () => {
    const first = await buy(a, { pack_id: 'starter', idempotency_key: 'buy-1' });
    assert.equal(first.statusCode, 201, first.body);
    const p = first.json().purchase;
    buyOne = p;
    assert.equal(p.pack_id, 'starter');
    assert.equal(p.status, 'pending');
    assert.equal(p.credits, 20);
    assert.equal(p.price_amount, 49000);
    assert.equal(p.currency, 'VND');
    assert.equal(p.paid_at, null);

    const retry = await buy(a, { pack_id: 'starter', idempotency_key: 'buy-1' });
    assert.equal(retry.statusCode, 200);
    assert.deepEqual(retry.json().purchase, p);

    const otherPack = await buy(a, { pack_id: 'family', idempotency_key: 'buy-1' });
    assert.equal(otherPack.statusCode, 422);
    assert.equal(problem(otherPack), 'idempotency-key-reused');

    const n = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM purchase WHERE family_id = $1 AND idempotency_key = 'buy-1'", [a.family.id]);
    assert.equal(n.rows[0].n, 1);

    // Keys belong to a family: the same key from another family is its own checkout.
    const theirs = await buy(b, { pack_id: 'starter', idempotency_key: 'buy-1' });
    assert.equal(theirs.statusCode, 201);
    assert.notEqual(theirs.json().purchase.id, p.id);
  });

  it('refuses a pack that does not exist or is no longer sold', async () => {
    const unknown = await buy(a, { pack_id: 'no_such_pack' });
    assert.equal(unknown.statusCode, 404);
    assert.equal(problem(unknown), 'not-found');
    assert.equal((await buy(a, { pack_id: 'x' })).statusCode, 400);

    await db.query("UPDATE credit_pack SET active = false WHERE id = 'big'");
    try {
      const packs = await call(app, 'GET', '/credit-packs');
      assert.deepEqual(packs.json().packs.map((p: { id: string }) => p.id), ['starter', 'family']);
      const retired = await buy(a, { pack_id: 'big' });
      assert.equal(retired.statusCode, 404);
    } finally {
      await db.query("UPDATE credit_pack SET active = true WHERE id = 'big'");
    }
  });

  it("adds a paid pack's credits exactly once", async () => {
    const paid = await pay(a, buyOne.id);
    assert.equal(paid.statusCode, 200, paid.body);
    assert.equal(paid.json().purchase.status, 'paid');
    assert.ok(paid.json().purchase.paid_at);
    assert.equal(paid.json().balance, 1020);

    const twice = await pay(a, buyOne.id);
    assert.equal(twice.statusCode, 409);
    assert.equal(problem(twice), 'purchase-not-pending');
    const declineAfter = await pay(a, buyOne.id, 'decline');
    assert.equal(declineAfter.statusCode, 409);
    assert.equal(problem(declineAfter), 'purchase-not-pending');

    const wallet = await call(app, 'GET', '/wallet', { token: a.access_token });
    assert.equal(wallet.json().balance, 1020);
    assert.deepEqual(
      wallet.json().ledger.map((l: { kind: string; delta: number; purchase_id: string | null }) => [l.kind, l.delta, l.purchase_id]),
      [['purchase', 20, buyOne.id], ['grant', 1000, null]],
      'newest first',
    );
    assert.equal(await ledgerRows(buyOne.id), 1);
    const latest = await call(app, 'GET', '/wallet?limit=1', { token: a.access_token });
    assert.equal(latest.json().ledger.length, 1);
    assert.equal(latest.json().balance, 1020, 'the limit pages the ledger, not the balance');

    // A retried checkout after paying finds the paid purchase instead of opening another.
    const retry = await buy(a, { pack_id: 'starter', idempotency_key: 'buy-1' });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().purchase.id, buyOne.id);
    assert.equal(retry.json().purchase.status, 'paid');
    assert.equal(await balanceOf(app, a.access_token), 1020);
  });

  it('marks a declined payment failed and adds nothing', async () => {
    const open = await buy(a, { pack_id: 'family' });
    assert.equal(open.statusCode, 201);
    const id = open.json().purchase.id;
    const declined = await pay(a, id, 'decline');
    assert.equal(declined.statusCode, 200, declined.body);
    assert.equal(declined.json().purchase.status, 'failed');
    assert.equal(declined.json().purchase.failure_reason, 'card_declined');
    assert.equal(declined.json().purchase.paid_at, null);
    assert.equal(declined.json().balance, 1020);

    const payAfter = await pay(a, id);
    assert.equal(payAfter.statusCode, 409);
    assert.equal(problem(payAfter), 'purchase-not-pending');
    assert.equal(await ledgerRows(id), 0);
    assert.equal(await balanceOf(app, a.access_token), 1020);
  });

  it('keeps purchases inside their family', async () => {
    const open = await buy(a, { pack_id: 'starter' });
    const id = open.json().purchase.id;

    const mine = await call(app, 'GET', '/purchases', { token: a.access_token });
    assert.equal(mine.json().purchases[0].id, id, 'newest first');
    const theirs = await call(app, 'GET', '/purchases', { token: b.access_token });
    assert.ok(!theirs.json().purchases.some((p: { id: string }) => p.id === id));

    const stolen = await pay(b, id);
    assert.equal(stolen.statusCode, 404);
    const row = await db.query<{ status: string }>('SELECT status FROM purchase WHERE id = $1', [id]);
    assert.equal(row.rows[0].status, 'pending');
    assert.equal(await balanceOf(app, b.access_token), 1000);
    assert.equal(await balanceOf(app, a.access_token), 1020);

    assert.equal((await pay(a, '00000000-0000-4000-8000-000000000000')).statusCode, 404);
    assert.equal((await pay(a, 'not-a-uuid')).statusCode, 404);
  });

  it('credits what the pack held when the purchase was opened', async () => {
    const open = await buy(a, { pack_id: 'starter' });
    const id = open.json().purchase.id;
    await db.query("UPDATE credit_pack SET credits = 999, price_amount = 1 WHERE id = 'starter'");
    try {
      const paid = await pay(a, id);
      assert.equal(paid.statusCode, 200, paid.body);
      assert.equal(paid.json().purchase.credits, 20);
      assert.equal(paid.json().purchase.price_amount, 49000);
      assert.equal(paid.json().balance, 1040);
    } finally {
      await db.query("UPDATE credit_pack SET credits = 20, price_amount = 49000 WHERE id = 'starter'");
    }
  });

  it('limits how fast one parent can open checkouts, without slowing anyone else', async () => {
    const c = await register(app);
    const statuses: number[] = [];
    for (let i = 0; i < 30 && !statuses.includes(429); i += 1) {
      const res = await buy(c, { pack_id: 'starter' });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) assert.equal(problem(res), 'rate-limited');
    }
    assert.ok(statuses.includes(429), 'thirty checkouts in a row are not all let through');
    assert.ok(statuses.slice(0, -1).every((s) => s === 201));
    // A refused checkout opens nothing.
    const opened = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM purchase WHERE family_id = $1', [c.family.id]);
    assert.equal(opened.rows[0].n, statuses.length - 1);
    assert.equal((await buy(b, { pack_id: 'starter' })).statusCode, 201, "another parent's checkouts have their own budget");
  });

  it('refuses buying with PAYMENT_PROVIDER=disabled while packs and the wallet still work', async () => {
    // Opened while buying was on, so paying it later is the only way in.
    const pending = (await buy(a, { pack_id: 'family' })).json().purchase.id;
    const off = apiFor(db, testConfig({ PAYMENT_PROVIDER: 'disabled' }));
    try {
      const create = await call(off, 'POST', '/purchases', { token: a.access_token, body: { pack_id: 'starter' } });
      assert.equal(create.statusCode, 403);
      assert.equal(problem(create), 'payments-disabled');
      const payIt = await call(off, 'POST', `/purchases/${pending}/demo-pay`, { token: a.access_token, body: { outcome: 'success' } });
      assert.equal(payIt.statusCode, 403);
      assert.equal(problem(payIt), 'payments-disabled');
      const row = await db.query<{ status: string }>('SELECT status FROM purchase WHERE id = $1', [pending]);
      assert.equal(row.rows[0].status, 'pending');
      assert.equal(await ledgerRows(pending), 0);

      const packs = await call(off, 'GET', '/credit-packs');
      assert.equal(packs.statusCode, 200);
      assert.equal(packs.json().packs.length, 3);
      const wallet = await call(off, 'GET', '/wallet', { token: a.access_token });
      assert.equal(wallet.statusCode, 200);
      assert.equal(wallet.json().balance, 1040);
      const me = await call(off, 'GET', '/me', { token: a.access_token });
      assert.equal(me.json().payments, 'disabled');
    } finally {
      await off.close();
    }
  });
});

describe('payment provider in the config', () => {
  // Everything else production insists on, so only the payment provider is in question.
  const prod = {
    NODE_ENV: 'production',
    JWT_SECRET: 'j'.repeat(40),
    DEVICE_KEK: 'k'.repeat(40),
    GATEWAY: 'live',
    OPENAI_API_KEY: 'sk-test',
    ELEVENLABS_API_KEY: 'el-test',
    ALLOW_TEXT_TURNS: '0',
    EMAIL_DEV_ECHO: '0',
  };

  it('refuses PAYMENT_PROVIDER=demo in production, since it gives credits away', () => {
    assert.throws(() => loadConfig({ ...prod, PAYMENT_PROVIDER: 'demo' }), /PAYMENT_PROVIDER/);
  });

  it('defaults production to disabled and accepts it', () => {
    assert.equal(loadConfig(prod).web.paymentProvider, 'disabled');
    assert.equal(loadConfig({ ...prod, PAYMENT_PROVIDER: 'disabled' }).web.paymentProvider, 'disabled');
  });

  it('accepts only demo or disabled anywhere', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'stripe' }), /PAYMENT_PROVIDER/);
    assert.equal(testConfig().web.paymentProvider, 'demo');
  });
});

describe("a Buddy's personality type and picked voice", () => {
  const bo = SEED_CAST.find((c) => c.slug === 'bo')!;
  const VOICE = {
    phanAnh: 'mgBpvrNosWzExdPuRbXP',
    camHong: 'x4KAhuXs2G8TfK9Zr7Q4',
    littleDude: 'fBD19tfE58bkETeiwUoC',
    ziggy: '87n4zM8Wuy87vFILuKvE',
    elf: 'e79twtVS2278lVZZQiAD',
  };
  let db: Db;
  let app: FastifyInstance;
  let token: string;
  let childId: string;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    token = (await register(app)).access_token;
    const child = await call(app, 'POST', '/children', { token, body: { name: 'Bông', languages: ['vi'] } });
    childId = child.json().id;
    const q = await call(app, 'POST', `/children/${childId}/questionnaire`, {
      token,
      body: {
        answers: [
          { question: 'friend_energy', answer: 'bouncy', by: 'child' },
          { question: 'friend_style', answer: 'silly', by: 'child' },
          { question: 'role', answer: 'friend', by: 'parent' },
          { question: 'language', answer: 'vi', by: 'parent' },
        ],
      },
    });
    assert.equal(q.statusCode, 201, q.body);
    // Bo is picked by name rather than by the match, so the ranges below are known.
    const created = await call(app, 'POST', `/children/${childId}/buddy`, { token, body: { questionnaire_id: q.json().questionnaire_id, character_slug: 'bo' } });
    assert.equal(created.statusCode, 201, created.body);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const load = async () => {
    const res = await call(app, 'GET', `/children/${childId}/buddy`, { token });
    assert.equal(res.statusCode, 200, res.body);
    return res;
  };
  // Sends the ETag it has just loaded, as the website does.
  const patch = async (body: Record<string, unknown>) => {
    const etag = (await load()).headers.etag as string;
    return call(app, 'PATCH', `/children/${childId}/buddy`, { token, body, headers: { 'if-match': etag } });
  };
  const assertInRanges = (dials: Dials) => {
    for (const k of DIAL_KEYS) {
      const [lo, hi] = bo.dial_ranges[k];
      assert.ok(dials[k] >= lo && dials[k] <= hi, `${k} ${dials[k]} is outside Bo's range [${lo}, ${hi}]`);
    }
  };
  const middle = (k: keyof Dials) => (bo.dial_ranges[k][0] + bo.dial_ranges[k][1]) / 2;

  it("starts with no type and no picked voice, and shows the character's own voices", async () => {
    const buddy = (await load()).json();
    assert.equal(buddy.character_slug, 'bo');
    assert.equal(buddy.language_mode, 'vi');
    assert.equal(buddy.personality, null);
    assert.equal(buddy.voice_id, null);
    assert.deepEqual(buddy.character_voices, { vi: bo.voices.vi.voice_id, en: bo.voices.en.voice_id });
    assert.deepEqual(buddy.character_voices, { vi: VOICE.phanAnh, en: VOICE.littleDude });
  });

  it('lists the five voices a parent can pick, each speaking one language', async () => {
    const res = await call(app, 'GET', '/voices', { token });
    assert.equal(res.statusCode, 200, res.body);
    const voices = (res.json().data as { id: string; name: string; language: string }[])
      .map((v) => [v.id, v.name, v.language])
      .sort((x, y) => x[1].localeCompare(y[1]));
    assert.deepEqual(voices, [
      [VOICE.camHong, 'Cam Hong', 'vi'],
      [VOICE.littleDude, 'Little Dude II', 'en'],
      [VOICE.phanAnh, 'Phan Anh', 'vi'],
      [VOICE.elf, 'The Elf', 'en'],
      [VOICE.ziggy, 'Ziggy', 'en'],
    ]);
  });

  it("sets the five dials from a personality type, inside the character's ranges", async () => {
    const enfp = await patch({ personality: 'ENFP' });
    assert.equal(enfp.statusCode, 200, enfp.body);
    assert.equal(enfp.json().personality, 'ENFP');
    const e = enfp.json().dials as Dials;
    assertInRanges(e);
    // E is the lively end of energy and P the loose end of structure.
    assert.ok(e.energy >= middle('energy'), `ENFP energy ${e.energy} should be high for Bo`);
    assert.ok(e.structure <= middle('structure'), `ENFP structure ${e.structure} should be low for Bo`);

    const istj = await patch({ personality: 'ISTJ' });
    assert.equal(istj.statusCode, 200, istj.body);
    const i = istj.json().dials as Dials;
    assertInRanges(i);
    assert.ok(e.energy > i.energy, 'an E type has more energy than an I type');
    assert.ok(e.structure < i.structure, 'a P type keeps less structure than a J type');

    // Stored, not only echoed.
    assert.deepEqual((await load()).json().dials, i);
  });

  it('keeps the dials when the type is cleared', async () => {
    const set = await patch({ personality: 'ENFP' });
    const cleared = await patch({ personality: null });
    assert.equal(cleared.statusCode, 200, cleared.body);
    assert.equal(cleared.json().personality, null);
    assert.deepEqual(cleared.json().dials, set.json().dials);
  });

  it('lets explicit dials sent with a type win, still inside the ranges', async () => {
    const typeOnly = (await patch({ personality: 'ENFP' })).json().dials as Dials;
    const res = await patch({ personality: 'ENFP', dials: { energy: 55, structure: 0 } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().personality, 'ENFP');
    const d = res.json().dials as Dials;
    assert.equal(d.energy, 55);
    assert.equal(d.structure, bo.dial_ranges.structure[0], 'a dial below the range is held at its bottom');
    assert.equal(d.curiosity, typeOnly.curiosity);
    assert.equal(d.warmth, typeOnly.warmth);
    assert.equal(d.playfulness, typeOnly.playfulness);
  });

  it('refuses a type that is not one of the 16', async () => {
    const before = (await load()).json();
    for (const personality of ['XXXX', 'ENF', 'ENFPX', 'ENFX']) {
      const res = await patch({ personality });
      assert.equal(res.statusCode, 400, personality);
      assert.equal(res.json().errors[0].field, 'personality');
    }
    const now = (await load()).json();
    assert.equal(now.personality, before.personality);
    assert.deepEqual(now.dials, before.dials);
  });

  it("needs a picked voice to speak the Buddy's language", async () => {
    // The Buddy speaks Vietnamese, from the questionnaire.
    const wrong = await patch({ voice_id: VOICE.ziggy });
    assert.equal(wrong.statusCode, 400);
    assert.deepEqual(wrong.json().errors, [{ field: 'voice_id', code: 'language' }]);
    const unknown = await patch({ voice_id: 'no-such-voice' });
    assert.equal(unknown.statusCode, 400);
    assert.deepEqual(unknown.json().errors, [{ field: 'voice_id', code: 'enum' }]);
    assert.equal((await load()).json().voice_id, null, 'a refused voice is not saved');

    const right = await patch({ voice_id: VOICE.camHong });
    assert.equal(right.statusCode, 200, right.body);
    assert.equal(right.json().voice_id, VOICE.camHong);

    // A voice is checked against the language sent beside it, not the old one.
    const mixed = await patch({ language_mode: 'en', voice_id: VOICE.phanAnh });
    assert.equal(mixed.statusCode, 400);
    assert.deepEqual(mixed.json().errors, [{ field: 'voice_id', code: 'language' }]);
    const after = (await load()).json();
    assert.equal(after.language_mode, 'vi');
    assert.equal(after.voice_id, VOICE.camHong);
    const both = await patch({ language_mode: 'en', voice_id: VOICE.littleDude });
    assert.equal(both.statusCode, 200, both.body);
    assert.equal(both.json().language_mode, 'en');
    assert.equal(both.json().voice_id, VOICE.littleDude);

    // null hands the Buddy back to its character's own voice.
    const cleared = await patch({ voice_id: null });
    assert.equal(cleared.statusCode, 200);
    assert.equal(cleared.json().voice_id, null);
  });

  // Out loud a bilingual Buddy speaks the child's first language (Vietnamese
  // here), so only a voice of that language would ever be heard.
  it("lets a bilingual Buddy take only a voice of the child's first language", async () => {
    assert.equal((await patch({ language_mode: 'bilingual' })).statusCode, 200);
    const english = await patch({ voice_id: VOICE.elf });
    assert.equal(english.statusCode, 400);
    assert.deepEqual(english.json().errors, [{ field: 'voice_id', code: 'language' }]);
    const vietnamese = await patch({ voice_id: VOICE.phanAnh });
    assert.equal(vietnamese.statusCode, 200, vietnamese.body);
    assert.equal(vietnamese.json().voice_id, VOICE.phanAnh);
  });

  it('clears the voice when it is sent empty, as a default-voice option may do', async () => {
    assert.equal((await patch({ voice_id: VOICE.camHong })).statusCode, 200);
    const cleared = await patch({ voice_id: '' });
    assert.equal(cleared.statusCode, 200, cleared.body);
    assert.equal(cleared.json().voice_id, null);
  });

  it('drops a voice that no longer fits when the language changes, and keeps one that does', async () => {
    const setUp = await patch({ language_mode: 'en', voice_id: VOICE.elf });
    assert.equal(setUp.statusCode, 200, setUp.body);
    const toEnglish = await patch({ role: 'friend' });
    assert.equal(toEnglish.statusCode, 200);
    assert.equal(toEnglish.json().voice_id, VOICE.elf, 'an English voice suits an English Buddy');
    const toBothFromEnglish = await patch({ language_mode: 'bilingual' });
    assert.equal(toBothFromEnglish.json().voice_id, null, "a bilingual Buddy speaks the child's first language, Vietnamese");
    assert.equal((await patch({ language_mode: 'en', voice_id: VOICE.elf })).statusCode, 200);
    const toVietnamese = await patch({ language_mode: 'vi' });
    assert.equal(toVietnamese.statusCode, 200, toVietnamese.body);
    assert.equal(toVietnamese.json().language_mode, 'vi');
    assert.equal(toVietnamese.json().voice_id, null, 'an English voice cannot speak for a Vietnamese Buddy');

    assert.equal((await patch({ voice_id: VOICE.camHong })).statusCode, 200);
    const toBoth = await patch({ language_mode: 'bilingual' });
    assert.equal(toBoth.json().voice_id, VOICE.camHong, "a Vietnamese voice still fits a bilingual Buddy whose child speaks Vietnamese first");
    const roleOnly = await patch({ role: 'teacher' });
    assert.equal(roleOnly.json().role, 'teacher');
    assert.equal(roleOnly.json().voice_id, VOICE.camHong, 'other edits leave the voice alone');
  });

  it('needs If-Match and refuses a stale ETag', async () => {
    const loaded = await load();
    const etag = loaded.headers.etag as string;
    const before = loaded.json();
    const url = `/children/${childId}/buddy`;
    const none = await call(app, 'PATCH', url, { token, body: { personality: 'INFJ' } });
    assert.equal(none.statusCode, 428);

    const ok = await call(app, 'PATCH', url, { token, body: { personality: 'INFJ' }, headers: { 'if-match': etag } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.notEqual(ok.headers.etag, etag, 'every edit makes a new ETag');

    const stale = await call(app, 'PATCH', url, { token, body: { voice_id: VOICE.phanAnh, personality: 'ESTP' }, headers: { 'if-match': etag } });
    assert.equal(stale.statusCode, 412);
    assert.equal(problem(stale), 'stale-write');
    const now = (await load()).json();
    assert.equal(now.personality, 'INFJ');
    assert.equal(now.voice_id, before.voice_id, 'nothing from the stale write landed');
  });
});

describe('Buddies that live in the browser', () => {
  let db: Db;
  let app: FastifyInstance;
  let a: Account;
  let b: Account;
  const kids: string[] = [];
  let bKid: string;
  let bSpareKid: string;
  let firstToy: string;
  let bToy: string;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    a = await register(app);
    b = await register(app);
    for (const name of ['An', 'Bình', 'Chi', 'Dung']) kids.push(await addChild(app, a.access_token, name));
    bKid = await addChild(app, b.access_token, 'Em');
    bSpareKid = await addChild(app, b.access_token, 'Giang');
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const webCount = async (familyId: string) =>
    (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM device WHERE family_id = $1 AND hardware_rev = 'web'", [familyId])).rows[0].n;

  it('makes an active Buddy for a child, owned from the start', async () => {
    const res = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kids[0] } });
    assert.equal(res.statusCode, 201, res.body);
    const toy = res.json();
    firstToy = toy.id;
    assert.equal(toy.status, 'active');
    assert.equal(toy.hardware_rev, 'web');
    assert.equal(toy.child_id, kids[0]);
    assert.equal(toy.disabled_by, null);
    assert.match(toy.serial, /^WEB-/);
    assert.ok(toy.claimed_at);
    for (const key of ['secret', 'secret_sealed', 'claim_code', 'claim_code_hash', 'family_id']) assert.equal(toy[key], undefined, key);

    const row = await deviceRow(db, toy.id);
    assert.equal(row.family_id, a.family.id);
    const list = await call(app, 'GET', '/devices', { token: a.access_token });
    assert.deepEqual(list.json().data.map((d: { id: string }) => d.id), [toy.id]);
    const events = await db.query<{ kind: string }>('SELECT kind FROM device_event WHERE device_id = $1 ORDER BY id', [toy.id]);
    assert.deepEqual(events.rows.map((r) => r.kind), ['provisioned', 'claimed']);
  });

  it('refuses a second toy for the same child', async () => {
    const res = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kids[0] } });
    assert.equal(res.statusCode, 409);
    assert.equal(problem(res), 'child-has-toy');
    assert.equal(await webCount(a.family.id), 1);
  });

  it('allows three per family', async () => {
    await addWebToy(app, a.access_token, kids[1]);
    await addWebToy(app, a.access_token, kids[2]);
    const fourth = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kids[3] } });
    assert.equal(fourth.statusCode, 409);
    assert.equal(problem(fourth), 'web-toy-limit');
    assert.equal(await webCount(a.family.id), 3);
    // A paused Buddy still exists and can be woken, so it keeps its place.
    const sleeper = (await call(app, 'GET', '/devices', { token: a.access_token })).json().data.find((d: { child_id: string }) => d.child_id === kids[1]).id;
    assert.equal((await call(app, 'POST', `/devices/${sleeper}/pause`, { token: a.access_token })).statusCode, 200);
    const whilePaused = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kids[3] } });
    assert.equal(whilePaused.statusCode, 409);
    assert.equal(problem(whilePaused), 'web-toy-limit');
    assert.equal((await call(app, 'POST', `/devices/${sleeper}/resume`, { token: a.access_token })).statusCode, 200);
    // The cap is per family.
    bToy = await addWebToy(app, b.access_token, bKid);
  });

  it("refuses another family's child", async () => {
    const res = await call(app, 'POST', '/devices/web', { token: b.access_token, body: { child_id: kids[3] } });
    assert.equal(res.statusCode, 404);
    const none = await db.query('SELECT 1 FROM device WHERE child_id = $1', [kids[3]]);
    assert.equal(none.rowCount, 0);
    assert.equal(await webCount(b.family.id), 1);
  });

  it('hands its secret to its own family only', async () => {
    const res = await call(app, 'POST', `/devices/${firstToy}/credential`, { token: a.access_token });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().device_id, firstToy);
    const secret = res.json().secret as string;
    assert.match(secret, /^[A-Za-z0-9_-]+$/, 'base64url');
    assert.equal(fromB64url(secret).length, 32);
    const stored = await loadDeviceSecret(db, config.deviceKek, firstToy);
    assert.ok(stored);
    assert.equal(secret, b64url(stored));

    const theirs = await call(app, 'POST', `/devices/${firstToy}/credential`, { token: b.access_token });
    assert.equal(theirs.statusCode, 404);
    assert.ok(!theirs.body.includes(secret));
    const reverse = await call(app, 'POST', `/devices/${bToy}/credential`, { token: a.access_token });
    assert.equal(reverse.statusCode, 404);
  });

  it("never hands out a physical toy's secret", async () => {
    const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
    const claimed = await claimByCode(app, a.access_token, box.claim_code, kids[3]);
    assert.equal(claimed.statusCode, 201, claimed.body);
    const res = await call(app, 'POST', `/devices/${box.device_id}/credential`, { token: a.access_token });
    assert.equal(res.statusCode, 404);
    assert.ok(!res.body.includes(box.secret));
    // A physical toy does not count toward the browser cap either.
    assert.equal(await webCount(a.family.id), 3);
  });

  it('is off with WEB_TOY=off', async () => {
    const off = apiFor(db, testConfig({ WEB_TOY: 'off' }));
    try {
      const make = await call(off, 'POST', '/devices/web', { token: b.access_token, body: { child_id: bSpareKid } });
      assert.equal(make.statusCode, 403);
      assert.equal(problem(make), 'web-toy-off');
      assert.equal((await db.query('SELECT 1 FROM device WHERE child_id = $1', [bSpareKid])).rowCount, 0);
      const cred = await call(off, 'POST', `/devices/${firstToy}/credential`, { token: a.access_token });
      assert.equal(cred.statusCode, 403);
      assert.equal(problem(cred), 'web-toy-off');
      const me = await call(off, 'GET', '/me', { token: a.access_token });
      assert.equal(me.json().web_toy, false);
    } finally {
      await off.close();
    }
  });

  it('frees its place under the cap once unpaired', async () => {
    assert.equal((await call(app, 'POST', `/devices/${firstToy}/unpair`, { token: a.access_token })).statusCode, 204);
    const again = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kids[0] } });
    assert.equal(again.statusCode, 201, again.body);
    assert.notEqual(again.json().id, firstToy, 'a new Buddy, not the revoked one');
  });
});

describe('pausing and waking toys', () => {
  let db: Db;
  let app: FastifyInstance;
  const blocked: string[] = [];
  let a: Account;
  let b: Account;
  let kid: string;
  let toy: string;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db, config, { blocked });
    a = await register(app);
    b = await register(app);
    kid = await addChild(app, a.access_token);
    toy = await addWebToy(app, a.access_token, kid);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const act = (who: Account, id: string, what: 'pause' | 'resume' | 'credential') => call(app, 'POST', `/devices/${id}/${what}`, { token: who.access_token });

  it('pauses a toy, and a second pause is no error', async () => {
    const res = await act(a, toy, 'pause');
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().id, toy);
    assert.equal(res.json().status, 'disabled');
    assert.equal(res.json().disabled_by, 'parent');
    assert.ok(blocked.includes(toy), 'its live socket is closed at once');

    const again = await act(a, toy, 'pause');
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().status, 'disabled');
    assert.equal(again.json().disabled_by, 'parent');

    // An asleep Buddy gives the browser no secret.
    const cred = await act(a, toy, 'credential');
    assert.equal(cred.statusCode, 409);
    assert.equal(problem(cred), 'toy-not-active');
  });

  it('wakes a toy a parent paused', async () => {
    const res = await act(a, toy, 'resume');
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, 'active');
    assert.equal(res.json().disabled_by, null);
    assert.equal((await act(a, toy, 'credential')).statusCode, 200);
    const events = await db.query<{ kind: string }>('SELECT kind FROM device_event WHERE device_id = $1 ORDER BY id', [toy]);
    assert.deepEqual(events.rows.map((r) => r.kind), ['provisioned', 'claimed', 'disabled', 'enabled']);
  });

  it('cannot wake, or turn into its own pause, a toy staff disabled', async () => {
    await db.query("UPDATE device SET status = 'disabled', disabled_by = 'staff' WHERE id = $1", [toy]);
    const wake = await act(a, toy, 'resume');
    assert.equal(wake.statusCode, 409);
    assert.equal(problem(wake), 'toy-held');
    const pause = await act(a, toy, 'pause');
    assert.equal(pause.statusCode, 409);
    const row = await deviceRow(db, toy);
    assert.equal(row.status, 'disabled');
    assert.equal(row.disabled_by, 'staff', 'a parent pause must not overwrite a staff hold');
    // A second wake after the refused pause still cannot get through.
    assert.equal((await act(a, toy, 'resume')).statusCode, 409);
    assert.equal((await deviceRow(db, toy)).status, 'disabled');
    const cred = await act(a, toy, 'credential');
    assert.equal(cred.statusCode, 409, 'a held Buddy gives the browser no secret');
    assert.equal(problem(cred), 'toy-not-active');
    await db.query("UPDATE device SET status = 'active', disabled_by = NULL WHERE id = $1", [toy]);
  });

  it("cannot pause or wake another family's toy", async () => {
    const pause = await act(b, toy, 'pause');
    assert.equal(pause.statusCode, 404);
    assert.equal((await deviceRow(db, toy)).status, 'active');
    await act(a, toy, 'pause');
    const wake = await act(b, toy, 'resume');
    assert.equal(wake.statusCode, 404);
    assert.equal((await deviceRow(db, toy)).status, 'disabled');
    assert.equal((await act(a, toy, 'resume')).statusCode, 200);
    assert.equal((await call(app, 'POST', '/devices/not-a-uuid/pause', { token: a.access_token })).statusCode, 404);
  });

  it('will not wake a toy whose child got another toy while it slept', async () => {
    assert.equal((await act(a, toy, 'pause')).statusCode, 200);
    // While the first sleeps, the child has no awake toy, so a second one is allowed.
    const second = await addWebToy(app, a.access_token, kid);
    const wake = await act(a, toy, 'resume');
    assert.equal(wake.statusCode, 409);
    assert.equal(problem(wake), 'child-has-toy');
    const row = await deviceRow(db, toy);
    assert.equal(row.status, 'disabled');
    assert.equal(row.disabled_by, 'parent');
    assert.equal((await deviceRow(db, second)).status, 'active');
  });
});

describe('claiming a toy with the code printed on its box', () => {
  let db: Db;
  let app: FastifyInstance;
  let a: Account;
  let b: Account;
  let aKid: string;
  let bKid: string;
  let box: ManifestEntry;
  let spare: ManifestEntry;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    [box, spare] = await provisionDevices(db, config.deviceKek, { count: 2, hardwareRev: 'test' });
    a = await register(app);
    b = await register(app);
    aKid = await addChild(app, a.access_token);
    bKid = await addChild(app, b.access_token);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('gives each toy a printed code without look-alike characters, and stores only a keyed hash', async () => {
    for (const entry of [box, spare]) {
      // Eight characters, none of I, L, O, U, 0 or 1.
      assert.match(entry.claim_code, /^[A-HJKMNP-TV-Z2-9]{8}$/);
    }
    assert.notEqual(box.claim_code, spare.claim_code);
    const row = (await db.query<{ claim_code_hash: string }>('SELECT claim_code_hash FROM device WHERE id = $1', [box.device_id])).rows[0];
    assert.ok(row.claim_code_hash);
    assert.ok(!row.claim_code_hash.includes(box.claim_code));
  });

  it('claims with the code typed in lower case and with a dash', async () => {
    const typed = `${box.claim_code.slice(0, 4)}-${box.claim_code.slice(4)}`.toLowerCase();
    const res = await claimByCode(app, a.access_token, typed, aKid);
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().id, box.device_id);
    assert.equal(res.json().status, 'active');
    assert.equal(res.json().child_id, aKid);
    assert.equal(res.json().hardware_rev, 'test');
    assert.equal((await deviceRow(db, box.device_id)).family_id, a.family.id);
  });

  it('answers a retry by the same family with 200', async () => {
    const res = await claimByCode(app, a.access_token, box.claim_code, aKid);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().id, box.device_id);
    const claims = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM device_event WHERE device_id = $1 AND kind = 'claimed'", [box.device_id]);
    assert.equal(claims.rows[0].n, 1, 'a retry writes nothing');
  });

  it("reads another family's use of a used code exactly as a wrong code", async () => {
    const used = await claimByCode(app, b.access_token, box.claim_code, bKid);
    const wrong = await claimByCode(app, b.access_token, 'ZZZZ-ZZZZ', bKid);
    assert.equal(used.statusCode, 404);
    assert.equal(problem(used), 'invalid-claim');
    assert.equal(wrong.statusCode, 404);
    assert.deepEqual(used.json(), wrong.json(), 'codes cannot be probed');
    const row = await deviceRow(db, box.device_id);
    assert.equal(row.family_id, a.family.id);
    assert.equal(row.child_id, aKid);
  });

  it('refuses a malformed code as an invalid one', async () => {
    for (const code of ['ABC', 'IIII-LLLL', '0000-1111', 'ABCD-EFGH-J', '--------']) {
      const res = await claimByCode(app, b.access_token, code, bKid);
      assert.equal(res.statusCode, 404, code);
      assert.equal(problem(res), 'invalid-claim');
    }
  });

  it('needs exactly one of claim_token and claim_code', async () => {
    const token = makeClaimToken(fromB64url(spare.secret), spare.device_id, nowSec());
    const both = await call(app, 'POST', '/devices/claim', { token: b.access_token, body: { claim_token: token, claim_code: spare.claim_code, child_id: bKid } });
    assert.equal(both.statusCode, 400);
    const neither = await call(app, 'POST', '/devices/claim', { token: b.access_token, body: { child_id: bKid } });
    assert.equal(neither.statusCode, 400);
    assert.equal((await deviceRow(db, spare.device_id)).status, 'provisioned', 'a refused claim takes nothing');
    // Each alone still works.
    const byToken = await call(app, 'POST', '/devices/claim', { token: b.access_token, body: { claim_token: token, child_id: bKid } });
    assert.equal(byToken.statusCode, 201, byToken.body);
  });
});

describe('letting go of toys', () => {
  let db: Db;
  let app: FastifyInstance;
  const blocked: string[] = [];

  before(async () => {
    db = await createTestDb();
    app = apiFor(db, config, { blocked });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const assertRevoked = async (id: string) => {
    const row = await deviceRow(db, id);
    assert.equal(row.status, 'revoked');
    assert.equal(row.family_id, null);
    assert.equal(row.child_id, null);
    assert.equal(row.claimed_at, null);
  };
  const assertFactoryFresh = async (id: string) => {
    const row = await deviceRow(db, id);
    assert.equal(row.status, 'provisioned');
    assert.equal(row.family_id, null);
    assert.equal(row.child_id, null);
    assert.equal(row.claimed_at, null);
    assert.equal(row.disabled_by, null);
  };

  it('revokes a browser Buddy for good when it is unpaired', async () => {
    const a = await register(app);
    const kid = await addChild(app, a.access_token);
    const toy = await addWebToy(app, a.access_token, kid);
    const secret = (await call(app, 'POST', `/devices/${toy}/credential`, { token: a.access_token })).json().secret as string;

    const res = await call(app, 'POST', `/devices/${toy}/unpair`, { token: a.access_token });
    assert.equal(res.statusCode, 204);
    await assertRevoked(toy);
    assert.ok(blocked.includes(toy), 'its live socket is closed');
    const list = await call(app, 'GET', '/devices', { token: a.access_token });
    assert.ok(!list.json().data.some((d: { id: string }) => d.id === toy));
    assert.equal((await call(app, 'GET', `/devices/${toy}`, { token: a.access_token })).statusCode, 404);
    assert.equal((await call(app, 'POST', `/devices/${toy}/credential`, { token: a.access_token })).statusCode, 404);
    assert.equal((await call(app, 'POST', `/devices/${toy}/unpair`, { token: a.access_token })).statusCode, 404);

    // The secret a browser kept cannot bring it back.
    const reclaim = await call(app, 'POST', '/devices/claim', {
      token: a.access_token,
      body: { claim_token: makeClaimToken(fromB64url(secret), toy, nowSec()), child_id: kid },
    });
    assert.equal(reclaim.statusCode, 409);
    await assertRevoked(toy);
  });

  it('returns a physical toy to the factory when it is unpaired, so its printed code works again', async () => {
    const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
    const a = await register(app);
    const kid = await addChild(app, a.access_token);
    assert.equal((await claimByCode(app, a.access_token, box.claim_code, kid)).statusCode, 201);

    const res = await call(app, 'POST', `/devices/${box.device_id}/unpair`, { token: a.access_token });
    assert.equal(res.statusCode, 204);
    await assertFactoryFresh(box.device_id);
    assert.ok(blocked.includes(box.device_id));
    assert.equal((await call(app, 'GET', `/devices/${box.device_id}`, { token: a.access_token })).statusCode, 404);

    // Its next owner pairs it with the same code on the box.
    const next = await register(app);
    const nextKid = await addChild(app, next.access_token);
    const claimed = await claimByCode(app, next.access_token, box.claim_code, nextKid);
    assert.equal(claimed.statusCode, 201, claimed.body);
    assert.equal((await deviceRow(db, box.device_id)).family_id, next.family.id);
  });

  it("revokes a deleted child's browser Buddy and frees its physical toy, even a paused one", async () => {
    const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
    const a = await register(app);
    const webKid = await addChild(app, a.access_token, 'An');
    const boxKid = await addChild(app, a.access_token, 'Bình');
    const toy = await addWebToy(app, a.access_token, webKid);
    assert.equal((await claimByCode(app, a.access_token, box.claim_code, boxKid)).statusCode, 201);
    assert.equal((await call(app, 'POST', `/devices/${box.device_id}/pause`, { token: a.access_token })).statusCode, 200);

    assert.equal((await call(app, 'DELETE', `/children/${webKid}`, { token: a.access_token })).statusCode, 204);
    await assertRevoked(toy);
    assert.equal((await deviceRow(db, box.device_id)).family_id, a.family.id, "the other child's toy stays");

    assert.equal((await call(app, 'DELETE', `/children/${boxKid}`, { token: a.access_token })).statusCode, 204);
    await assertFactoryFresh(box.device_id);
    assert.ok(blocked.includes(toy) && blocked.includes(box.device_id));

    const other = await register(app);
    const otherKid = await addChild(app, other.access_token);
    assert.equal((await claimByCode(app, other.access_token, box.claim_code, otherKid)).statusCode, 201);
  });

  it("revokes a deleted family's browser Buddies and frees its physical toys", async () => {
    const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
    const a = await register(app);
    const webKid = await addChild(app, a.access_token, 'An');
    const boxKid = await addChild(app, a.access_token, 'Bình');
    const toy = await addWebToy(app, a.access_token, webKid);
    assert.equal((await claimByCode(app, a.access_token, box.claim_code, boxKid)).statusCode, 201);

    assert.equal((await call(app, 'DELETE', '/family', { token: a.access_token })).statusCode, 204);
    await assertRevoked(toy);
    await assertFactoryFresh(box.device_id);
    assert.ok(blocked.includes(toy) && blocked.includes(box.device_id));
    assert.equal((await db.query('SELECT 1 FROM family WHERE id = $1', [a.family.id])).rowCount, 0);

    const other = await register(app);
    const otherKid = await addChild(app, other.access_token);
    assert.equal((await claimByCode(app, other.access_token, box.claim_code, otherKid)).statusCode, 201);
  });

  it('leaves a toy staff disabled with its family when a parent tries to unpair it', async () => {
    const a = await register(app);
    const kid = await addChild(app, a.access_token);
    const toy = await addWebToy(app, a.access_token, kid);
    await db.query("UPDATE device SET status = 'disabled', disabled_by = 'staff' WHERE id = $1", [toy]);
    const res = await call(app, 'POST', `/devices/${toy}/unpair`, { token: a.access_token });
    assert.ok(res.statusCode >= 400, `an unpair that does nothing must not report success (got ${res.statusCode})`);
    const row = await deviceRow(db, toy);
    assert.equal(row.status, 'disabled');
    assert.equal(row.disabled_by, 'staff');
    assert.equal(row.family_id, a.family.id);
    assert.equal(row.child_id, kid);
  });
});

describe('recent answers for the activity page', () => {
  let db: Db;
  let app: FastifyInstance;
  let fam: Family;
  let other: Family;
  let token: string;
  let otherToken: string;
  let secondKid: string;
  const ids: Record<string, string> = {};
  const WORDS = ['my red kite flew away', 'a kite! Wowee', 'grandma made pho', 'pho is yummy'];

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    fam = await createFamily(db, config);
    other = await createFamily(db, config);
    token = signAccess(config.jwtSecret, { sub: fam.parentId, fam: fam.familyId }, 900);
    otherToken = signAccess(config.jwtSecret, { sub: other.parentId, fam: other.familyId }, 900);

    // A second child with a Buddy of its own in the same family.
    secondKid = (await db.query<{ id: string }>("INSERT INTO child (family_id, name) VALUES ($1, 'Bin') RETURNING id", [fam.familyId])).rows[0].id;
    const secondInstance = (await db.query<{ id: string }>(
      `INSERT INTO character_instance (child_id, character_id, pack_version_id, role, language_mode, energy, playfulness, curiosity, warmth, structure, met_on)
       SELECT $1, character_id, pack_version_id, 'friend', 'vi', 70, 70, 80, 80, 40, current_date FROM character_instance WHERE id = $2 RETURNING id`,
      [secondKid, fam.instanceId],
    )).rows[0].id;

    // Partitions on both sides of today (UTC), so a run near midnight still has a place for each turn.
    for (const days of [-1, 0, 1]) {
      await db.query('SELECT ensure_turn_partition($1::date)', [new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)]);
    }
    const session = async (childId: string, instanceId: string) =>
      (await db.query<{ id: string }>('INSERT INTO chat_session (child_id, instance_id) VALUES ($1, $2) RETURNING id', [childId, instanceId])).rows[0].id;
    const turn = async (sessionId: string, childId: string, minutesAgo: number, childText: string, replyText: string, turnType = 'answer') =>
      (await db.query<{ id: string }>(
        `INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language, created_at)
         VALUES ($1, $2, $3, $4, 'happy', $5, 'vi', now() - make_interval(mins => $6))
         RETURNING id`,
        [sessionId, childId, childText, replyText, turnType, minutesAgo],
      )).rows[0].id;

    const s1 = await session(fam.childId, fam.instanceId);
    const s2 = await session(secondKid, secondInstance);
    const s3 = await session(other.childId, other.instanceId);
    ids.oldest = await turn(s1, fam.childId, 40, 'hello Bo', 'Hi friend!', 'greet');
    ids.kite = await turn(s1, fam.childId, 30, WORDS[0], WORDS[1]);
    ids.newest1 = await turn(s1, fam.childId, 20, 'what is that', 'a cloud!');
    ids.second = await turn(s2, secondKid, 10, WORDS[2], WORDS[3]);
    ids.other = await turn(s3, other.childId, 5, 'secret of the other family', 'shh');
    // Only the kite answer was charged a credit.
    await db.query(
      "INSERT INTO credit_ledger (family_id, kind, delta, reason, child_id, turn_id) VALUES ($1, 'debit', -1, 'turn', $2, $3)",
      [fam.familyId, fam.childId, ids.kite],
    );
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const turns = async (query = '', who = token) => {
    const res = await call(app, 'GET', `/turns${query}`, { token: who });
    assert.equal(res.statusCode, 200, res.body);
    return res;
  };

  it("lists the family's answers newest first, with whether each cost a credit", async () => {
    const data = (await turns()).json().data as { id: string; child_id: string; created_at: string; face: string; turn_type: string; charged: boolean }[];
    assert.deepEqual(data.map((t) => t.id), [ids.second, ids.newest1, ids.kite, ids.oldest]);
    assert.deepEqual(data.map((t) => t.charged), [false, false, true, false]);
    assert.deepEqual(data.map((t) => t.child_id), [secondKid, fam.childId, fam.childId, fam.childId]);
    assert.ok(data.every((t) => t.created_at && t.face === 'happy'));
    assert.equal(data[3].turn_type, 'greet');
    // The debit is also in the wallet: the fixture family started with 100 credits.
    const wallet = await call(app, 'GET', '/wallet', { token });
    assert.equal(wallet.json().balance, 99);
    const [debit] = wallet.json().ledger as { kind: string; delta: number; turn_id: string; child_id: string }[];
    assert.deepEqual([debit.kind, debit.delta, debit.turn_id, debit.child_id], ['debit', -1, ids.kite, fam.childId]);
  });

  it('never carries the words', async () => {
    const res = await turns();
    for (const t of res.json().data as Record<string, unknown>[]) {
      assert.ok(!('child_text' in t), 'child_text');
      assert.ok(!('reply_text' in t), 'reply_text');
    }
    for (const words of [...WORDS, 'hello Bo', 'Hi friend!', 'what is that', 'a cloud!']) assert.ok(!res.body.includes(words), words);
  });

  it('filters by child', async () => {
    const first = (await turns(`?child_id=${fam.childId}`)).json().data as { id: string }[];
    assert.deepEqual(first.map((t) => t.id), [ids.newest1, ids.kite, ids.oldest]);
    const second = (await turns(`?child_id=${secondKid}`)).json().data as { id: string }[];
    assert.deepEqual(second.map((t) => t.id), [ids.second]);
  });

  it("does not show another family's answers", async () => {
    const theirs = (await turns('', otherToken)).json().data as { id: string }[];
    assert.deepEqual(theirs.map((t) => t.id), [ids.other]);
    const peek = (await turns(`?child_id=${other.childId}`)).json().data as unknown[];
    assert.deepEqual(peek, []);
    assert.ok(!(await turns()).body.includes('secret of the other family'));
  });

  it('takes a limit', async () => {
    const data = (await turns('?limit=2')).json().data as { id: string }[];
    assert.deepEqual(data.map((t) => t.id), [ids.second, ids.newest1]);
  });

  // Last, because it deletes the first child.
  it('keeps the credits a deleted child spent, and drops its answers', async () => {
    assert.equal((await call(app, 'DELETE', `/children/${fam.childId}`, { token })).statusCode, 204);
    // The ledger is append-only: forgetting a child must not hand its credits back.
    const wallet = await call(app, 'GET', '/wallet', { token });
    assert.equal(wallet.json().balance, 99);
    const debit = (wallet.json().ledger as { kind: string; turn_id: string; child_id: string | null }[]).find((l) => l.kind === 'debit');
    assert.ok(debit);
    assert.equal(debit.turn_id, ids.kite);
    assert.equal(debit.child_id, null);
    const data = (await turns()).json().data as { id: string }[];
    assert.deepEqual(data.map((t) => t.id), [ids.second]);
  });
});

describe('a sign-in that proves the address takes over an account that only typed it', () => {
  let db: Db;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    // Google and Apple only hand over an email they have verified, so the stand-in does too.
    const oidc = {
      verify: async (_provider: string, idToken: string) => ({ subject: `google-${idToken}`, email: `${idToken}@example.com` }),
    } as unknown as OidcVerifier;
    app = apiFor(db, config, { oidc });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const strangerLogin = (email: string) => call(app, 'POST', '/auth/login', { body: { email, password: 'stranger-pass' } });

  it('keeps a password sign-up apart and unverified', async () => {
    const acct = await register(app, { email: 'apart@example.com', password: 'stranger-pass' });
    const row = (await db.query<{ auth_provider: string; email_verified_at: Date | null }>('SELECT auth_provider, email_verified_at FROM parent_user WHERE id = $1', [acct.parent.id])).rows[0];
    assert.deepEqual(row, { auth_provider: 'password', email_verified_at: null });
  });

  it('an emailed code ends the stranger\'s password and sessions', async () => {
    const stranger = await register(app, { email: 'owner@example.com', password: 'stranger-pass' });
    assert.equal((await strangerLogin('owner@example.com')).statusCode, 200, 'the stranger could sign in until now');
    const owner = await emailSignIn(app, 'owner@example.com');
    const me = await call(app, 'GET', '/me', { token: owner.access_token });
    assert.equal(me.json().parent.id, stranger.parent.id, 'the account now belongs to whoever proved the address');
    const login = await strangerLogin('owner@example.com');
    assert.equal(login.statusCode, 401);
    assert.equal(problem(login), 'invalid-credentials');
    const refresh = await call(app, 'POST', '/auth/refresh', { body: { refresh_token: stranger.refresh_token } });
    assert.equal(refresh.statusCode, 401, 'the stranger\'s refresh token died with the takeover');
    const row = (await db.query<{ password_hash: string | null; email_verified_at: Date | null }>('SELECT password_hash, email_verified_at FROM parent_user WHERE id = $1', [stranger.parent.id])).rows[0];
    assert.equal(row.password_hash, null);
    assert.ok(row.email_verified_at);
  });

  it('Google or Apple does the same', async () => {
    const stranger = await register(app, { email: 'owner2@example.com', password: 'stranger-pass' });
    const res = await call(app, 'POST', '/auth/oidc', { body: { provider: 'google', id_token: 'owner2' } });
    assert.equal(res.statusCode, 200, res.body);
    const me = await call(app, 'GET', '/me', { token: res.json().access_token });
    assert.equal(me.json().parent.id, stranger.parent.id);
    assert.equal((await strangerLogin('owner2@example.com')).statusCode, 401);
    assert.equal((await call(app, 'POST', '/auth/refresh', { body: { refresh_token: stranger.refresh_token } })).statusCode, 401);
  });

  it('joins an account whose address was already proved, revoking nothing', async () => {
    const first = await emailSignIn(app, 'proved@example.com');
    const res = await call(app, 'POST', '/auth/oidc', { body: { provider: 'google', id_token: 'proved' } });
    assert.equal(res.statusCode, 200, res.body);
    const again = await call(app, 'POST', '/auth/refresh', { body: { refresh_token: first.refresh_token } });
    assert.equal(again.statusCode, 200, 'the earlier session goes on');
  });
});

describe('claiming cannot be used to probe codes', () => {
  let db: Db;
  let app: FastifyInstance;
  let box: ManifestEntry;
  let taken: ManifestEntry;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
    [box, taken] = await provisionDevices(db, config.deviceKek, { count: 2, hardwareRev: 'test' });
    // Someone else's toy, so its code is a real, used one.
    const other = await register(app);
    assert.equal((await claimByCode(app, other.access_token, taken.claim_code, await addChild(app, other.access_token))).statusCode, 201);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it("answers a child that is not the caller's the same, whatever the code", async () => {
    const a = await register(app);
    const strangerChild = await addChild(app, (await register(app)).access_token);
    const answers = [];
    for (const code of [box.claim_code, taken.claim_code, 'ZZZZ-ZZZZ']) answers.push(await claimByCode(app, a.access_token, code, strangerChild));
    for (const res of answers) {
      assert.equal(res.statusCode, 404);
      assert.equal(problem(res), 'not-found');
      assert.deepEqual(res.json(), answers[0].json());
    }
    assert.equal((await deviceRow(db, box.device_id)).status, 'provisioned');
  });

  it('answers a child that already has an awake toy the same, whatever the code', async () => {
    const a = await register(app);
    const busy = await addChild(app, a.access_token);
    await addWebToy(app, a.access_token, busy);
    const answers = [];
    for (const code of [box.claim_code, taken.claim_code, 'ZZZZ-ZZZZ']) answers.push(await claimByCode(app, a.access_token, code, busy));
    for (const res of answers) {
      assert.equal(res.statusCode, 409);
      assert.equal(problem(res), 'child-has-toy');
      assert.deepEqual(res.json(), answers[0].json());
    }
  });

  it('tells a family that a toy it sends for another child, or asleep, is already theirs', async () => {
    const a = await register(app);
    const first = await addChild(app, a.access_token);
    const second = await addChild(app, a.access_token, 'Bin');
    assert.equal((await claimByCode(app, a.access_token, box.claim_code, first)).statusCode, 201);
    const moved = await claimByCode(app, a.access_token, box.claim_code, second);
    assert.equal(moved.statusCode, 409);
    assert.equal(problem(moved), 'toy-in-family');
    assert.equal((await call(app, 'POST', `/devices/${box.device_id}/pause`, { token: a.access_token })).statusCode, 200);
    const asleep = await claimByCode(app, a.access_token, box.claim_code, first);
    assert.equal(asleep.statusCode, 409);
    assert.equal(problem(asleep), 'toy-in-family');
    assert.equal((await deviceRow(db, box.device_id)).child_id, first, 'nothing moved');
  });

  it('gives each parent ten pairing attempts an hour, shared with new browser Buddies', async () => {
    const a = await register(app);
    const kid = await addChild(app, a.access_token);
    for (let i = 0; i < 9; i += 1) assert.equal((await claimByCode(app, a.access_token, 'ZZZZ-ZZZZ', kid)).statusCode, 404, `attempt ${i + 1}`);
    assert.equal((await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kid } })).statusCode, 201, 'the tenth');
    const eleventh = await claimByCode(app, a.access_token, 'ZZZZ-ZZZZ', kid);
    assert.equal(eleventh.statusCode, 429);
    assert.equal(problem(eleventh), 'rate-limited');
    const other = await register(app);
    assert.equal((await claimByCode(app, other.access_token, 'ZZZZ-ZZZZ', await addChild(app, other.access_token))).statusCode, 404, 'another parent has a budget of their own');
  });
});

describe('browser Buddies made and removed in a loop', () => {
  let db: Db;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('counts the removed ones toward ten a day per family', async () => {
    const a = await register(app);
    const kid = await addChild(app, a.access_token);
    // Ten made earlier today and already removed, as a loop would leave them.
    for (let i = 0; i < 10; i += 1) {
      const id = (await db.query<{ id: string }>("INSERT INTO device (serial, hardware_rev, status) VALUES ($1, 'web', 'revoked') RETURNING id", [`WEB-LOOP-${i}`])).rows[0].id;
      await db.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'provisioned', $2)", [id, `parent:${a.parent.id}`]);
    }
    const res = await call(app, 'POST', '/devices/web', { token: a.access_token, body: { child_id: kid } });
    assert.equal(res.statusCode, 429, res.body);
    assert.equal(problem(res), 'rate-limited');
    const none = await db.query("SELECT 1 FROM device WHERE child_id = $1", [kid]);
    assert.equal(none.rowCount, 0);
  });
});

describe('sign-in limits', () => {
  let db: Db;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = apiFor(db);
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('lets one address make five accounts an hour, and still sign in', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i += 1) {
      const res = await call(app, 'POST', '/auth/register', { ip, body: { email: `burst${i}@example.com`, password: 'correct horse', family_name: 'Burst' } });
      assert.equal(res.statusCode, 201, res.body);
    }
    const sixth = await call(app, 'POST', '/auth/register', { ip, body: { email: 'burst5@example.com', password: 'correct horse', family_name: 'Burst' } });
    assert.equal(sixth.statusCode, 429);
    const login = await call(app, 'POST', '/auth/login', { ip, body: { email: 'burst0@example.com', password: 'correct horse' } });
    assert.equal(login.statusCode, 200, 'signing in has a budget of its own');
  });

  it('does not count token refreshes against sign-in attempts', async () => {
    const ip = '203.0.113.8';
    let refresh = (await call(app, 'POST', '/auth/register', { ip, body: { email: 'tabs@example.com', password: 'correct horse', family_name: 'Tabs' } })).json().refresh_token;
    // Many open tabs refresh every quarter of an hour; that is not guessing.
    for (let i = 0; i < 25; i += 1) {
      const res = await call(app, 'POST', '/auth/refresh', { ip, body: { refresh_token: refresh } });
      assert.equal(res.statusCode, 200, `refresh ${i + 1}`);
      refresh = res.json().refresh_token;
    }
    const login = await call(app, 'POST', '/auth/login', { ip, body: { email: 'tabs@example.com', password: 'correct horse' } });
    assert.equal(login.statusCode, 200);
  });
});
