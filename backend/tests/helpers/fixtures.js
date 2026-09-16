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
