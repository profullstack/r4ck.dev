import { createHash, randomBytes } from 'node:crypto';
import { config } from '@r4ck/config';
import * as q from '@r4ck/db/accounts';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { validateApiKey } from './api-keys.js';

/**
 * Magic link + passkey, no password. A key is the third credential, for
 * scripts, the CLI and MCP clients; it is minted from inside a session and
 * shown once.
 */
const TOKEN_TTL_MINUTES = 20;
export const rpID = new URL(config.siteUrl).hostname;
export const rpName = config.siteName;
export const expectedOrigins = (() => {
  const site = new URL(config.siteUrl);
  const origins = new Set([site.origin]);
  if (site.hostname.startsWith('www.')) origins.add(`${site.protocol}//${site.hostname.slice(4)}`);
  else origins.add(`${site.protocol}//www.${site.hostname}`);
  for (const extra of (process.env.EXTRA_WEBAUTHN_ORIGINS ?? '').split(',')) {
    const t = extra.trim();
    if (t) origins.add(t.replace(/\/$/, ''));
  }
  return [...origins];
})();

const hashToken = (t) => createHash('sha256').update(t).digest();

export async function createLoginLink(email, { next } = {}) {
  const token = randomBytes(32).toString('base64url');
  await q.insertLoginToken({
    tokenHash: hashToken(token),
    email: email.trim().toLowerCase(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
  });
  const url = new URL('/auth/magic', config.siteUrl);
  url.searchParams.set('t', token);
  if (next?.startsWith('/')) url.searchParams.set('next', next);
  return url.toString();
}

/** Also the registration path: an unknown address gets an account here. */
export async function consumeLoginLink(token, { userAgent } = {}) {
  const email = await q.consumeLoginToken(hashToken(token));
  if (!email) return null;
  const user = await q.findOrCreateUser(email, {
    admin: config.adminEmails.includes(String(email).toLowerCase()),
  });
  const sessionId = await q.startSession({
    userId: user.id,
    ttlDays: config.session.ttlDays,
    userAgent,
  });
  return { user, sessionId };
}

export async function passkeyRegistrationOptions(user) {
  const existing = await q.listPasskeys(user.id);
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userID: Buffer.from(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
}

export async function verifyPasskeyRegistration({ user, response, expectedChallenge }) {
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: rpID,
  });
  if (!v.verified || !v.registrationInfo) return false;
  const { credential } = v.registrationInfo;
  await q.insertPasskey({
    credentialId: credential.id,
    userId: user.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: response.response?.transports ?? [],
  });
  return true;
}

export const passkeyAuthenticationOptions = () =>
  generateAuthenticationOptions({ rpID, userVerification: 'preferred' });

export async function verifyPasskeyAuthentication({ response, expectedChallenge, userAgent }) {
  const stored = await q.getPasskey(response.id);
  if (!stored) return null;
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: rpID,
    credential: {
      id: stored.credential_id,
      publicKey: new Uint8Array(stored.public_key),
      counter: Number(stored.counter),
      transports: stored.transports,
    },
  });
  if (!v.verified) return null;
  await q.touchPasskey(stored.credential_id, v.authenticationInfo.newCounter);
  const sessionId = await q.startSession({
    userId: stored.user_id,
    ttlDays: config.session.ttlDays,
    userAgent,
  });
  return { userId: stored.user_id, sessionId };
}

export const userFromRequest = (cookieValue) =>
  cookieValue ? q.getSessionUser(cookieValue) : null;

export function sessionCookie(sessionId, { clear = false } = {}) {
  const parts = [
    `${config.session.cookie}=${clear ? '' : sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${config.session.ttlDays * 86400}`,
  ];
  if (config.isProd) parts.push('Secure');
  return parts.join('; ');
}

export { createApiKey, KEY_PREFIX, listApiKeys, revokeApiKey, validateApiKey } from './api-keys.js';

export async function userFromApiKey(key) {
  const info = await validateApiKey(key);
  if (!info) return null;
  const user = await q.getUserById(info.userId);
  return user ? { ...user, api_key_id: info.id } : null;
}
