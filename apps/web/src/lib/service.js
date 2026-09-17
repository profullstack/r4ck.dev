import { config } from '@r4ck/config';
import { countriesFor, countryName, describeFilters, filtersFrom, parseQuery } from '@r4ck/core';
import * as accounts from '@r4ck/db/accounts';
import * as cat from '@r4ck/db/catalog';
import { facets as facetCounts, search } from '@r4ck/db/search';
import { Denied } from './http.js';
import { agentViews, dealOut, providerOut, serverOut } from './serialize.js';

/**
 * What the API, the page, the CLI and the MCP tools all call. One
 * implementation, so a result never differs by the door it came through.
 */

/** Filters from raw params: `q` is parsed into structure, explicit params win. */
export function resolveFilters(raw) {
  const explicit = filtersFrom(raw);
  let understood = [];
  let filters = explicit;
  if (explicit.q) {
    const parsed = parseQuery(explicit.q);
    understood = parsed.understood;
    filters = { ...parsed.filters, ...explicit, q: parsed.rest || undefined };
    if (!filters.q) delete filters.q;
  }
  if (filters.region && !filters.country) {
    const codes = countriesFor(filters.region);
    if (codes) filters.country = codes;
  }
  return { filters, understood, explicit };
}

export async function runSearch(raw, { access, withFacets = true } = {}) {
  const { filters, understood } = resolveFilters(raw);
  const maxRows = access?.maxRows ?? config.api.anonMaxLimit;
  const limit = Math.min(Number(filters.limit) || 25, maxRows);
  const offset = Number(filters.offset) || 0;
  const [result, facets] = await Promise.all([
    search(filters, { limit, offset }),
    withFacets ? facetCounts(filters) : null,
  ]);
  const query = { ...filters };
  delete query.limit;
  delete query.offset;
  return {
    query,
    understood,
    chips: describeFilters(query, { countryName }),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    sort: result.sort,
    order: result.order,
    facets: facets ?? undefined,
    servers: result.servers.map(serverOut),
    agent: agentViews(query, {
      limit: limit !== 25 ? limit : undefined,
      offset: offset || undefined,
    }),
    next:
      result.offset + result.limit < result.total
        ? agentViews(query, { limit, offset: result.offset + result.limit }).url
        : null,
  };
}

export function parseOnly(q) {
  const parsed = parseQuery(q);
  return {
    q,
    filters: parsed.filters,
    understood: parsed.understood,
    rest: parsed.rest,
    chips: describeFilters(parsed.filters, { countryName }),
    agent: agentViews(parsed.filters),
  };
}

export async function serverDetail(id) {
  const row = await cat.getServer(id);
  if (!row) throw new Denied(`No server with id ${id}.`, 404);
  const [history, similar] = await Promise.all([cat.priceHistory(row.id), cat.similarServers(row)]);
  const provider = await cat.getProvider(row.provider);
  return {
    server: serverOut(row),
    provider: provider ? providerOut(provider) : null,
    price_history: history.map((h) => ({
      at: h.seen_at,
      amount: h.price === null ? null : Number(h.price),
      currency: h.currency,
      monthly_usd: h.monthly_usd === null ? null : Number(h.monthly_usd),
    })),
    similar: similar.map((s) => serverOut({ ...s, provider_display: s.provider_name })),
    raw: row.data,
  };
}

export async function compare(ids) {
  const rows = await cat.getServers(ids);
  if (rows.length === 0) throw new Denied('Send ids=1,2,3 with at least one known server id.', 400);
  return {
    count: rows.length,
    servers: rows.map(serverOut),
    agent: {
      url: `${config.siteUrl}/api/v1/compare?ids=${rows.map((r) => r.id).join(',')}`,
      html: `${config.siteUrl}/compare?ids=${rows.map((r) => r.id).join(',')}`,
      cli: `r4ck compare ${rows.map((r) => r.id).join(' ')}`,
    },
  };
}

export async function cheapest(raw, { access } = {}) {
  const r = await runSearch(
    { ...raw, sort: 'price', order: 'asc', limit: raw.limit ?? 10 },
    { access, withFacets: false },
  );
  return r;
}

export async function facetsOnly(raw) {
  const { filters } = resolveFilters(raw);
  return { query: filters, facets: await facetCounts(filters) };
}

export async function providers(raw = {}) {
  const csv = (v) =>
    (Array.isArray(v) ? v : String(v ?? '').split(','))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  const country = csv(raw.country).map((c) => c.toUpperCase());
  const r = await cat.listProviders({
    q: String(raw.q ?? '').trim(),
    has: csv(raw.has),
    country,
    category: csv(raw.category),
    runtime: csv(raw.runtime),
    green:
      raw.green === undefined || raw.green === ''
        ? null
        : ['1', 'true', 'yes'].includes(String(raw.green)),
    limit: Math.min(Number(raw.limit) || 100, 500),
    offset: Number(raw.offset) || 0,
    sort: ['name', 'servers', 'price'].includes(raw.sort) ? raw.sort : 'name',
  });
  return {
    total: r.total,
    providers: r.providers.map(providerOut),
    facets: await cat.providerFacets(),
  };
}

export async function provider(slug) {
  const p = await cat.getProvider(slug);
  if (!p) throw new Denied(`No provider called ${slug}.`, 404);
  const rows = await cat.providerServers(p.slug);
  return {
    provider: providerOut(p),
    servers: rows.map((s) =>
      serverOut({
        ...s,
        provider: p.slug,
        provider_name: p.name,
        provider_display: p.name,
        provider_automation: p.automation,
      }),
    ),
  };
}

export async function deals({ limit = 50 } = {}) {
  return { deals: (await cat.listDeals({ limit })).map(dealOut) };
}

export const stats = () => cat.stats();

/* --------------------------------------------------------- saved searches -- */

export async function listSaved(user) {
  return { saved: (await accounts.listSaved(user.id)).map(savedOut) };
}

export async function saveSearch(user, { name, query }) {
  const { filters } = resolveFilters(query ?? {});
  const label =
    String(name ?? '').trim() ||
    describeFilters(filters, { countryName })
      .map((c) => c.label)
      .join(', ') ||
    'everything';
  const row = await accounts.saveSearch({
    userId: user.id,
    name: label.slice(0, 120),
    query: filters,
  });
  return { saved: savedOut(row) };
}

export async function deleteSaved(user, id) {
  const ok = await accounts.deleteSaved({ userId: user.id, id });
  if (!ok) throw new Denied('No saved search with that id.', 404);
  return { ok: true };
}

const savedOut = (r) => ({
  id: r.id,
  name: r.name,
  query: r.query,
  created_at: r.created_at,
  ...agentViews(r.query),
});
