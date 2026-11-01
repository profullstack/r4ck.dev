import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  authorizeUrl,
  pkce,
  randomToken,
  SIGN_IN_SCOPES,
} from '@profullstack/coinpay-onboard/oauth';
import { config } from '@r4ck/config';

export const COINPAY_STATE_COOKIE = 'r4ck_coinpay_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function mac(payload) {
  return createHmac('sha256', `r4ck-coinpay-state:${config.coinpayOAuth.clientSecret}`)
    .update(payload)
    .digest('base64url');
}

export function beginCoinpayLink(userId) {
  const { verifier, challenge } = pkce();
  const pending = {
    state: randomToken(),
    nonce: randomToken(),
    verifier,
    userId: String(userId),
    exp: Date.now() + STATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return {
    url: authorizeUrl({
      clientId: config.coinpayOAuth.clientId,
      redirectUri: config.coinpayOAuth.redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      challenge,
      scopes: SIGN_IN_SCOPES,
    }),
    cookie: `${payload}.${mac(payload)}`,
  };
}

export function readCoinpayLink(value) {
  if (!value || value.length > 4000) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const pending = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof pending.state !== 'string' ||
      typeof pending.nonce !== 'string' ||
      typeof pending.verifier !== 'string' ||
      typeof pending.userId !== 'string' ||
      typeof pending.exp !== 'number' ||
      pending.exp < Date.now()
    )
      return null;
    return pending;
  } catch {
    return null;
  }
}

export function sameCoinpayState(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function coinpayStateCookieOptions(maxAge = 600) {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.siteUrl.startsWith('https:'),
    path: '/auth/coinpay',
    maxAge,
  };
}
