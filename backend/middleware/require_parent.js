import { verifyAccessToken } from '../auth/tokens.js';
import { unauthorized } from '../lib/http_error.js';

// Sets req.parent = { id, familyId } from the bearer JWT. No database hit per
// request: the family id rides in the token, and a removed parent keeps
// access for at most one access-token lifetime.
export async function requireParent(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length) {
    return next(unauthorized('unauthorized', 'missing bearer token'));
  }
  try {
    const { parentId, familyId } = await verifyAccessToken(token);
    req.parent = { id: parentId, familyId };
    req.familyId = familyId;
    next();
  } catch (err) {
    next(err);
  }
}
