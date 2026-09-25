import { createThrottle, memoryStore } from '@profullstack/throttle';
import { createGateway } from '@profullstack/x402-gateway';
import { config } from '@r4ck/config';
import * as accounts from '@r4ck/db/accounts';
import { renderCrawl } from '../views/crawl.jsx';
import { Denied } from './http.js';

/**
 * Who pays, and how much they get.
 *
 * Three doors. A person reads free. A script with a key gets the larger
 * hourly allowance and the bulk endpoints. An agent that wants more than
 * either, or a training crawler that announces itself, pays a dollar a day
 * over x402 and is not metered at all while the pass is live. Going over an
 * allowance is answered 402 with the offer, never a bare 429: the caller has
 * just shown it wants more, and is still holding the request open.
 */
export const OPEN_PATHS = [
  '/llms.txt',
  '/skill.md',
  '/mcp',
  '/api/',
  '/healthz',
  '/manifest.webmanifest',
  '/sw.js',
  '/pricing',
  '/docs',
  '/docs/',
  '/.well-known/',
];

export const gateway = createGateway({
  siteUrl: config.siteUrl,
  siteName: config.siteName,
  coinpay: { apiKey: config.x402.coinpayKey },
  payTo: config.x402.payTo,
  priceCents: config.x402.priceCents,
  passMinutes: config.x402.passMinutes,
  maxDays: config.x402.maxDays,
  contact: config.x402.contact,
  openPaths: OPEN_PATHS,
  chargeSpoofedBrowsers: false,
  // /crawl in the site's own shell instead of the gateway's bare page.
  page: renderCrawl,
  benefits: [
    'No hourly allowance on the API, the CLI or MCP',
    'Bulk CSV and JSON export of any query',
    'Every field on every row',
  ],
  exempt: (request) => (request.headers.get('cookie') ?? '').includes(`${config.session.cookie}=`),
  onSale: (sale) =>
    accounts.recordCrawlSale(sale).catch((err) => console.error('[x402] sale not recorded', err)),
});

const store = memoryStore();
export const throttle = createThrottle({
  gateway,
  store,
  limit: 100,
  credential: { limit: 600, ceiling: 1200 },
  credentialFrom: (request) => {
    const auth = request.headers.get('authorization') ?? request.headers.get('x-api-key');
    if (auth) return auth;
    const m = (request.headers.get('cookie') ?? '').match(
      new RegExp(`${config.session.cookie}=([^;]+)`),
    );
    return m ? `session:${m[1]}` : null;
  },
  rules: [
    { path: '/auth/', limit: 10, credential: false },
    { path: '/api/auth/', limit: 10, credential: false },
    { path: '/healthz', open: true },
    { path: '/mcp', limit: 600 },
    { path: '/api/mcp', limit: 600 },
  ],
});

/** The gate as one Hono middleware: crawlers, then the site-wide allowance. */
export async function gate(c, next) {
  // GoogleOther (Google's non-Search crawler) walked every filter combination
  // of /servers and /api/v1/search at ~120/min, past its allowance and into
  // the 402 page. robots.txt refuses it, but Google caches robots.txt for up to
  // a day, so answer it here too: a few bytes, no data. robots.txt stays open,
  // or it could never learn it was refused. Googlebot itself is untouched.
  if (/GoogleOther/i.test(c.req.header('user-agent') ?? '') && c.req.path !== '/robots.txt') {
    return c.text('GoogleOther is refused here; see /robots.txt\n', 403);
  }
  const answer = await gateway.handle(c.req.raw);
  if (answer) return answer;
  const over = await throttle.handle(c.req.raw);
  if (over) return over;
  await next();
}

/**
 * The caller's access level for the API: `pass` (paid, unmetered), `key`
 * (an account's key), `session` (a signed-in browser) or `anon`.
 */
export async function accessFor(c) {
  const token = gateway.passFrom(c.req.raw);
  if (token && (await gateway.verifyPass(token)))
    return { plan: 'pass', perHour: null, maxRows: 500, bulk: true, bucket: null };
  const user = c.get('user');
  if (user && c.get('viaKey'))
    return {
      plan: 'key',
      perHour: config.api.keyPerHour,
      maxRows: config.api.keyMaxLimit,
      bulk: true,
      bucket: `key:${user.api_key_id}`,
    };
  if (user)
    return {
      plan: 'session',
      perHour: config.api.keyPerHour,
      maxRows: config.api.keyMaxLimit,
      bulk: true,
      bucket: `user:${user.id}`,
    };
  return {
    plan: 'anon',
    perHour: config.api.anonPerHour,
    maxRows: config.api.anonMaxLimit,
    bulk: false,
    bucket: `ip:${callerAddress(c)}`,
  };
}

export function callerAddress(c) {
  const h = c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip');
  if (h) return h.trim();
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',').pop().trim();
  return c.env?.requestIP?.(c.req.raw)?.address ?? '0.0.0.0';
}

/** Hourly metering on /api/v1: the answer to running out is the offer. */
export async function meterApi(c, next) {
  const access = await accessFor(c);
  c.set('access', access);
  c.header('x-plan', access.plan);
  if (access.perHour === null) return next();
  const { count, resetAt } = await accounts.countHit(access.bucket);
  c.header('x-ratelimit-limit', String(access.perHour));
  c.header('x-ratelimit-remaining', String(Math.max(0, access.perHour - count)));
  c.header('x-ratelimit-reset', String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)));
  if (count > access.perHour) {
    const resetSeconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
    const usage = { count, remaining: 0, resetSeconds, overLimit: true };
    const quota = { requests: access.perHour, windowSeconds: 3600 };
    if (gateway.enabled) return gateway.sell(c.req.raw, { usage, quota });
    throw new Denied(
      `Allowance used: ${access.perHour} requests an hour for ${access.plan} callers. It resets in ${resetSeconds}s. Make a free key at ${config.siteUrl}/settings for ${config.api.keyPerHour} an hour.`,
      429,
      {
        plan: access.plan,
        retry_after: resetSeconds,
        key: `${config.siteUrl}/settings`,
        pass: `${config.siteUrl}/crawl`,
      },
    );
  }
  await next();
}

/** A pricing snapshot for the pages and llms.txt. */
export function pricing() {
  return {
    anonymous: {
      requests_per_hour: config.api.anonPerHour,
      max_rows: config.api.anonMaxLimit,
      bulk: false,
    },
    key: {
      requests_per_hour: config.api.keyPerHour,
      max_rows: config.api.keyMaxLimit,
      bulk: true,
      price: 'free',
      url: `${config.siteUrl}/settings`,
    },
    pass: {
      requests_per_hour: null,
      max_rows: 500,
      bulk: true,
      price: `${(config.x402.priceCents / 100).toFixed(2)} USD per day`,
      url: `${config.siteUrl}/crawl`,
      protocol: 'x402',
      enabled: gateway.enabled,
    },
  };
}
