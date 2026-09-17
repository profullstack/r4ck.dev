import { jsonb, pgArray, sql, withJson } from './index.js';

/**
 * Writes from the sync worker and the reads every page and tool share.
 * Upserts are keyed on the NicheDB id, so a re-sync is idempotent and a
 * price change lands a row in price_points.
 */

const arr = (v) => `${pgArray(v ?? [])}`;
const json = (v) => JSON.stringify(v ?? {});

export async function upsertProvider(p, { overwriteInferred = true } = {}) {
  const [row] = await sql`
    insert into providers (slug, nichedb_id, name, domain, url, summary, image_url, country, regions, categories,
      features, runtimes, automation, ownership, price_from, green, api_docs, cli, status_url, github, terraform,
      attribution, data, updated_at, synced_at)
    values (${p.slug}, ${p.nichedb_id}, ${p.name}, ${p.domain}, ${p.url}, ${p.summary}, ${p.image_url}, ${p.country},
      ${arr(p.regions)}::text[], ${arr(p.categories)}::text[], ${arr(p.features)}::text[], ${arr(p.runtimes)}::text[],
      ${arr(p.automation)}::text[], ${p.ownership}, ${p.price_from}, ${p.green}, ${p.api_docs}, ${p.cli}, ${p.status_url},
      ${p.github}, ${p.terraform}, ${p.attribution}, ${json(p.data)}::jsonb, ${p.updated_at}, now())
    on conflict (slug) do update set
      nichedb_id = coalesce(excluded.nichedb_id, providers.nichedb_id),
      name = case when ${overwriteInferred} or (providers.data->>'inferred') = 'true' then excluded.name else providers.name end,
      domain = coalesce(excluded.domain, providers.domain),
      url = coalesce(excluded.url, providers.url),
      summary = coalesce(excluded.summary, providers.summary),
      image_url = coalesce(excluded.image_url, providers.image_url),
      country = coalesce(excluded.country, providers.country),
      regions = case when cardinality(excluded.regions) > 0 then excluded.regions else providers.regions end,
      categories = case when cardinality(excluded.categories) > 0 then excluded.categories else providers.categories end,
      features = case when cardinality(excluded.features) > 0 then excluded.features else providers.features end,
      runtimes = case when cardinality(excluded.runtimes) > 0 then excluded.runtimes else providers.runtimes end,
      automation = case when cardinality(excluded.automation) > 0 then excluded.automation else providers.automation end,
      ownership = coalesce(excluded.ownership, providers.ownership),
      price_from = coalesce(excluded.price_from, providers.price_from),
      green = excluded.green or providers.green,
      api_docs = coalesce(excluded.api_docs, providers.api_docs),
      cli = coalesce(excluded.cli, providers.cli),
      status_url = coalesce(excluded.status_url, providers.status_url),
      github = coalesce(excluded.github, providers.github),
      terraform = coalesce(excluded.terraform, providers.terraform),
      attribution = coalesce(excluded.attribution, providers.attribution),
      data = case when (excluded.data->>'inferred') = 'true' and (providers.data->>'inferred') is distinct from 'true' then providers.data else providers.data || excluded.data end,
      updated_at = greatest(excluded.updated_at, providers.updated_at),
      synced_at = now()
    returning slug, (xmax = 0) as created
  `;
  return row;
}

/** Storefront hosts name themselves by domain; the register knows some of them. */
export async function providerSlugForDomain(domain) {
  const [row] =
    await sql`select slug from providers where domain = ${domain} or slug = ${domain} limit 1`;
  return row?.slug ?? null;
}

export async function upsertServer(s) {
  const [row] = await sql`
    insert into servers (nichedb_id, external_id, provider, provider_name, name, url, kind, tenancy, management, model,
      vcpu, cores, ram_mb, arch, gpu_model, gpu_count, gpu_vram_mb, disk_gb, disk_type, bandwidth_mbps, transfer_gb,
      ipv4, ipv6, price, currency, interval, setup, commitment, monthly_usd, hourly_usd, regions, countries, stock,
      platform, "group", source, summary, tags, data, published_at, updated_at, first_seen_at, synced_at)
    values (${s.nichedb_id}, ${s.external_id}, ${s.provider}, ${s.provider_name}, ${s.name}, ${s.url}, ${s.kind},
      ${s.tenancy}, ${s.management}, ${s.model}, ${s.vcpu}, ${s.cores}, ${s.ram_mb}, ${s.arch}, ${s.gpu_model},
      ${s.gpu_count}, ${s.gpu_vram_mb}, ${s.disk_gb}, ${s.disk_type}, ${s.bandwidth_mbps}, ${s.transfer_gb}, ${s.ipv4},
      ${s.ipv6}, ${s.price}, ${s.currency}, ${s.interval}, ${s.setup}, ${s.commitment}, ${s.monthly_usd}, ${s.hourly_usd},
      ${arr(s.regions)}::text[], ${arr(s.countries)}::text[], ${s.stock}, ${s.platform}, ${s.group}, ${s.source},
      ${s.summary}, ${arr(s.tags)}::text[], ${json(s.data)}::jsonb, ${s.published_at}, ${s.updated_at}, ${s.first_seen_at}, now())
    on conflict (nichedb_id) do update set
      external_id = excluded.external_id, provider = excluded.provider, provider_name = excluded.provider_name,
      name = excluded.name, url = excluded.url, kind = excluded.kind, tenancy = excluded.tenancy,
      management = excluded.management, model = excluded.model, vcpu = excluded.vcpu, cores = excluded.cores,
      ram_mb = excluded.ram_mb, arch = excluded.arch, gpu_model = excluded.gpu_model, gpu_count = excluded.gpu_count,
      gpu_vram_mb = excluded.gpu_vram_mb, disk_gb = excluded.disk_gb, disk_type = excluded.disk_type,
      bandwidth_mbps = excluded.bandwidth_mbps, transfer_gb = excluded.transfer_gb, ipv4 = excluded.ipv4,
      ipv6 = excluded.ipv6, price = excluded.price, currency = excluded.currency, interval = excluded.interval,
      setup = excluded.setup, commitment = excluded.commitment, monthly_usd = excluded.monthly_usd,
      hourly_usd = excluded.hourly_usd, regions = excluded.regions, countries = excluded.countries,
      stock = excluded.stock, platform = excluded.platform, "group" = excluded."group", source = excluded.source,
      summary = excluded.summary, tags = excluded.tags, data = excluded.data, published_at = excluded.published_at,
      updated_at = excluded.updated_at, first_seen_at = coalesce(servers.first_seen_at, excluded.first_seen_at),
      synced_at = now()
    returning id, (xmax = 0) as created,
      (select monthly_usd from price_points pp where pp.server_id = servers.id order by seen_at desc limit 1) as last_monthly
  `;
  const changed = row.created || Number(row.last_monthly ?? -1) !== Number(s.monthly_usd ?? -1);
  if (changed) {
    await sql`
      insert into price_points (server_id, seen_at, price, currency, monthly_usd)
      values (${row.id}, now(), ${s.price}, ${s.currency}, ${s.monthly_usd})
      on conflict do nothing
    `;
  }
  return { id: row.id, created: row.created, priceChanged: !row.created && changed };
}

export async function upsertDeal(d) {
  await sql`
    insert into deals (nichedb_id, title, url, summary, image_url, source, published_at, tags, data, synced_at)
    values (${d.nichedb_id}, ${d.title}, ${d.url}, ${d.summary}, ${d.image_url}, ${d.source}, ${d.published_at},
      ${arr(d.tags)}::text[], ${json(d.data)}::jsonb, now())
    on conflict (nichedb_id) do update set title = excluded.title, url = excluded.url, summary = excluded.summary,
      image_url = excluded.image_url, published_at = excluded.published_at, tags = excluded.tags, data = excluded.data,
      synced_at = now()
  `;
}

export async function getSyncState(key) {
  const [row] = await sql`select value from sync_state where key = ${key}`;
  return row ? jsonb(row.value, null) : null;
}

export async function setSyncState(key, value) {
  await sql`
    insert into sync_state (key, value, updated_at) values (${key}, ${json(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

/* ---------------------------------------------------------------- reads -- */

export async function stats() {
  const [row] = await sql`
    select
      (select count(*)::int from servers) as servers,
      (select count(*)::int from providers) as providers,
      (select count(distinct c)::int from servers, unnest(countries) c) as countries,
      (select count(*)::int from servers where gpu_model is not null or kind = 'gpu') as gpu_servers,
      (select count(*)::int from deals) as deals,
      (select min(monthly_usd) from servers where monthly_usd > 0) as cheapest_usd,
      (select max(synced_at) from servers) as synced_at,
      (select count(*)::int from servers where synced_at > now() - interval '1 day') as synced_today,
      (select count(*)::int from price_points where seen_at > now() - interval '7 days') as price_moves_week
  `;
  return row;
}

export async function getServer(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  const [row] = await sql`
    select s.*, p.name as provider_display, p.domain as provider_domain, p.automation as provider_automation,
      p.country as provider_country, p.api_docs, p.cli as provider_cli, p.status_url, p.url as provider_url
    from servers s left join providers p on p.slug = s.provider
    where s.id = ${n} or s.nichedb_id = ${n}
    limit 1
  `;
  return row ? withJson([row])[0] : null;
}

export async function getServers(ids) {
  const clean = [...new Set(ids.map(Number).filter(Number.isInteger))].slice(0, 20);
  if (clean.length === 0) return [];
  const rows = await sql`
    select s.*, p.name as provider_display, p.automation as provider_automation
    from servers s left join providers p on p.slug = s.provider
    where s.id = any(${pgArray(clean)}::bigint[])
  `;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return clean.map((id) => byId.get(id)).filter(Boolean);
}

export async function priceHistory(serverId, limit = 60) {
  return sql`
    select seen_at, price, currency, monthly_usd from price_points
    where server_id = ${Number(serverId)} order by seen_at desc limit ${limit}
  `;
}

/** Same kind, same provider or nearest specs, priced. */
export async function similarServers(server, limit = 6) {
  return sql`
    select s.id, s.name, s.provider, s.provider_name, s.kind, s.vcpu, s.ram_mb, s.disk_gb, s.monthly_usd, s.price,
      s.currency, s.interval, s.countries, s.gpu_model
    from servers s
    where s.id <> ${Number(server.id)} and s.kind = ${server.kind} and s.monthly_usd is not null
      and (${server.vcpu === null} or s.vcpu between ${(server.vcpu ?? 0) - 1} and ${(server.vcpu ?? 0) + 1})
      and (${server.ram_mb === null} or s.ram_mb between ${Math.floor((server.ram_mb ?? 0) * 0.5)} and ${Math.ceil((server.ram_mb ?? 0) * 2)})
    order by abs(coalesce(s.monthly_usd, 0) - ${Number(server.monthly_usd ?? 0)}), s.provider = ${server.provider} desc
    limit ${limit}
  `;
}

export async function getProvider(slug) {
  const [row] = await sql`
    select p.*,
      (select count(*)::int from servers s where s.provider = p.slug) as server_count,
      (select min(monthly_usd) from servers s where s.provider = p.slug and monthly_usd > 0) as from_usd,
      (select array_agg(distinct kind) from servers s where s.provider = p.slug) as kinds
    from providers p where p.slug = ${String(slug).toLowerCase()} or p.domain = ${String(slug).toLowerCase()}
    limit 1
  `;
  return row ? withJson([row])[0] : null;
}

export async function providerServers(slug, { limit = 200 } = {}) {
  return sql`
    select id, name, kind, vcpu, ram_mb, disk_gb, disk_type, gpu_model, monthly_usd, price, currency, interval,
      countries, stock, url, platform, updated_at
    from servers where provider = ${slug}
    order by monthly_usd asc nulls last, name limit ${limit}
  `;
}

export async function listProviders({
  q = '',
  has = [],
  country = [],
  category = [],
  runtime = [],
  green = null,
  limit = 100,
  offset = 0,
  sort = 'name',
} = {}) {
  const rows = await sql`
    select p.slug, p.name, p.domain, p.url, p.summary, p.image_url, p.country, p.regions, p.categories, p.features,
      p.runtimes, p.automation, p.ownership, p.price_from, p.green, p.api_docs, p.cli, p.status_url, p.github,
      p.terraform, p.attribution, p.updated_at, p.data->>'source' as source,
      count(*) over() as total,
      (select count(*)::int from servers s where s.provider = p.slug) as server_count,
      (select min(monthly_usd) from servers s where s.provider = p.slug and monthly_usd > 0) as from_usd
    from providers p
    where (${q === ''} or p.search @@ websearch_to_tsquery('simple', ${q}) or p.name ilike ${`%${q}%`} or p.domain ilike ${`%${q}%`})
      and (${has.length === 0} or p.automation @> ${pgArray(has)}::text[])
      and (${country.length === 0} or p.country = any(${pgArray(country)}::text[]) or p.regions && ${pgArray(country)}::text[])
      and (${category.length === 0} or p.categories && ${pgArray(category)}::text[])
      and (${runtime.length === 0} or p.runtimes && ${pgArray(runtime)}::text[])
      and (${green === null} or p.green = ${Boolean(green)})
    order by
      case when ${sort === 'servers'} then (select count(*) from servers s where s.provider = p.slug) end desc nulls last,
      case when ${sort === 'price'} then (select min(monthly_usd) from servers s where s.provider = p.slug and monthly_usd > 0) end asc nulls last,
      (p.data->>'inferred') = 'true' asc, p.name asc
    limit ${Math.min(Math.max(1, limit), 500)} offset ${Math.max(0, offset)}
  `;
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    providers: rows.map(({ total: _t, ...r }) => r),
  };
}

export async function providerFacets() {
  const rows = await sql`
    select 'automation' as facet, a as value, count(*)::int as n from providers, unnest(automation) a group by a
    union all select 'category', c, count(*)::int from providers, unnest(categories) c group by c
    union all select 'country', country, count(*)::int from providers where country is not null group by country
    union all select 'runtime', r, count(*)::int from providers, unnest(runtimes) r group by r
    order by 1, 3 desc
  `;
  const out = {};
  for (const r of rows) (out[r.facet] ??= []).push({ value: r.value, count: r.n });
  return out;
}

export async function listDeals({ limit = 50 } = {}) {
  return withJson(
    await sql`select * from deals order by published_at desc nulls last limit ${Math.min(limit, 200)}`,
  );
}
