// Verifies Apple and Google ID tokens (RS256) against the providers' published
// keys, with node:crypto only. Keys are cached for an hour and refetched once
// when a token names a key id we have not seen.

import { createPublicKey, verify } from 'node:crypto';

import type { Config } from '../config.ts';
import { fromB64url } from '../util/crypto.ts';

export type Provider = 'google' | 'apple';

const PROVIDERS: Record<Provider, { jwks: string; issuers: string[] }> = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
};

export class OidcError extends Error {}

type Jwk = { kid?: string; kty?: string; [field: string]: unknown };

export function createOidcVerifier(cfg: Config['auth'], fetchImpl: typeof fetch = fetch, now: () => number = () => Math.floor(Date.now() / 1000)) {
  const cache = new Map<Provider, { at: number; keys: Jwk[] }>();

  async function keys(provider: Provider, force: boolean): Promise<Jwk[]> {
    const hit = cache.get(provider);
    if (hit && !force && now() - hit.at < 3600) return hit.keys;
    const res = await fetchImpl(PROVIDERS[provider].jwks);
    if (!res.ok) throw new OidcError(`could not fetch ${provider} keys`);
    const body = (await res.json()) as { keys: Jwk[] };
    cache.set(provider, { at: now(), keys: body.keys ?? [] });
    return body.keys ?? [];
  }

  return {
    async verify(provider: Provider, idToken: string): Promise<{ subject: string; email: string | null }> {
      const audiences = provider === 'google' ? cfg.googleClientIds : cfg.appleClientIds;
      if (!audiences.length) throw new OidcError(`${provider} sign-in is not configured`);
      const [h, p, s] = idToken.split('.');
      if (!h || !p || !s) throw new OidcError('malformed token');
      const header = JSON.parse(fromB64url(h).toString('utf8')) as { kid?: string; alg?: string };
      if (header.alg !== 'RS256') throw new OidcError('unexpected algorithm');
      let jwk = (await keys(provider, false)).find((k) => k.kid === header.kid);
      if (!jwk) jwk = (await keys(provider, true)).find((k) => k.kid === header.kid);
      if (!jwk) throw new OidcError('unknown signing key');
      const ok = verify('sha256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' } as unknown as Parameters<typeof createPublicKey>[0]), fromB64url(s));
      if (!ok) throw new OidcError('bad signature');
      const claims = JSON.parse(fromB64url(p).toString('utf8')) as {
        iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; email_verified?: boolean | string;
      };
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!claims.iss || !PROVIDERS[provider].issuers.includes(claims.iss)) throw new OidcError('wrong issuer');
      if (!aud.some((a) => a && audiences.includes(a))) throw new OidcError('wrong audience');
      if (!claims.exp || claims.exp < now()) throw new OidcError('token expired');
      if (!claims.sub) throw new OidcError('no subject');
      const verified = claims.email_verified === true || claims.email_verified === 'true';
      return { subject: claims.sub, email: claims.email && verified ? claims.email.toLowerCase() : null };
    },
  };
}

export type OidcVerifier = ReturnType<typeof createOidcVerifier>;
