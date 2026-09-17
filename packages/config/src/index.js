/**
 * Every environment variable the deployment reads, read once, with the
 * defaults the code relies on. Nothing else in the tree touches process.env.
 */
const env = process.env;
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d;
};
const bool = (v, d) =>
  v === undefined || v === '' ? d : !['0', 'false', 'no', 'off'].includes(String(v).toLowerCase());
const list = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const siteUrl = (env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const isTest =
  env.NODE_ENV === 'test' ||
  Boolean(env.BUN_TEST) ||
  (typeof Bun !== 'undefined' && Bun.env.NODE_ENV === 'test');

export const config = Object.freeze({
  isProd: env.NODE_ENV === 'production',
  isTest,
  siteUrl,
  siteName: env.SITE_NAME ?? 'r4ck',
  siteHost: new URL(siteUrl).host,
  port: num(env.PORT, 3000),
  roles: list(env.ROLES ?? 'web,worker'),
  databaseUrl: env.DATABASE_URL ?? (isTest ? 'postgres://r4ck:r4ck@localhost:5442/r4ck' : ''),
  adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  session: { cookie: 'r4k_session', ttlDays: num(env.SESSION_TTL_DAYS, 90) },
  api: {
    anonPerHour: num(env.API_ANON_PER_HOUR, 300),
    keyPerHour: num(env.API_KEY_PER_HOUR, 6000),
    anonMaxLimit: 50,
    keyMaxLimit: 200,
  },
  nichedb: {
    url: (env.NICHEDB_URL ?? 'https://nichedb.dev').replace(/\/$/, ''),
    key: env.NICHEDB_KEY ?? '',
    collection: 'hosting',
    syncMinutes: num(env.SYNC_MINUTES, 30),
    syncOnBoot: bool(env.SYNC_ON_BOOT, true),
    timeoutMs: num(env.NICHEDB_TIMEOUT_MS, 170_000),
  },
  mail: {
    enabled: Boolean(env.RESEND_API_KEY),
    resendKey: env.RESEND_API_KEY ?? '',
    from: env.MAIL_FROM ?? 'r4ck <hello@profullstack.com>',
  },
  x402: {
    coinpayKey: env.COINPAY_X402_KEY ?? '',
    payTo: env.CRAWL_PAY_TO ?? '',
    priceCents: num(env.CRAWL_PRICE_CENTS, 100),
    passMinutes: num(env.CRAWL_PASS_MINUTES, 1440),
    maxDays: num(env.CRAWL_MAX_DAYS, 30),
    contact: env.CRAWL_CONTACT ?? 'mailto:hello@profullstack.com',
  },
  fxRates: (() => {
    try {
      return env.FX_RATES_JSON ? JSON.parse(env.FX_RATES_JSON) : null;
    } catch {
      return null;
    }
  })(),
});
