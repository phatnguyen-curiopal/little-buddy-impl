import { Router, json } from 'express';
import config from '../config.js';
import * as registry from '../devices/registry.js';
import { nowSec } from '../devices/hmac_auth.js';
import { deviceAuth, captureRawBody } from '../middleware/device_auth.js';
import { rateLimit } from '../middleware/rate_limit.js';
import { validateBody } from '../lib/validate.js';

// What the toy calls, mounted at /v1. HMAC-signed except /v1/time, which a
// device with no clock needs before it can sign anything.
export const deviceRouter = Router();

const timeLimit = rateLimit({ name: 'devtime', limit: 60, windowSec: 60, key: (req) => req.ip });

deviceRouter.get('/time', timeLimit, (req, res) => {
  res.json({ server_time: nowSec() });
});

// Any content type is parsed as JSON so a minimal firmware HTTP client that
// forgets the header still works. The verify hook keeps the raw bytes for
// the signature check.
deviceRouter.use(json({ limit: '4kb', verify: captureRawBody, type: () => true }));

deviceRouter.post('/heartbeat', deviceAuth, async (req, res) => {
  const body = validateBody(req.body, {
    firmware_version: { type: 'string', max: 32 },
    uptime_s: { type: 'int', min: 0, max: 2_147_483_647 },
  });
  await registry.heartbeat({ deviceId: req.device.id, firmwareVersion: body.firmware_version ?? null });
  // An unclaimed toy polls fast so pairing shows up on its screen within
  // seconds; a claimed one relaxes.
  const unclaimed = req.device.status === registry.STATUS.PROVISIONED;
  res.json({
    status: req.device.status,
    server_time: nowSec(),
    heartbeat_interval_s: unclaimed ? config.deviceHeartbeatUnclaimedSec : config.deviceHeartbeatSec,
  });
});
