let counter = 0;

export const PASSWORD = 'correct horse battery';

// Unique email per call so tests never collide on the UNIQUE constraint.
export async function registerParent(api, overrides = {}) {
  counter += 1;
  const body = {
    email: `parent${counter}-${Date.now()}@test.local`,
    password: PASSWORD,
    family_name: 'Test Family',
    ...overrides,
  };
  const res = await api('POST', '/api/auth/register', { body });
  if (res.status !== 201) throw new Error(`registerParent failed: ${res.status} ${res.text}`);
  return {
    ...res.body,
    email: body.email,
    password: body.password,
    token: res.body.access_token,
    parentId: res.body.parent.id,
    familyId: res.body.family.id,
  };
}

// Provisions one device straight through the registry (no HTTP, as the
// factory CLI does) and returns what the manifest would carry.
export async function provisionDevice(overrides = {}) {
  counter += 1;
  const label = overrides.label ?? `T${String(counter).padStart(3, '0')}${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { provisionBatch } = await import('../../devices/registry.js');
  const { batch, devices } = await provisionBatch({ label, hardwareRev: overrides.hardwareRev ?? 'r1', count: overrides.count ?? 1 });
  const d = devices[0];
  return {
    batch,
    all: devices,
    id: d.device_id,
    serial: d.serial,
    secretHex: d.secret_hex,
    secret: Buffer.from(d.secret_hex, 'hex'),
    claimCode: d.claim_code,
  };
}

export async function claimDevice(api, token, claimCode, childId) {
  const body = childId ? { claim_code: claimCode, child_id: childId } : { claim_code: claimCode };
  const res = await api('POST', '/api/devices/claim', { token, body });
  if (res.status !== 200) throw new Error(`claimDevice failed: ${res.status} ${res.text}`);
  return res.body.device;
}

export const adminHeaders = { authorization: `Bearer ${process.env.ADMIN_TOKEN}` };

export async function createChild(api, token, overrides = {}) {
  const res = await api('POST', '/api/children', { token, body: { name: 'Bông', birth_year: 2020, ...overrides } });
  if (res.status !== 201) throw new Error(`createChild failed: ${res.status} ${res.text}`);
  return res.body.child;
}
