import { BUCKETS, KINDS, SORTS } from '@r4ck/core/facets';
import { pgArray, sql } from './index.js';

/**
 * The search: one filter vocabulary in, rows and facet counts out.
 *
 * Facet counts reflect the filters already applied, so each count says how
 * many results remain if that value is chosen next. That is what makes the
 * page a drill-down rather than a form: every click narrows, and a zero is
 * never offered.
 */

const norm = (f = {}) => ({
  q: String(f.q ?? '').trim(),
  kind: (f.kind ?? []).filter((k) => KINDS.includes(k)),
  provider: (f.provider ?? []).map((p) => String(p).toLowerCase()),
  country: (f.country ?? []).map((c) => String(c).toUpperCase()),
  has: (f.has ?? []).map((h) => String(h).toLowerCase()),
  ids: (f.ids ?? []).map(Number).filter(Number.isInteger),
  min_vcpu: f.min_vcpu ?? null,
  max_vcpu: f.max_vcpu ?? null,
  min_ram_mb: f.min_ram === undefined ? null : Math.round(f.min_ram * 1024),
  max_ram_mb: f.max_ram === undefined ? null : Math.round(f.max_ram * 1024),
  min_disk: f.min_disk ?? null,
  max_disk: f.max_disk ?? null,
  min_price: f.min_price ?? null,
  max_price: f.max_price ?? null,
  gpu: f.gpu === undefined ? null : Boolean(f.gpu),
  gpu_model: f.gpu_model ? String(f.gpu_model) : '',
  arch: f.arch ? String(f.arch).toLowerCase() : '',
  currency: f.currency ? String(f.currency).toUpperCase() : '',
  interval: f.interval ? String(f.interval).toLowerCase() : '',
  tenancy: f.tenancy ? String(f.tenancy).toLowerCase() : '',
  platform: f.platform ? String(f.platform).toLowerCase() : '',
  stock: f.stock ? String(f.stock).toLowerCase() : '',
  sort: SORTS.includes(f.sort) ? f.sort : f.q ? 'relevance' : 'price',
  order: f.order === 'desc' ? 'desc' : f.order === 'asc' ? 'asc' : null,
});

/** The WHERE every query shares, as boolean-guarded predicates. */
const where = (n) => sql`
  (${n.ids.length === 0} or s.id = any(${pgArray(n.ids)}::bigint[]))
  and (${n.q === ''} or s.search @@ websearch_to_tsquery('simple', ${n.q}) or s.name ilike ${`%${n.q}%`} or s.provider_name ilike ${`%${n.q}%`})
  and (${n.kind.length === 0} or s.kind = any(${pgArray(n.kind)}::text[]))
  and (${n.provider.length === 0} or s.provider = any(${pgArray(n.provider)}::text[]) or p.domain = any(${pgArray(n.provider)}::text[]) or lower(p.name) = any(${pgArray(n.provider)}::text[]))
  and (${n.country.length === 0} or s.countries && ${pgArray(n.country)}::text[])
  and (${n.has.length === 0} or p.automation @> ${pgArray(n.has)}::text[])
  and (${n.min_vcpu === null} or s.vcpu >= ${n.min_vcpu ?? 0})
  and (${n.max_vcpu === null} or s.vcpu < ${n.max_vcpu ?? 0})
  and (${n.min_ram_mb === null} or s.ram_mb >= ${n.min_ram_mb ?? 0})
  and (${n.max_ram_mb === null} or s.ram_mb < ${n.max_ram_mb ?? 0})
  and (${n.min_disk === null} or s.disk_gb >= ${n.min_disk ?? 0})
  and (${n.max_disk === null} or s.disk_gb < ${n.max_disk ?? 0})
  and (${n.min_price === null} or s.monthly_usd >= ${n.min_price ?? 0})
  and (${n.max_price === null} or s.monthly_usd < ${n.max_price ?? 0})
  and (${n.gpu === null} or (s.gpu_model is not null or s.kind = 'gpu') = ${n.gpu ?? false})
  and (${n.gpu_model === ''} or s.gpu_model ilike ${`%${n.gpu_model}%`})
  and (${n.arch === ''} or s.arch = ${n.arch})
  and (${n.currency === ''} or s.currency = ${n.currency})
  and (${n.interval === ''} or s.interval = ${n.interval})
  and (${n.tenancy === ''} or s.tenancy = ${n.tenancy})
  and (${n.platform === ''} or s.platform = ${n.platform})
  and (${n.stock === ''} or s.stock = ${n.stock})
`;

const FROM = sql`from servers s left join providers p on p.slug = s.provider`;

export const SELECT_ROW = sql`
  s.id, s.nichedb_id, s.external_id, s.provider, s.provider_name, s.name, s.url, s.kind, s.tenancy, s.management,
  s.vcpu, s.cores, s.ram_mb, s.arch, s.gpu_model, s.gpu_count, s.gpu_vram_mb, s.disk_gb, s.disk_type,
  s.bandwidth_mbps, s.transfer_gb, s.ipv4, s.ipv6, s.price, s.currency, s.interval, s.setup, s.commitment,
  s.monthly_usd, s.hourly_usd, s.regions, s.countries, s.stock, s.platform, s."group", s.source, s.summary, s.tags,
  s.updated_at, s.first_seen_at, s.synced_at, p.automation as provider_automation, p.domain as provider_domain,
  p.country as provider_country
`;

export async function search(filters, { limit = 25, offset = 0 } = {}) {
  const n = norm(filters);
  const lim = Math.min(Math.max(1, Number(limit) || 25), 500);
  const off = Math.min(Math.max(0, Number(offset) || 0), 100_000);
  const desc =
    n.order === 'desc' || (n.order === null && ['ram', 'vcpu', 'disk', 'updated'].includes(n.sort));
  const rows = await sql`
    select ${SELECT_ROW}, count(*) over() as total,
      case when ${n.q !== ''} then ts_rank(s.search, websearch_to_tsquery('simple', ${n.q || 'x'})) else 0 end as rank,
      case when s.monthly_usd > 0 and (coalesce(s.vcpu, 0) + coalesce(s.ram_mb, 0) / 1024.0) > 0
        then s.monthly_usd / (coalesce(s.vcpu, 0) + coalesce(s.ram_mb, 0) / 1024.0) end as usd_per_unit
    ${FROM}
    where ${where(n)}
    order by
      case when ${n.sort === 'relevance'} then ts_rank(s.search, websearch_to_tsquery('simple', ${n.q || 'x'})) end desc,
      case when ${n.sort === 'price' && !desc} then s.monthly_usd end asc nulls last,
      case when ${n.sort === 'price' && desc} then s.monthly_usd end desc nulls last,
      case when ${n.sort === 'value'} then (case when s.monthly_usd > 0 and (coalesce(s.vcpu, 0) + coalesce(s.ram_mb, 0) / 1024.0) > 0 then s.monthly_usd / (coalesce(s.vcpu, 0) + coalesce(s.ram_mb, 0) / 1024.0) end) end asc nulls last,
      case when ${n.sort === 'ram' && desc} then s.ram_mb end desc nulls last,
      case when ${n.sort === 'ram' && !desc} then s.ram_mb end asc nulls last,
      case when ${n.sort === 'vcpu' && desc} then s.vcpu end desc nulls last,
      case when ${n.sort === 'vcpu' && !desc} then s.vcpu end asc nulls last,
      case when ${n.sort === 'disk' && desc} then s.disk_gb end desc nulls last,
      case when ${n.sort === 'disk' && !desc} then s.disk_gb end asc nulls last,
      case when ${n.sort === 'updated'} then s.updated_at end desc nulls last,
      case when ${n.sort === 'name'} then s.name end asc,
      s.monthly_usd asc nulls last, s.id asc
    limit ${lim} offset ${off}
  `;
  const total = rows.length ? Number(rows[0].total) : await count(n);
  return {
    total,
    limit: lim,
    offset: off,
    sort: n.sort,
    order: n.order ?? (desc ? 'desc' : 'asc'),
    servers: rows.map(({ total: _t, rank: _r, ...r }) => r),
  };
}

async function count(n) {
  const [row] = await sql`select count(*)::int as n ${FROM} where ${where(n)}`;
  return row.n;
}

const bucketCase = (col, buckets) => {
  const parts = buckets.map(
    (b) => `when ${col} >= ${b.lo}${b.hi === null ? '' : ` and ${col} < ${b.hi}`} then '${b.key}'`,
  );
  return `case ${parts.join(' ')} end`;
};
const VCPU_CASE = bucketCase('vcpu', BUCKETS.vcpu);
const RAM_CASE = bucketCase('(ram_mb / 1024.0)', BUCKETS.ram);
const PRICE_CASE = bucketCase('monthly_usd', BUCKETS.price);
const DISK_CASE = bucketCase('disk_gb', BUCKETS.disk);

/** Counts per facet value over the filtered set, in one round trip. */
export async function facets(filters) {
  const n = norm(filters);
  const rows = await sql`
    with base as (
      select s.id, s.kind, s.provider, s.provider_name, s.countries, s.currency, s.arch, s.interval, s.tenancy,
        s.platform, s.stock, s.vcpu, s.ram_mb, s.disk_gb, s.monthly_usd,
        (s.gpu_model is not null or s.kind = 'gpu') as has_gpu, p.automation
      ${FROM} where ${where(n)}
    )
    select 'kind' as facet, kind as value, null::text as label, count(*)::int as n from base group by kind
    union all select 'provider', provider, min(provider_name), count(*)::int from base group by provider
    union all select 'country', c, null, count(*)::int from base, unnest(countries) c group by c
    union all select 'has', a, null, count(*)::int from base, unnest(automation) a group by a
    union all select 'currency', currency, null, count(*)::int from base where currency is not null group by currency
    union all select 'arch', arch, null, count(*)::int from base where arch is not null group by arch
    union all select 'interval', interval, null, count(*)::int from base where interval is not null group by interval
    union all select 'tenancy', tenancy, null, count(*)::int from base where tenancy is not null group by tenancy
    union all select 'platform', platform, null, count(*)::int from base where platform is not null group by platform
    union all select 'stock', stock, null, count(*)::int from base where stock is not null group by stock
    union all select 'gpu', case when has_gpu then '1' else '0' end, null, count(*)::int from base group by has_gpu
    union all select 'vcpu', ${sql.unsafe(VCPU_CASE)}, null, count(*)::int from base where vcpu is not null group by 2
    union all select 'ram', ${sql.unsafe(RAM_CASE)}, null, count(*)::int from base where ram_mb is not null group by 2
    union all select 'price', ${sql.unsafe(PRICE_CASE)}, null, count(*)::int from base where monthly_usd is not null group by 2
    union all select 'disk', ${sql.unsafe(DISK_CASE)}, null, count(*)::int from base where disk_gb is not null group by 2
  `;
  const out = {};
  for (const r of rows) {
    if (r.value === null) continue;
    (out[r.facet] ??= []).push({ value: r.value, label: r.label ?? undefined, count: r.n });
  }
  for (const [facet, list] of Object.entries(out)) {
    const order = BUCKETS[facet]?.map((b) => b.key);
    list.sort(
      order
        ? (a, b) => order.indexOf(a.value) - order.indexOf(b.value)
        : (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)),
    );
    if (!order && list.length > 40) out[facet] = list.slice(0, 40);
  }
  return out;
}

/** Cheapest rows meeting a spec, with the value score spelled out. */
export async function cheapest(filters, { limit = 10 } = {}) {
  const r = await search({ ...filters, sort: 'price', order: 'asc' }, { limit });
  return r;
}
