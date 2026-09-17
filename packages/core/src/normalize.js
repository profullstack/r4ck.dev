import { DEFAULT_RATES, hourlyUsd, monthlyUsd, round } from './fx.js';

/**
 * A NicheDB hosting item, as /api/v1/items returns it, made into a row for
 * this index. Three kinds arrive: `provider` (FindHost register + OpenServer
 * descriptors), `plan` (every adapter's offers, stored as OpenServer offers
 * under data.offer) and `deal` (LowEndBox).
 */

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => (num(v) === null ? null : Math.round(num(v)));
/** A spec outside what any offer sells is a parse error upstream, not a fact. */
const bounded = (v, max) => (v === null || v < 0 || v > max ? null : v);
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

export function itemToServer(item, rates = DEFAULT_RATES) {
  const d = item.data ?? {};
  const o = d.offer ?? {};
  const price = o.price ?? {};
  const compute = o.compute ?? {};
  const net = o.network ?? {};
  const loc = o.location ?? {};
  const storage = Array.isArray(o.storage) ? o.storage : [];
  const diskGb = storage.reduce((sum, s) => sum + (num(s?.size_gb) ?? 0), 0);
  const gpu = compute.gpu && typeof compute.gpu === 'object' ? compute.gpu : null;
  const kind = String(o.kind ?? 'vps').toLowerCase();
  const interval = str(price.interval)?.toLowerCase() ?? null;
  const monthly = monthlyUsd({ amount: price.amount, currency: price.currency, interval }, rates);
  const hourly =
    d.priceHourly !== undefined && d.priceHourly !== null && price.currency === 'USD'
      ? num(d.priceHourly)
      : hourlyUsd(monthly);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const platform =
    str(d.platform) ??
    tags.find((t) => t.startsWith('platform:'))?.slice(9) ??
    (item.source === 'openserver'
      ? 'openserver'
      : item.adapter?.endsWith('-plans') ||
          item.adapter?.endsWith('-types') ||
          item.adapter?.endsWith('-instances') ||
          item.adapter === 'ovh-vps'
        ? 'api'
        : null);
  return {
    nichedb_id: Number(item.id),
    external_id: String(item.external_id ?? item.id),
    provider: String(d.provider ?? domainOf(o.url ?? item.url) ?? 'unknown').toLowerCase(),
    provider_name: str(d.providerName) ?? str(d.provider) ?? 'Unknown',
    name: str(o.name) ?? str(item.title) ?? 'Untitled',
    url: str(o.url) ?? str(item.url),
    kind,
    tenancy: str(o.tenancy),
    management: str(o.management),
    model: str(o.model),
    vcpu: bounded(int(compute.vcpu), 1024),
    cores: bounded(int(compute.cores), 1024),
    ram_mb: bounded(int(compute.ram_mb), 32 * 1024 * 1024),
    arch: str(compute.arch)?.toLowerCase() ?? null,
    gpu_model: gpu ? str(gpu.model) : null,
    gpu_count: gpu ? bounded(int(gpu.count) ?? 1, 64) : null,
    gpu_vram_mb: gpu ? bounded(int(gpu.vram_mb), 4 * 1024 * 1024) : null,
    disk_gb: diskGb > 0 ? bounded(round(diskGb, 2), 10_000_000) : null,
    disk_type: str(storage[0]?.type)?.toLowerCase() ?? null,
    bandwidth_mbps: int(net.bandwidth_mbps),
    transfer_gb: num(net.transfer_gb),
    ipv4: int(net.ipv4),
    ipv6: net.ipv6 === null || net.ipv6 === undefined ? null : Boolean(net.ipv6),
    price: num(price.amount),
    currency: str(price.currency)?.toUpperCase() ?? null,
    interval,
    setup: num(price.setup),
    commitment: str(price.commitment),
    monthly_usd: monthly,
    hourly_usd: hourly,
    regions: (loc.regions ?? []).map(String),
    countries: (loc.countries ?? []).map((c) => String(c).toUpperCase()),
    stock: str(o.stock),
    platform,
    group: str(d.group),
    source: str(item.source),
    summary: str(item.summary),
    tags,
    data: {
      offer: o,
      raw: d.raw ?? null,
      attribution: d.attribution ?? null,
      specs: d.specs ?? null,
      description: d.description ?? null,
      billing: d.billing ?? null,
    },
    published_at: item.published_at ?? null,
    updated_at: item.updated_at ?? null,
    first_seen_at: item.first_seen_at ?? null,
  };
}

/** A FindHost register row or an OpenServer provider row. */
export function itemToProvider(item) {
  const d = item.data ?? {};
  const facets = d.facets ?? {};
  const dev = item.enrichment?.developer ?? {};
  const og = item.enrichment?.opengraph ?? {};
  const isOpenServer = item.source === 'openserver' || Boolean(d.openserver);
  const slug = String(d.provider ?? d.findhostId ?? domainOf(item.url) ?? item.id).toLowerCase();
  const web = str(d.web) ?? (isOpenServer ? str(item.url) : null);
  const domain =
    str(dev.domain) ?? (web ? domainOf(web) : null) ?? (isOpenServer ? domainOf(item.url) : null);
  const automation = [
    ...new Set(
      [
        ...(facets.automation ?? []),
        dev.cli ? 'cli' : null,
        dev.terraform ? 'terraform' : null,
        dev.api_docs ? 'api' : null,
        ...(item.tags ?? []).filter((t) => t === 'has-cli').map(() => 'cli'),
      ].filter(Boolean),
    ),
  ];
  return {
    slug,
    nichedb_id: Number(item.id),
    name: str(d.name) ?? str(item.title) ?? slug,
    domain,
    url: web ?? (domain ? `https://${domain}/` : str(item.url)),
    summary: str(item.summary) ?? str(og.description),
    image_url: str(item.image_url) ?? str(og.image),
    country: str(facets.hqCountry ?? d.country)?.toUpperCase() ?? null,
    regions: (facets.regions ?? []).map((c) => String(c).toUpperCase()),
    categories: (facets.category ?? []).map(String),
    features: (facets.features ?? []).map(String),
    runtimes: (facets.runtimes ?? []).map(String),
    automation,
    ownership: str(facets.ownership),
    price_from: str(facets.priceFrom),
    green: Boolean(d.greenWebId) || (item.tags ?? []).includes('green'),
    api_docs: str(dev.api_docs),
    cli: str(dev.cli),
    status_url: str(dev.status) ?? str(d.status),
    github: str(dev.github),
    terraform: str(dev.terraform),
    attribution: str(d.attribution),
    data: {
      facets,
      figure: d.figure ?? null,
      findhostId: d.findhostId ?? null,
      openserver: d.openserver ?? null,
      descriptor: d.descriptor ?? null,
      licence: d.licence ?? null,
      licenceUrl: d.licenceUrl ?? null,
      source: item.source,
      findhostUrl: item.source === 'findhost-providers' ? item.url : null,
    },
    updated_at: item.updated_at ?? null,
  };
}

/** A provider row invented for a storefront host the register does not know. */
export function providerFromServer(server) {
  return {
    slug: server.provider,
    nichedb_id: null,
    name: server.provider_name,
    domain: server.provider.includes('.') ? server.provider : null,
    url: server.provider.includes('.') ? `https://${server.provider}/` : server.url,
    summary: null,
    image_url: null,
    country: server.countries[0] ?? null,
    regions: server.countries,
    categories: [server.kind],
    features: [],
    runtimes: [],
    automation: [],
    ownership: null,
    price_from: null,
    green: false,
    api_docs: null,
    cli: null,
    status_url: null,
    github: null,
    terraform: null,
    attribution: server.data?.attribution ?? null,
    data: { source: server.source, platform: server.platform, inferred: true },
    updated_at: server.updated_at,
  };
}

export function itemToDeal(item) {
  return {
    nichedb_id: Number(item.id),
    title: str(item.title) ?? 'Untitled',
    url: str(item.url),
    summary: str(item.summary),
    image_url: str(item.image_url),
    source: str(item.source),
    published_at: item.published_at ?? null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    data: item.data ?? {},
  };
}

/** Helpers the views and the API share. */
export const ramGb = (mb) => (mb === null || mb === undefined ? null : round(Number(mb) / 1024, 2));
export const fmtGb = (gb) =>
  gb === null || gb === undefined
    ? null
    : gb >= 1000
      ? `${round(gb / 1000, 1)} TB`
      : `${round(gb, gb < 10 ? 1 : 0)} GB`;
export const fmtMoney = (n, currency = 'USD') => {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  const digits = v < 1 ? 3 : 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
};
