import { Router, json } from 'express';
import * as auth from '../auth/service.js';
import { requireParent } from '../middleware/require_parent.js';
import { rateLimit, emailKey } from '../middleware/rate_limit.js';
import { validateBody } from '../lib/validate.js';
import { pool } from '../store/db.js';
import * as children from '../store/child.js';

// Everything the parent web app calls, mounted at /api. Never mixed with the
// device API: a device secret must not be able to reach any of these.
export const dashboardRouter = Router();

dashboardRouter.use(json({ limit: '64kb' }));

const registerLimit = rateLimit({ name: 'register', limit: 5, windowSec: 3600, key: (req) => req.ip });
const loginLimit = rateLimit({
  name: 'login',
  limit: 10,
  windowSec: 900,
  key: (req) => `${req.ip}:${emailKey(req.body?.email)}`,
});

dashboardRouter.post('/auth/register', registerLimit, async (req, res) => {
  const body = validateBody(req.body, {
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 8, max: 128, trim: false },
    family_name: { type: 'string', required: true, min: 1, max: 80 },
    display_name: { type: 'string', max: 80 },
  });
  const result = await auth.register({
    email: body.email,
    password: body.password,
    familyName: body.family_name,
    displayName: body.display_name ?? null,
  });
  res.status(201).json(result);
});

dashboardRouter.post('/auth/login', loginLimit, async (req, res) => {
  const body = validateBody(req.body, {
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 1, max: 128, trim: false },
  });
  res.json(await auth.login(body));
});

dashboardRouter.post('/auth/refresh', async (req, res) => {
  const body = validateBody(req.body, { refresh_token: { type: 'string', required: true, min: 1, max: 512 } });
  res.json(await auth.refresh(body.refresh_token));
});

dashboardRouter.post('/auth/logout', async (req, res) => {
  const body = validateBody(req.body, { refresh_token: { type: 'string', required: true, min: 1, max: 512 } });
  await auth.logout(body.refresh_token);
  res.status(204).end();
});

dashboardRouter.get('/me', requireParent, async (req, res) => {
  res.json(await auth.me(req.parent.id));
});

dashboardRouter.post('/children', requireParent, async (req, res) => {
  const body = validateBody(req.body, {
    name: { type: 'string', required: true, min: 1, max: 40 },
    birth_year: { type: 'int', required: true, min: 2000, max: 2100 },
  });
  const child = await children.insert(pool, { familyId: req.familyId, name: body.name, birthYear: body.birth_year });
  res.status(201).json({ child: children.toDto(child) });
});

dashboardRouter.get('/children', requireParent, async (req, res) => {
  const rows = await children.listByFamily(pool, req.familyId);
  res.json({ children: rows.map(children.toDto) });
});
