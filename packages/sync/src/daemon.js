import { createDaemon, pgStore } from '@profullstack/scraper-daemon';
import { config } from '@r4ck/config';
import { sql } from '@r4ck/db';
import * as cat from '@r4ck/db/catalog';
import { refreshRates, seedIfEmpty, syncTick } from './index.js';

/**
 * The updater daemon (@profullstack/scraper-daemon, the same package search.peptides,
 * ch4nnels.com, rssamplifier.com and p0dcasters.com run), state in this site's Postgres.
 *
 *   nichedb-mirror   the hosting collection, every SYNC_MINUTES: recent page + the
 *                    resumable daily walk (syncTick, unchanged, now on the daemon)
 *   fx               exchange rates, daily
 *   openserver-probe every provider's domain, weekly: does it publish
 *                    /.well-known/openserver.json (machine-readable plans)? The ones
 *                    that do are listed at /api/v1/openserver-origins, the origin list
 *                    nichedb's openserver adapter reads.
 */
let current = null;
export const currentDaemon = () => current;

/** A document that looks like an OpenServer descriptor: plans/offers/servers to read. */
export function looksLikeOpenServer(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const lists = ['offers', 'plans', 'servers', 'products'].filter((k) => Array.isArray(doc[k]));
  return Boolean(doc.openserver || doc.$schema?.includes?.('openserver') || lists.length);
}

/** `onChanges({ listed, dropped })` hears what each mirror tick listed and cut (the web app's watchers). */
export function buildDaemon({ log = console.log, onChanges = null } = {}) {
  const daemon = createDaemon({
    name: config.siteName,
    // BullMQ on the site's own Redis (the compose `redis` service): queue, run records and task
    // state live there; the catalogue stays in Postgres. No REDIS_URL (dev, tests): local engine on Postgres.
    redis: process.env.REDIS_URL || null,
    store: process.env.REDIS_URL ? undefined : pgStore((text, params) => sql.unsafe(text, params)),
    concurrency: Number(process.env.DAEMON_CONCURRENCY ?? 4),
    fetch: {
      userAgent: `r4ck.dev/0.2 (+${config.siteUrl}/docs)`,
      delayMs: 2000,
      timeoutMs: 15_000,
      maxBytes: 2_000_000,
    },
    log,
    onStall: ({ job, lastError }) =>
      console.error(`[daemon] ${job} stalled${lastError ? `: ${lastError}` : ''}`),
  });

  let seeded = false;
  daemon.job({
    name: 'nichedb-mirror',
    every: `${Math.max(5, config.nichedb.syncMinutes)}m`,
    // syncTick spends at most budgetMs on the walk, then saves its cursor; leave it room.
    timeout: config.nichedb.budgetMs + 5 * 60_000,
    staleAfter: '6h',
    run: async (ctx) => {
      if (!seeded) {
        await seedIfEmpty({ log: ctx.log });
        seeded = true;
      }
      return syncTick({
        log: ctx.log,
        budgetMs: config.nichedb.budgetMs,
        walkEveryMs: config.nichedb.walkHours * 3600_000,
        onChanges,
      });
    },
  });

  daemon.job({
    name: 'fx',
    every: '1d',
    run: async (ctx) => {
      const rates = await refreshRates({ log: ctx.log });
      if (!rates) throw new Error('rates refresh failed; the stored table stays');
      return { currencies: Object.keys(rates).length };
    },
  });

  daemon.queue({
    name: 'openserver-probe',
    every: '7d',
    concurrency: 4,
    retireAfter: 8,
    itemsEvery: '1h',
    items: async () => {
      const rows =
        await sql`select slug, domain from providers where domain is not null and domain <> ''`;
      const seen = new Set();
      return rows
        .map((r) => ({
          key: String(r.domain)
            .toLowerCase()
            .replace(/^www\./, ''),
          slug: r.slug,
        }))
        .filter(
          (r) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(r.key) && !seen.has(r.key) && seen.add(r.key),
        )
        .map((r) => ({ ...r, url: `https://${r.key}/` }));
    },
    run: async (item, ctx) => {
      const url = `https://${item.key}/.well-known/openserver.json`;
      let doc;
      try {
        doc = await ctx.fetch.json(url, { signal: ctx.signal });
      } catch (err) {
        // No descriptor is the common answer, not a failure: ask again in a month.
        if (err?.code === 'status' || err?.code === 'robots') {
          await record(item, null);
          return { published: false, nextIn: '30d' };
        }
        throw err;
      }
      const ok = looksLikeOpenServer(doc);
      await record(
        item,
        ok
          ? {
              url,
              offers: ['offers', 'plans', 'servers', 'products'].reduce(
                (n, k) => n + (Array.isArray(doc[k]) ? doc[k].length : 0),
                0,
              ),
            }
          : null,
      );
      return { published: ok, nextIn: ok ? '1d' : '30d' };
    },
  });

  current = daemon;
  return daemon;
}

/** Keep the list of origins that publish a descriptor in sync_state('openserver'). */
async function record(item, found) {
  const state = (await cat.getSyncState('openserver')) ?? { origins: {} };
  const origins = state.origins ?? {};
  if (found) origins[item.key] = { ...found, provider: item.slug, at: new Date().toISOString() };
  else delete origins[item.key];
  await cat.setSyncState('openserver', { origins, at: new Date().toISOString() });
}

export async function openserverOrigins() {
  const state = (await cat.getSyncState('openserver')) ?? {};
  return Object.entries(state.origins ?? {}).map(([domain, v]) => ({ domain, ...v }));
}
