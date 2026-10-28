/**
 * Credit codes and invites: @profullstack/redeem-credits and
 * @profullstack/affiliates over r4ck's own Postgres.
 *
 * r4ck sells one thing, the x402 pass ($1 a day, unmetered API). Neither
 * package keeps a second entitlement: a redeemed code and an invite bonus both
 * end in `grantPassDays`, a crawl_sales row (the table every sold pass lands
 * in) at $0, owned by the account, with a ref that makes the grant idempotent.
 * While it runs, `accessFor` serves the account as a pass on every door
 * (session, API key, CLI, MCP), and the settings page hands out the same
 * signed bearer token a paid pass is.
 *
 * - A code grants `pass_days` (minted by an admin on /settings, the API or
 *   scripts/credit-codes.js). One-off only.
 * - An invite is scarce (config.invites.quota per account, single use, from an
 *   account at least inviterMinAgeDays old). When the invited person's account
 *   is CREATED by spending the emailed link (which proves the mailbox), both
 *   get config.invites.bonusDays, unless a spam check withholds it.
 * - Affiliate links (/?ref=<code>) record first-touch attribution of new
 *   accounts. r4ck had no referral programme before, so nothing is counted twice.
 */
import { createHash } from 'node:crypto';
import {
  Affiliates,
  postgresStore as affiliatesStore,
  hashCode as inviteHash,
  normalizeCode as normalizeInvite,
} from '@profullstack/affiliates';
import { Credits, postgresStore as creditsStore } from '@profullstack/redeem-credits';
import { config } from '@r4ck/config';
import { sql } from '@r4ck/db';
import * as accounts from '@r4ck/db/accounts';
import { accountPassToken } from './gate.js';
import { emit } from './webhooks.js';

export const UNIT = 'pass_days';
const DAY_MS = 86_400_000;

/** Bun's SQL client in the `query(text, params) -> { rows }` shape both stores take. */
export const pgPool = (db = sql) => ({
  query: async (text, params = []) => ({ rows: await db.unsafe(text, params) }),
});

/** Days of the pass, through the same table a sold pass is written to. */
export async function grantPass({ userId, days, ref, source }) {
  const row = await accounts.grantPassDays({
    userId,
    days,
    ref: `grant:${ref}:${userId}`,
    source,
    passMinutes: config.x402.passMinutes,
  });
  // null = this ref was granted before (idempotent), so nothing new to tell.
  if (row)
    await emit(
      userId,
      'pass.granted',
      {
        days: Number(row.days),
        source: row.source,
        until: (await accounts.accountPassUntil(userId))?.toISOString() ?? null,
      },
      { subject: `account:${userId}` },
    );
  return row;
}

/** The account's pass: when it runs out and the bearer token for it. */
export async function passFor(user) {
  const until = await accounts.accountPassUntil(user.id);
  return {
    until: until?.toISOString() ?? null,
    token: until ? await accountPassToken(user.id, until) : null,
    header: 'x-crawl-pass',
  };
}

/* ------------------------------------------------------------ spam rules -- */

// Throwaway inboxes: the cheap way to farm a bonus. Not exhaustive; it only has
// to make farming cost more than a week of pass is worth.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'anonaddy.me',
  'burnermail.io',
  'dispostable.com',
  'dropmail.me',
  'emailnator.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamailblock.com',
  'inboxkitten.com',
  'mail.tm',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailpoof.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'nada.email',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmail.dev',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'tmpmail.org',
  'trashmail.com',
  'trashmail.de',
  'yopmail.com',
  'yopmail.net',
]);

export const emailDomain = (email) =>
  String(email ?? '')
    .slice(String(email ?? '').lastIndexOf('@') + 1)
    .trim()
    .toLowerCase();

export function isDisposableEmail(email) {
  const domain = emailDomain(email);
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const d of DISPOSABLE_DOMAINS) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

/** The mailbox an address lands in: plus tags dropped, Gmail dots ignored. */
export function canonicalMailbox(email) {
  const e = String(email ?? '');
  const at = e.lastIndexOf('@');
  if (at < 1) return e.trim().toLowerCase();
  let local = e.slice(0, at).trim().toLowerCase();
  let domain = emailDomain(e);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/** A salted hash of an address: enough to say "same network", never the address. */
export function ipHash(ip) {
  if (!ip || ip === '0.0.0.0') return null;
  const salt = config.x402.coinpayKey || 'r4ck-invites';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

const ageDays = (at, now = Date.now()) => {
  const t = at ? new Date(at).getTime() : Number.NaN;
  return Number.isFinite(t) ? (now - t) / DAY_MS : 0;
};

/** Whether an account may hand out invites yet. */
export function canSendInvites(user, now = Date.now()) {
  const min = config.invites.inviterMinAgeDays;
  if (user?.role === 'admin' || ageDays(user?.created_at, now) >= min) return { ok: true };
  return {
    ok: false,
    reason: `Invites open up once your account is ${min} days old.`,
  };
}

/**
 * Whether paying the bonus for an accepted invite is safe. The new account has
 * already proved its inbox (the emailed link); this catches the cheap farms.
 */
export function bonusVerdict({
  inviterEmail,
  inviteeEmail,
  inviterIpHash,
  inviteeIpHash,
  inviterBonuses30d,
}) {
  if (canonicalMailbox(inviterEmail) === canonicalMailbox(inviteeEmail))
    return { ok: false, reason: 'same mailbox' };
  if (isDisposableEmail(inviteeEmail)) return { ok: false, reason: 'disposable email' };
  if (inviterIpHash && inviteeIpHash && inviterIpHash === inviteeIpHash)
    return { ok: false, reason: 'same network as the inviter' };
  if (inviterBonuses30d >= config.invites.monthlyCap)
    return { ok: false, reason: 'inviter monthly cap reached' };
  return { ok: true };
}

/* -------------------------------------------------------------- services -- */

/**
 * The two services, built once per process and lazily (nothing touches the
 * database at import time). Tests pass their own through `makeCredits`.
 */
export function makeCredits({
  creditStore,
  affiliateStore,
  grant = grantPass,
  now,
  quota = config.invites.quota,
  bonusDays = config.invites.bonusDays,
  ttlDays = config.invites.ttlDays,
} = {}) {
  const credits = new Credits(creditStore, {
    ...(now ? { now } : {}),
    onGrant: async (userId, g, source) => {
      if (g.unit !== UNIT) throw new Error(`r4ck grants ${UNIT}, not ${g.unit}`);
      await grant({ userId, days: g.amount, ref: source, source: 'code' });
    },
  });
  const aff = new Affiliates(affiliateStore, {
    ...(now ? { now } : {}),
    defaultQuota: quota,
    inviteTtlMs: ttlDays > 0 ? ttlDays * DAY_MS : null,
  });
  return { credits, aff, grant, bonusDays };
}

let shared = null;
export function services() {
  shared ??= makeCredits({
    creditStore: creditsStore(pgPool()),
    affiliateStore: affiliatesStore(pgPool()),
  });
  return shared;
}

/* ---------------------------------------------------------- credit codes -- */

export const REDEEM_ERRORS = {
  invalid: 'That code is not one we issued. Check it and try again.',
  expired: 'That code has expired.',
  used_up: 'That code has already been used.',
  already_redeemed: 'You have already redeemed that code.',
  revoked: 'That code was withdrawn.',
};

const intIn = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
const bad = (message) => Object.assign(new Error(message), { status: 400 });

/** Admin: make a code worth `days` of pass. The plaintext is returned once. */
export async function mintPassCode(
  { days, label = '', maxRedemptions = 1, expiresInDays = null, createdBy = null },
  svc = services(),
) {
  const d = intIn(days, 1, 3650);
  if (!d) throw bad('days must be a whole number from 1 to 3650');
  const max = intIn(maxRedemptions ?? 1, 1, 100_000);
  if (!max) throw bad('max must be from 1 to 100000');
  let expiresAt = null;
  if (expiresInDays !== null && expiresInDays !== undefined && expiresInDays !== '') {
    const e = intIn(expiresInDays, 1, 3650);
    if (!e) throw bad('expires must be 1 to 3650 days');
    expiresAt = Date.now() + e * DAY_MS;
  }
  const minted = await svc.credits.mint({
    grant: { unit: UNIT, amount: d },
    label: String(label ?? '').slice(0, 120),
    maxRedemptions: max,
    expiresAt,
    createdBy: createdBy ?? undefined,
  });
  return codeOut(minted, minted.code);
}

export function codeOut(c, plaintext = undefined) {
  return {
    ...(plaintext ? { code: plaintext } : {}),
    id: c.id,
    label: c.label,
    days: c.grant.amount,
    unit: c.grant.unit,
    max_redemptions: c.maxRedemptions,
    redemptions: c.redemptions ?? 0,
    expires_at: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    created_at: new Date(c.createdAt).toISOString(),
    revoked_at: c.revokedAt ? new Date(c.revokedAt).toISOString() : null,
  };
}

/**
 * Redeem a code for the signed-in person: `{ ok, days, until }`, or
 * `{ ok: false, reason, error }` in words a person can act on.
 */
export async function redeemCode(userId, input, svc = services()) {
  const code = String(input ?? '').trim();
  if (!code) return { ok: false, reason: 'invalid', error: 'Type the code first.' };
  if (code.length > 64) return { ok: false, reason: 'invalid', error: REDEEM_ERRORS.invalid };
  let r;
  try {
    r = await svc.credits.redeem(code, String(userId));
  } catch (err) {
    // The code is spent but the pass did not save (the redemption stands, per
    // redeem-credits). grantPass is idempotent on its ref, so an admin can
    // re-run it for 'code:<id>' and still add one term.
    console.error('[credits] grant after redeem failed:', err.message);
    return {
      ok: false,
      reason: 'grant_failed',
      error: 'The code was accepted but the pass did not save. Write to us and we will add it.',
    };
  }
  if (!r.ok) return { ok: false, reason: r.reason, error: REDEEM_ERRORS[r.reason] ?? 'No.' };
  const until = await accounts.accountPassUntil(userId);
  return { ok: true, days: r.grant.amount, code_id: r.codeId, until: until?.toISOString() ?? null };
}

/* --------------------------------------------------------------- invites -- */

export const looksLikeInvite = (s) => {
  if (typeof s !== 'string' || s.length > 40) return false;
  const compact = s.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = compact.startsWith('INV') ? compact.slice(3) : compact;
  return body.length === 12;
};
export const canonicalInvite = (s) => normalizeInvite(String(s ?? ''));

/** What an invite link is, without spending it: for the /i/<code> page. */
export async function inviteStatus(code, svc = services()) {
  if (!looksLikeInvite(code)) return 'invalid';
  const row = await svc.aff.store.getInviteByHash(inviteHash(code));
  if (!row) return 'invalid';
  if (row.revokedAt !== null) return 'revoked';
  if (row.usedBy !== null) return 'used';
  if (row.expiresAt !== null && Date.now() >= row.expiresAt) return 'expired';
  return 'ok';
}

export function inviteOut(i, { plaintext, origin = config.siteUrl } = {}) {
  const status =
    i.usedBy !== null
      ? 'used'
      : i.revokedAt
        ? 'revoked'
        : i.expiresAt !== null && Date.now() >= i.expiresAt
          ? 'expired'
          : 'open';
  return {
    ...(plaintext ? { code: plaintext, url: `${origin}/i/${plaintext}` } : {}),
    id: i.id,
    note: i.note ?? '',
    status,
    created_at: new Date(i.createdAt).toISOString(),
    expires_at: i.expiresAt ? new Date(i.expiresAt).toISOString() : null,
    used_at: i.usedAt ? new Date(i.usedAt).toISOString() : null,
  };
}

export async function myInvites(user, { origin } = {}, svc = services()) {
  const [quota, invites, affCode] = await Promise.all([
    svc.aff.quota(String(user.id)),
    svc.aff.invites(String(user.id)),
    svc.aff.affiliateCode(String(user.id)),
  ]);
  const gate = canSendInvites(user);
  return {
    quota,
    can_send: gate.ok,
    why_not: gate.ok ? null : gate.reason,
    bonus_days: svc.bonusDays,
    invites: invites.map((i) => inviteOut(i, { origin })),
    affiliate: { code: affCode, url: `${origin ?? config.siteUrl}/?ref=${affCode}` },
  };
}

export async function createInvite(user, { note = '', ip = null, origin } = {}, svc = services()) {
  const gate = canSendInvites(user);
  if (!gate.ok) return { ok: false, error: gate.reason };
  let made;
  try {
    made = await svc.aff.createInvite(String(user.id), String(note ?? '').slice(0, 80));
  } catch (err) {
    if (/no invites left/.test(err.message))
      return {
        ok: false,
        error: 'No invites left. Each account gets a few; they are meant to be scarce.',
      };
    throw err;
  }
  await accounts
    .recordInviteOrigin({ inviteId: made.id, ipHash: ipHash(ip) })
    .catch((err) => console.error('[invites] origin not recorded:', err.message));
  return { ok: true, invite: inviteOut(made, { plaintext: made.code, origin }) };
}

/** Withdraw one of MY unused invites. Someone else's id answers like an unknown one. */
export async function revokeInvite(userId, inviteId, svc = services()) {
  const mine = await svc.aff.invites(String(userId));
  const invite = mine.find((i) => i.id === String(inviteId));
  if (!invite) return { ok: false, error: 'No such invite.' };
  if (invite.usedBy !== null) return { ok: false, error: 'That invite was already used.' };
  await svc.aff.revokeInvite(invite.id);
  return { ok: true };
}

/**
 * A NEW account has just been created by spending its emailed link: accept the
 * invite it came with, then pay both sides once unless a spam check says no.
 * Called only for a created account, never on an ordinary sign-in, so an
 * existing member cannot collect bonuses by redeeming invites.
 */
export async function acceptInvite({ user, code, ip = null }, svc = services()) {
  if (!code || !looksLikeInvite(code)) return { ok: false, reason: 'invalid' };
  const r = await svc.aff.redeemInvite(code, String(user.id));
  if (!r.ok) return r;
  const days = svc.bonusDays;
  if (!(days > 0)) return { ...r, days: 0, paid: false };
  const inviter = await accounts.getUserById(r.inviterId);
  const verdict = inviter
    ? bonusVerdict({
        inviterEmail: inviter.email,
        inviteeEmail: user.email,
        inviterIpHash: await accounts.inviteOrigin(r.inviteId),
        inviteeIpHash: ipHash(ip),
        inviterBonuses30d: await accounts.inviterBonusesSince(inviter.id, 30),
      })
    : { ok: false, reason: 'inviter is gone' };
  const reason = verdict.ok ? null : verdict.reason;
  const sides = [['invitee', String(user.id)]];
  if (inviter) sides.push(['inviter', inviter.id]);
  for (const [side, userId] of sides) {
    const first = await accounts.decideInviteBonus({
      inviteId: r.inviteId,
      side,
      userId,
      days,
      paid: verdict.ok,
      reason,
    });
    if (first && verdict.ok)
      await svc.grant({ userId, days, ref: `invite:${r.inviteId}:${side}`, source: 'invite' });
  }
  if (!verdict.ok) console.log(`[invites] bonus withheld for ${r.inviteId}: ${reason}`);
  return { ...r, days: verdict.ok ? days : 0, paid: verdict.ok, reason };
}

/** First-touch attribution of a new account to an affiliate link (?ref=). */
export async function attributeReferral({ userId, code }, svc = services()) {
  if (!code) return { ok: false };
  return svc.aff.attribute(String(code), String(userId));
}

/* ----------------------------------------------------------------- hosts -- */

/**
 * The origin links are built on, from the request's own host when it is one of
 * ours (so a dev box builds links to itself), never localhost in production.
 */
export function originFrom(c) {
  const site = new URL(config.siteUrl);
  const host = String(c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const apex = site.host.replace(/^www\./, '');
  if (host === apex || host === `www.${apex}`) return `${site.protocol}//${apex}`;
  if (!config.isProd && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return config.siteUrl;
}
