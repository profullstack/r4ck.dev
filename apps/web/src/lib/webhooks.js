import {
  postgresStore,
  verifySignature,
  WebhookError,
  Webhooks,
  webhooksApi,
} from '@profullstack/webhooks';
import { config } from '@r4ck/config';
import { jsonb, sql } from '@r4ck/db';
import { search } from '@r4ck/db/search';
import { agentViews, serverOut } from './serialize.js';
import { resolveFilters } from './service.js';

/**
 * Customer webhooks on @profullstack/webhooks: endpoints, signing keys, event
 * filters and a durable outbox in this site's Postgres (migration 0004). The
 * owner of an endpoint is the account (users.id); every event is about that
 * account: its saved searches, its pass, its keys.
 */
export const EVENT_TYPES = [
  'server.listed',
  'server.price_dropped',
  'pass.granted',
  'api_key.created',
  'api_key.revoked',
];

export const EVENT_HELP = {
  'server.listed': 'A new offer matches one of your saved searches.',
  'server.price_dropped':
    'An offer matching one of your saved searches got cheaper (billed-in price).',
  'pass.granted': 'Days of the pass were added to your account (credit code or invite).',
  'api_key.created': 'An API key was made on your account.',
  'api_key.revoked': 'An API key on your account was revoked.',
};

/**
 * Bun.SQL in the `query(text, params) -> { rows }` shape postgresStore takes.
 * Bun's client has no pg pool; `unsafe` takes $1-style text and a params array.
 */
export const pgQuery = (db) => ({
  query: async (text, params = []) => ({ rows: await db.unsafe(text, params) }),
});

let current = null;

/** One hub per process. `start()` it once at boot (main.js), never in tests. */
export function hooks() {
  current ??= makeHooks();
  return current;
}

export function makeHooks({ db = sql, ...options } = {}) {
  return new Webhooks({
    store: postgresStore(pgQuery(db)),
    source: config.siteUrl,
    eventTypes: EVENT_TYPES,
    ...options,
  });
}

/** For tests: swap the process hub (a fetch stub, an open guard). */
export function setHooks(h) {
  current = h;
}

/** The /api/v1/webhooks fetch handler for one signed-in account. */
export const webhooksHandler = (ownerId) =>
  webhooksApi(hooks(), { basePath: '/api/v1/webhooks', owner: () => ownerId });

/** Fire and forget: an event never breaks the request that caused it. */
export async function emit(owner, type, data, options) {
  try {
    return await hooks().emit(String(owner), type, data, options);
  } catch (err) {
    console.error(`[webhooks] ${type} for ${owner} not queued: ${err?.message ?? err}`);
    return null;
  }
}

/** What an api_key.* event says about a key: never the key itself. */
export const keyEvent = (created, name) => ({
  id: created.id,
  name: String(name ?? 'default').slice(0, 60),
  prefix: created.prefix,
});

const MAX_SERVERS = 50;

/**
 * A mirror tick listed and cut prices on some offers: tell each account whose
 * saved search matches, one event per saved search and type, with the offers.
 * Only accounts with an enabled endpoint are looked at.
 */
export async function notifyWatchers(
  { listed = [], dropped = [] } = {},
  { h = hooks(), db = sql } = {},
) {
  const ids = [...new Set([...listed, ...dropped.map((d) => d.id)].map(Number))];
  if (!ids.length) return { emitted: 0 };
  const watched = await db`
    select s.id, s.user_id, s.name, s.query from saved_searches s
    where s.user_id::text in (select owner from webhook_endpoints where enabled = 1)
  `;
  const listedSet = new Set(listed.map(Number));
  const drops = new Map(dropped.map((d) => [Number(d.id), d]));
  let emitted = 0;
  for (const w of watched) {
    const query = jsonb(w.query);
    const { filters } = resolveFilters(query);
    const r = await search({ ...filters, ids }, { limit: 500, offset: 0 });
    if (!r.servers.length) continue;
    const saved = { id: w.id, name: w.name, url: agentViews(query).html ?? null };
    const fresh = r.servers.filter((s) => listedSet.has(Number(s.id)));
    const cheaper = r.servers.filter((s) => drops.has(Number(s.id)));
    if (fresh.length) {
      await h.emit(
        String(w.user_id),
        'server.listed',
        {
          saved_search: saved,
          total: fresh.length,
          servers: fresh.slice(0, MAX_SERVERS).map(serverOut),
        },
        { subject: `saved_search:${w.id}` },
      );
      emitted++;
    }
    if (cheaper.length) {
      await h.emit(
        String(w.user_id),
        'server.price_dropped',
        {
          saved_search: saved,
          total: cheaper.length,
          servers: cheaper.slice(0, MAX_SERVERS).map((s) => ({
            ...serverOut(s),
            price_before: drops.get(Number(s.id)).from,
          })),
        },
        { subject: `saved_search:${w.id}` },
      );
      emitted++;
    }
  }
  return { emitted };
}

/** Remove an account's endpoints and log (account deletion). */
export async function forgetOwner(owner, db = sql) {
  await db`delete from webhook_deliveries where owner = ${String(owner)}`;
  await db`delete from webhook_endpoints where owner = ${String(owner)}`;
}

export { verifySignature, WebhookError };
