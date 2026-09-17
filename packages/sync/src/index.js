import { config } from '@r4ck/config';
import { DEFAULT_RATES, fetchRates } from '@r4ck/core/fx';
import { itemToDeal, itemToProvider, itemToServer, providerFromServer } from '@r4ck/core/normalize';
import * as cat from '@r4ck/db/catalog';
import { nichedbClient } from './nichedb.js';

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

export async function syncOnce({
  full = false,
  log = console.log,
  client = nichedbClient(),
  items = null,
} = {}) {
  const started = Date.now();
  const state = (await cat.getSyncState('nichedb')) ?? {};
  const since =
    full || !state.watermark
      ? null
      : new Date(new Date(state.watermark).getTime() - 10 * 60_000).toISOString();
  const rates = await currentRates();
  const counts = {
    providers: 0,
    servers: 0,
    deals: 0,
    skipped: 0,
    created: 0,
    priceChanges: 0,
    pages: 0,
  };
  let watermark = state.watermark ?? null;
  const pending = [];
  const source = items ?? client.items({ since });
  // Providers first so a plan's provider slug can resolve to the register's slug.
  for await (const page of source) {
    counts.pages++;
    for (const item of page) {
      if (item.updated_at && (!watermark || item.updated_at > watermark))
        watermark = item.updated_at;
      if (item.kind === 'provider') {
        await cat.upsertProvider(itemToProvider(item));
        counts.providers++;
      } else pending.push(item);
    }
    log(`[sync] page ${counts.pages}: ${page.length} items (${pending.length} pending)`);
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
  await cat.setSyncState('nichedb', {
    watermark,
    at: new Date().toISOString(),
    counts,
    ms: Date.now() - started,
    full: since === null,
  });
  log(`[sync] done in ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify(counts)}`);
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
      await syncOnce({ full, log });
    } catch (err) {
      log(`[sync] failed: ${err?.message ?? err}`);
    } finally {
      running = false;
    }
  };
  const every = Math.max(5, config.nichedb.syncMinutes) * 60_000;
  const timer = setInterval(() => tick(false), every);
  if (config.nichedb.syncOnBoot) setTimeout(() => tick(false), 2_000);
  return { stop: () => clearInterval(timer), tick };
}
