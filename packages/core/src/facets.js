/**
 * The one vocabulary every surface speaks: the web page, /api/v1/search,
 * the CLI flags and the MCP tool arguments all use these parameter names,
 * so a query copied from the address bar runs unchanged as a curl.
 */
export const KINDS = [
  'vps',
  'cloud',
  'dedicated',
  'bare-metal',
  'gpu',
  'shared',
  'managed',
  'paas',
  'serverless',
  'storage',
  'colocation',
  'edge',
  'p2p',
  'hybrid',
  'on-prem',
];

export const KIND_LABELS = {
  vps: 'VPS',
  cloud: 'Cloud',
  dedicated: 'Dedicated',
  'bare-metal': 'Bare metal',
  gpu: 'GPU',
  shared: 'Shared',
  managed: 'Managed',
  paas: 'PaaS',
  serverless: 'Serverless',
  storage: 'Storage',
  colocation: 'Colocation',
  edge: 'Edge',
  p2p: 'P2P',
  hybrid: 'Hybrid',
  'on-prem': 'On-prem',
};

export const SORTS = ['relevance', 'price', 'value', 'ram', 'vcpu', 'disk', 'updated', 'name'];

/** Half-open buckets [lo, hi). `hi` null is unbounded. */
export const BUCKETS = {
  vcpu: [
    { key: '1', label: '1 vCPU', lo: 1, hi: 2 },
    { key: '2', label: '2 vCPU', lo: 2, hi: 3 },
    { key: '3-4', label: '3 to 4', lo: 3, hi: 5 },
    { key: '5-8', label: '5 to 8', lo: 5, hi: 9 },
    { key: '9-16', label: '9 to 16', lo: 9, hi: 17 },
    { key: '17-32', label: '17 to 32', lo: 17, hi: 33 },
    { key: '33+', label: '33 or more', lo: 33, hi: null },
  ],
  ram: [
    { key: '<1', label: 'under 1 GB', lo: 0, hi: 1 },
    { key: '1', label: '1 GB', lo: 1, hi: 2 },
    { key: '2', label: '2 GB', lo: 2, hi: 4 },
    { key: '4', label: '4 GB', lo: 4, hi: 8 },
    { key: '8', label: '8 GB', lo: 8, hi: 16 },
    { key: '16', label: '16 GB', lo: 16, hi: 32 },
    { key: '32', label: '32 GB', lo: 32, hi: 64 },
    { key: '64', label: '64 GB', lo: 64, hi: 128 },
    { key: '128+', label: '128 GB or more', lo: 128, hi: null },
  ],
  price: [
    { key: 'free', label: 'Free', lo: 0, hi: 0.005 },
    { key: '<5', label: 'under $5', lo: 0.005, hi: 5 },
    { key: '5-10', label: '$5 to $10', lo: 5, hi: 10 },
    { key: '10-25', label: '$10 to $25', lo: 10, hi: 25 },
    { key: '25-50', label: '$25 to $50', lo: 25, hi: 50 },
    { key: '50-100', label: '$50 to $100', lo: 50, hi: 100 },
    { key: '100-500', label: '$100 to $500', lo: 100, hi: 500 },
    { key: '500+', label: '$500 or more', lo: 500, hi: null },
  ],
  disk: [
    { key: '<50', label: 'under 50 GB', lo: 0, hi: 50 },
    { key: '50-100', label: '50 to 100 GB', lo: 50, hi: 100 },
    { key: '100-250', label: '100 to 250 GB', lo: 100, hi: 250 },
    { key: '250-1000', label: '250 GB to 1 TB', lo: 250, hi: 1000 },
    { key: '1000+', label: '1 TB or more', lo: 1000, hi: null },
  ],
};

/** Facets the search answers with counts, in the order the page shows them. */
export const FACETS = [
  { name: 'kind', label: 'Kind', param: 'kind', multi: true },
  {
    name: 'price',
    label: 'Price per month (USD est.)',
    bucket: 'price',
    min: 'min_price',
    max: 'max_price',
  },
  { name: 'vcpu', label: 'vCPU', bucket: 'vcpu', min: 'min_vcpu', max: 'max_vcpu' },
  { name: 'ram', label: 'Memory', bucket: 'ram', min: 'min_ram', max: 'max_ram' },
  { name: 'disk', label: 'Disk', bucket: 'disk', min: 'min_disk', max: 'max_disk' },
  { name: 'gpu', label: 'GPU', param: 'gpu' },
  { name: 'country', label: 'Country', param: 'country', multi: true },
  { name: 'provider', label: 'Provider', param: 'provider', multi: true },
  { name: 'has', label: 'Provider automation', param: 'has', multi: true },
  { name: 'arch', label: 'Architecture', param: 'arch' },
  { name: 'currency', label: 'Billed in', param: 'currency' },
  { name: 'interval', label: 'Billing term', param: 'interval' },
  { name: 'tenancy', label: 'Tenancy', param: 'tenancy' },
  { name: 'platform', label: 'Storefront', param: 'platform' },
  { name: 'stock', label: 'Stock', param: 'stock' },
];

export const LIST_PARAMS = ['kind', 'provider', 'country', 'has', 'ids'];
export const NUMBER_PARAMS = [
  'min_vcpu',
  'max_vcpu',
  'min_ram',
  'max_ram',
  'min_disk',
  'max_disk',
  'min_price',
  'max_price',
  'limit',
  'offset',
];
export const STRING_PARAMS = [
  'q',
  'currency',
  'arch',
  'gpu_model',
  'interval',
  'tenancy',
  'platform',
  'stock',
  'sort',
  'order',
  'gpu',
  'region',
];
export const ALL_PARAMS = [...LIST_PARAMS, ...NUMBER_PARAMS, ...STRING_PARAMS];

const csv = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);

/**
 * Filters from anything that looks like query parameters: a URLSearchParams,
 * a plain object (MCP arguments, CLI flags) or a query string.
 */
export function filtersFrom(input) {
  const get = (k) => {
    if (input instanceof URLSearchParams)
      return input.getAll(k).length > 1 ? input.getAll(k) : input.get(k);
    if (typeof input === 'string') return new URLSearchParams(input).get(k);
    return input?.[k] ?? input?.[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  };
  const f = {};
  for (const k of LIST_PARAMS) {
    const v = get(k);
    if (v !== undefined && v !== null && v !== '')
      f[k] = csv(v).map((s) => (k === 'country' ? s.toUpperCase() : s.toLowerCase()));
  }
  for (const k of NUMBER_PARAMS) {
    const v = get(k);
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) f[k] = Number(v);
  }
  for (const k of STRING_PARAMS) {
    const v = get(k);
    if (v !== undefined && v !== null && String(v).trim() !== '') f[k] = String(v).trim();
  }
  if (f.gpu !== undefined)
    f.gpu = ['1', 'true', 'yes', 'gpu'].includes(String(f.gpu).toLowerCase())
      ? true
      : ['0', 'false', 'no'].includes(String(f.gpu).toLowerCase())
        ? false
        : undefined;
  if (f.gpu === undefined) delete f.gpu;
  if (f.sort && !SORTS.includes(f.sort)) delete f.sort;
  if (f.order && !['asc', 'desc'].includes(f.order)) delete f.order;
  if (f.currency) f.currency = f.currency.toUpperCase();
  return f;
}

/** The canonical query string for a filter set: stable order, nothing empty. */
export function paramsFrom(filters) {
  const p = new URLSearchParams();
  for (const k of ALL_PARAMS) {
    const v = filters?.[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (k === 'gpu') p.set(k, v ? '1' : '0');
    else p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p;
}

/** Same filters with one value added or removed; used by every facet link. */
export function toggle(filters, param, value, { multi = true } = {}) {
  const next = { ...filters };
  delete next.offset;
  if (multi) {
    const cur = new Set(next[param] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    next[param] = [...cur];
    if (next[param].length === 0) delete next[param];
  } else if (String(next[param]) === String(value)) delete next[param];
  else next[param] = value;
  return next;
}

/** A bucket applied is a min and a max; applied again it comes off. */
export function toggleBucket(filters, facet, key) {
  const def = FACETS.find((f) => f.name === facet);
  const b = BUCKETS[def.bucket].find((x) => x.key === key);
  const next = { ...filters };
  delete next.offset;
  const on =
    next[def.min] === b.lo &&
    (b.hi === null ? next[def.max] === undefined : next[def.max] === b.hi);
  delete next[def.min];
  delete next[def.max];
  if (!on) {
    next[def.min] = b.lo;
    if (b.hi !== null) next[def.max] = b.hi;
  }
  return next;
}

export function bucketActive(filters, facet, key) {
  const def = FACETS.find((f) => f.name === facet);
  const b = BUCKETS[def.bucket].find((x) => x.key === key);
  return (
    filters[def.min] === b.lo &&
    (b.hi === null ? filters[def.max] === undefined : filters[def.max] === b.hi)
  );
}

/** Human chips for a filter set: what the query was understood as. */
export function describeFilters(f, { countryName = (c) => c } = {}) {
  const out = [];
  if (f.q) out.push({ param: 'q', label: `“${f.q}”` });
  for (const k of f.kind ?? []) out.push({ param: 'kind', value: k, label: KIND_LABELS[k] ?? k });
  if (f.min_vcpu !== undefined || f.max_vcpu !== undefined)
    out.push({ param: 'vcpu', label: range('vCPU', f.min_vcpu, f.max_vcpu) });
  if (f.min_ram !== undefined || f.max_ram !== undefined)
    out.push({ param: 'ram', label: range('RAM', f.min_ram, f.max_ram, 'GB') });
  if (f.min_disk !== undefined || f.max_disk !== undefined)
    out.push({ param: 'disk', label: range('disk', f.min_disk, f.max_disk, 'GB') });
  if (f.min_price !== undefined || f.max_price !== undefined)
    out.push({ param: 'price', label: range('$', f.min_price, f.max_price, '/mo', true) });
  if (f.gpu === true) out.push({ param: 'gpu', label: 'GPU' });
  if (f.gpu === false) out.push({ param: 'gpu', label: 'no GPU' });
  if (f.gpu_model) out.push({ param: 'gpu_model', label: `GPU ${f.gpu_model}` });
  if (f.region) out.push({ param: 'region', label: `in ${f.region}` });
  else
    for (const c of f.country ?? [])
      out.push({ param: 'country', value: c, label: countryName(c) });
  for (const p of f.provider ?? []) out.push({ param: 'provider', value: p, label: p });
  for (const h of f.has ?? [])
    out.push({ param: 'has', value: h, label: `provider has ${h.toUpperCase()}` });
  if (f.arch) out.push({ param: 'arch', label: f.arch });
  if (f.currency) out.push({ param: 'currency', label: `billed in ${f.currency}` });
  if (f.interval) out.push({ param: 'interval', label: `per ${f.interval}` });
  if (f.tenancy) out.push({ param: 'tenancy', label: f.tenancy });
  if (f.platform) out.push({ param: 'platform', label: f.platform });
  if (f.stock) out.push({ param: 'stock', label: f.stock });
  return out;
}

function range(what, lo, hi, unit = '', money = false) {
  const fmt = (n) => (money ? `$${n}` : `${n}${unit ? ` ${unit}` : ''}`);
  const tail = money ? unit : '';
  if (lo !== undefined && hi !== undefined)
    return `${what === '$' ? '' : `${what} `}${fmt(lo)} to ${fmt(hi)}${tail}`;
  if (lo !== undefined) return `${what === '$' ? '' : `${what} `}≥ ${fmt(lo)}${tail}`;
  return `${what === '$' ? '' : `${what} `}≤ ${fmt(hi)}${tail}`;
}

/** Drop one chip: the inverse of describeFilters for a single param. */
export function without(filters, param, value) {
  const next = { ...filters };
  delete next.offset;
  if (param === 'vcpu' || param === 'ram' || param === 'disk' || param === 'price') {
    delete next[`min_${param}`];
    delete next[`max_${param}`];
  } else if (Array.isArray(next[param]) && value !== undefined) {
    next[param] = next[param].filter((v) => v !== value);
    if (next[param].length === 0) delete next[param];
  } else delete next[param];
  if (param === 'region') delete next.country;
  return next;
}
