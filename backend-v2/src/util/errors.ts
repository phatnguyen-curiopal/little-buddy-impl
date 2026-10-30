// Errors that map onto RFC 9457 problem details in the Parent API.

export interface FieldError {
  field: string;
  code: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldError[] | undefined;
  // Seconds, sent as Retry-After on a 429.
  readonly retryAfter: number | undefined;

  constructor(status: number, code: string, message: string, errors?: FieldError[], retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }
}

export const notFound = (what = 'resource') => new HttpError(404, 'not-found', `This ${what} does not exist`);
export const badRequest = (message: string, errors?: FieldError[]) => new HttpError(400, 'invalid-request', message, errors);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const unauthorized = (message = 'Sign in again') => new HttpError(401, 'unauthorized', message);
// The budgets refill at very different speeds (a minute for most calls, an
// hour for sign-ups, a day for browser Buddies), so the wait goes with the
// refusal and the site can say how long.
export const tooMany = (message: string, retryAfter: number) =>
  new HttpError(429, 'rate-limited', message, undefined, Math.max(1, Math.ceil(retryAfter)));
export const staleWrite = () =>
  new HttpError(412, 'stale-write', 'This item changed since you loaded it. Reload it and try again.');

// Upstream (OpenAI, ElevenLabs) failures, kept apart from HTTP errors so the
// voice service can pick a spoken fallback by kind.
export type GatewayErrorKind = 'aborted' | 'timeout' | 'upstream' | 'invalid';

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly status: number | undefined;

  constructor(kind: GatewayErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
