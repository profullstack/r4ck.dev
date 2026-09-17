import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@r4ck/config';
import { DEFAULT_RATES, fetchRates } from '@r4ck/core/fx';
import { itemToDeal, itemToProvider, itemToServer, providerFromServer } from '@r4ck/core/normalize';
import * as cat from '@r4ck/db/catalog';
import { nichedbClient } from './nichedb.js';

/** A snapshot of the collection ships in the repo so a fresh deployment has data at boot. */
export const SNAPSHOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'hosting-snapshot.json.gz',
);

export async function snapshotItems(path = SNAPSHOT) {
  const raw = await Bun.file(path).arrayBuffer();
  const rows = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(raw))));
  return (async function* () {
    for (let i = 0; i < rows.length; i += 200) yield rows.slice(i, i + 200);
  })();
}

/**
 * First boot on an empty database: load the shipped snapshot so pages have
 * rows immediately. The live sync then walks forward from its watermark.
 */
export async function seedIfEmpty({ log = console.log } = {}) {
  const s = await cat.stats();
  if (Number(s.servers) > 0 || !existsSync(SNAPSHOT)) return false;
  log('[sync] empty catalogue: seeding from the shipped snapshot');
  await syncOnce({ log, items: await snapshotItems() });
  return true;
}

/**
 * Mirror the hosting collection. The first run walks everything; later runs
 * ask for what changed since the last watermark, minus a margin, and the
 * upserts make the overlap harmless.
 */
export async function currentRates() {
  const stored = await cat.getSyncState('fx');
  return { ...DEFAULT_RATES, ...(stored?.rates ?? {}), ...(config.fxRates ?? {}) };
}

export async function refreshRates({ log = console.log } = {}) {
  try {
    const rates = await fetchRates();
    await cat.setSyncState('fx', { rates, at: new Date().toISOString() });
    log(`[fx] ${Object.keys(rates).length} rates refreshed`);
    return rates;
  } catch (err) {
    log(`[fx] refresh failed, keeping the table: ${err.message}`);
    return null;
  }
}

/**
 * Apply a batch of NicheDB items: providers first so a plan's provider slug
 * can resolve to the register's slug, then plans and deals. Returns counts
 * and the newest updated_at seen.
 */
export async function applyItems(
  items,
  { rates, log = () => {}, counts = freshCounts(), watermark = null } = {},
) {
  const pending = [];
  for (const item of items) {
    if (item.updated_at && (!watermark || item.updated_at > watermark)) watermark = item.updated_at;
    if (item.kind === 'provider') {
      await cat.upsertProvider(itemToProvider(item));
      counts.providers++;
    } else pending.push(item);
  }
  for (const item of pending) {
    if (item.kind === 'plan') {
      const s = itemToServer(item, rates);
      const slug = await cat.providerSlugForDomain(s.provider);
      if (slug) s.provider = slug;
      else {
        await cat.upsertProvider(providerFromServer(s), { overwriteInferred: false });
        counts.providers++;
      }
      const r = await cat.upsertServer(s);
      counts.servers++;
      if (r.created) counts.created++;
      if (r.priceChanged) counts.priceChanges++;
    } else if (item.kind === 'deal' || item.kind === 'story') {
      await cat.upsertDeal({
        ...itemToDeal(item),
        data: { ...(item.data ?? {}), kind: item.kind },
      });
      counts.deals++;
    } else counts.skipped++;
  }
  void log;
  return { counts, watermark };
}

const freshCounts = () => ({
  providers: 0,
  servers: 0,
  deals: 0,
  skipped: 0,
  created: 0,
  priceChanges: 0,
  pages: 0,
});

/**
 * Mirror the collection from an explicit page iterable (a snapshot, a file,
 * or the client's full walk). Used by the CLI and the tests.
 */
export async function syncOnce({
  full = false,
  log = console.log,
  client = nichedbClient(),
  items = null,
} = {}) {
  const started = Date.now();
  const state = (await cat.getSyncState('nichedb')) ?? {};
  const rates = await currentRates();
  let counts = freshCounts();
  let watermark = state.watermark ?? null;
  const source = items ?? client.items();
  for await (const page of source) {
    counts.pages++;
    ({ counts, watermark } = await applyItems(page, { rates, counts, watermark }));
    log(`[sync] page ${counts.pages}: ${page.length} items`);
  }
  await cat.setSyncState('nichedb', {
    ...state,
    watermark,
    at: new Date().toISOString(),
    counts,
    ms: Date.now() - started,
    full: Boolean(full || !items),
  });
  log(`[sync] done in ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify(counts)}`);
  return counts;
}

/**
 * The periodic pass, shaped around what nichedb.dev actually answers.
 *
 * Its items API takes 30 to 90 seconds a page and a `since=` filter never
 * returns, so "what changed" is read as the newest rows by updated_at: one
 * page of 200 catches a day's worth of a source's re-runs. A full keyset walk
 * by id, resumed from a saved cursor with a time budget per tick, catches
 * anything the recent page missed and completes across several ticks.
 */
export async function syncTick({
  log = console.log,
  client = nichedbClient(),
  budgetMs = 8 * 60_000,
  walkEveryMs = 24 * 3600_000,
  now = Date.now,
} = {}) {
  const started = now();
  const state = (await cat.getSyncState('nichedb')) ?? {};
  const rates = await currentRates();
  let counts = freshCounts();
  let watermark = state.watermark ?? null;
  const save = (extra = {}) =>
    cat.setSyncState('nichedb', {
      ...state,
      ...extra,
      watermark,
      at: new Date().toISOString(),
      counts,
    });

  try {
    const recent = await client.recent();
    counts.pages++;
    ({ counts, watermark } = await applyItems(recent, { rates, counts, watermark }));
    log(
      `[sync] recent: ${recent.length} rows, ${counts.created} new, ${counts.priceChanges} price changes`,
    );
  } catch (err) {
    log(`[sync] recent page failed: ${err?.message ?? err}`);
  }
  await save();

  const walk = state.walk ?? null;
  const lastWalk = state.walkCompletedAt ? new Date(state.walkCompletedAt).getTime() : 0;
  if (!walk && now() - lastWalk < walkEveryMs) return counts;
  let before = walk?.before ?? null;
  let seen = walk?.seen ?? 0;
  let exhausted = false;
  while (now() - started < budgetMs) {
    let page;
    try {
      page = await client.page({ before });
    } catch (err) {
      log(`[sync] walk page failed at before=${before}: ${err?.message ?? err}`);
      await save({
        walk: { before, seen, startedAt: walk?.startedAt ?? new Date().toISOString() },
      });
      return counts;
    }
    counts.pages++;
    if (page.length === 0) {
      exhausted = true;
      break;
    }
    ({ counts, watermark } = await applyItems(page, { rates, counts, watermark }));
    seen += page.length;
    before = Math.min(...page.map((i) => Number(i.id)));
    log(`[sync] walk: ${seen} rows so far (before ${before})`);
    if (page.length < 200) {
      exhausted = true;
      break;
    }
    await save({ walk: { before, seen, startedAt: walk?.startedAt ?? new Date().toISOString() } });
  }
  if (exhausted) {
    await save({ walk: null, walkCompletedAt: new Date().toISOString(), walkRows: seen });
    log(`[sync] walk complete: ${seen} rows`);
  } else {
    await save({ walk: { before, seen, startedAt: walk?.startedAt ?? new Date().toISOString() } });
    log(`[sync] walk paused at ${seen} rows, resumes next tick`);
  }
  return counts;
}

/** The worker loop: rates daily, catalogue every SYNC_MINUTES. */
export function startSyncLoop({ log = console.log } = {}) {
  let running = false;
  const tick = async (full = false) => {
    if (running) return;
    running = true;
    try {
      const fx = await cat.getSyncState('fx');
      if (!fx?.at || Date.now() - new Date(fx.at).getTime() > 86_400_000)
        await refreshRates({ log });
      if (full) await syncOnce({ full, log });
      else
        await syncTick({
          log,
          budgetMs: config.nichedb.budgetMs,
          walkEveryMs: config.nichedb.walkHours * 3600_000,
        });
    } catch (err) {
      log(`[sync] failed: ${err?.message ?? err}`);
    } finally {
      running = false;
    }
  };
  const every = Math.max(5, config.nichedb.syncMinutes) * 60_000;
  const timer = setInterval(() => tick(false), every);
  if (config.nichedb.syncOnBoot)
    setTimeout(
      () =>
        seedIfEmpty({ log })
          .catch((err) => log(`[sync] seed failed: ${err?.message ?? err}`))
          .then(() => tick(false)),
      2_000,
    );
  return { stop: () => clearInterval(timer), tick };
}
