import { badRequest } from './http_error.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Three request shapes do not justify a schema library. A spec is
// { field: { type, required, nullable, min, max, values, trim } } with type in
// string | int | uuid | email | enum. Returns the cleaned object or throws a
// 400 listing every failing field, so a client can fix them all at once.
export function validateBody(body, spec) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const out = {};

  for (const [field, rule] of Object.entries(spec)) {
    let value = src[field];

    if (value === undefined || value === null) {
      if (value === null && rule.nullable) out[field] = null;
      else if (rule.required) errors.push({ field, message: 'required' });
      continue;
    }

    switch (rule.type) {
      case 'string':
      case 'email': {
        if (typeof value !== 'string') {
          errors.push({ field, message: 'must be a string' });
          continue;
        }
        // Passwords keep their whitespace; everything else is trimmed.
        if (rule.trim !== false) value = value.trim();
        if (rule.type === 'email') {
          value = normalizeEmail(value);
          if (!EMAIL_RE.test(value) || value.length > 254) {
            errors.push({ field, message: 'must be a valid email' });
            continue;
          }
        }
        if (rule.min !== undefined && value.length < rule.min) {
          errors.push({ field, message: `must be at least ${rule.min} characters` });
          continue;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors.push({ field, message: `must be at most ${rule.max} characters` });
          continue;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push({ field, message: 'has an invalid format' });
          continue;
        }
        break;
      }
      case 'int': {
        if (!Number.isInteger(value)) {
          errors.push({ field, message: 'must be an integer' });
          continue;
        }
        if ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max)) {
          errors.push({ field, message: `must be between ${rule.min} and ${rule.max}` });
          continue;
        }
        break;
      }
      case 'uuid': {
        if (!isUuid(value)) {
          errors.push({ field, message: 'must be a uuid' });
          continue;
        }
        value = value.toLowerCase();
        break;
      }
      case 'enum': {
        if (!rule.values.includes(value)) {
          errors.push({ field, message: `must be one of ${rule.values.join(', ')}` });
          continue;
        }
        break;
      }
      default:
        throw new Error(`validateBody: unknown rule type ${rule.type}`);
    }
    out[field] = value;
  }

  if (errors.length) {
    throw badRequest('validation_error', 'invalid request body', { details: errors });
  }
  return out;
}
