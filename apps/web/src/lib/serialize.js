import { config } from '@r4ck/config';
import { countryName, paramsFrom, ramGb } from '@r4ck/core';

/** The JSON shapes the API, the CLI and the MCP tools all return. */
export function serverOut(s) {
  if (!s) return null;
  return {
    id: Number(s.id),
    name: s.name,
    provider: {
      slug: s.provider,
      name: s.provider_display ?? s.provider_name,
      domain: s.provider_domain ?? null,
      automation: s.provider_automation ?? [],
      page: `${config.siteUrl}/providers/${s.provider}`,
    },
    kind: s.kind,
    tenancy: s.tenancy,
    management: s.management,
    compute: {
      vcpu: s.vcpu,
      cores: s.cores,
      ram_mb: s.ram_mb,
      ram_gb: ramGb(s.ram_mb),
      arch: s.arch,
      gpu: s.gpu_model ? { model: s.gpu_model, count: s.gpu_count, vram_mb: s.gpu_vram_mb } : null,
    },
    storage: { disk_gb: num(s.disk_gb), type: s.disk_type },
    network: {
      bandwidth_mbps: s.bandwidth_mbps,
      transfer_gb: num(s.transfer_gb),
      ipv4: s.ipv4,
      ipv6: s.ipv6,
    },
    price: {
      amount: num(s.price),
      currency: s.currency,
      interval: s.interval,
      setup: num(s.setup),
      commitment: s.commitment,
      monthly_usd: num(s.monthly_usd),
      hourly_usd: num(s.hourly_usd),
      estimate: s.currency !== 'USD' || s.interval !== 'month',
    },
    location: {
      regions: s.regions ?? [],
      countries: (s.countries ?? []).map((c) => ({ code: c, name: countryName(c) })),
    },
    stock: s.stock,
    platform: s.platform,
    group: s.group ?? null,
    source: s.source,
    summary: s.summary,
    tags: s.tags ?? [],
    url: s.url,
    updated_at: s.updated_at,
    first_seen_at: s.first_seen_at,
    synced_at: s.synced_at,
    nichedb: `${config.nichedb.url}/i/${s.nichedb_id}`,
    page: `${config.siteUrl}/servers/${s.id}`,
  };
}

export function providerOut(p) {
  if (!p) return null;
  return {
    slug: p.slug,
    name: p.name,
    domain: p.domain,
    url: p.url,
    summary: p.summary,
    image_url: p.image_url,
    country: p.country ? { code: p.country, name: countryName(p.country) } : null,
    regions: p.regions ?? [],
    categories: p.categories ?? [],
    features: p.features ?? [],
    runtimes: p.runtimes ?? [],
    automation: p.automation ?? [],
    ownership: p.ownership,
    price_from: p.price_from,
    green: Boolean(p.green),
    links: {
      api_docs: p.api_docs,
      cli: p.cli,
      status: p.status_url,
      github: p.github,
      terraform: p.terraform,
    },
    servers: p.server_count === undefined ? undefined : Number(p.server_count),
    from_usd: num(p.from_usd),
    kinds: p.kinds ?? undefined,
    attribution: p.attribution,
    source: p.source ?? p.data?.source ?? null,
    updated_at: p.updated_at,
    page: `${config.siteUrl}/providers/${p.slug}`,
  };
}

export function dealOut(d) {
  return {
    id: Number(d.nichedb_id),
    title: d.title,
    url: d.url,
    summary: d.summary,
    image_url: d.image_url,
    source: d.source,
    kind: d.data?.kind ?? 'deal',
    published_at: d.published_at,
    tags: d.tags ?? [],
  };
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * The same query, in every language a caller speaks. Shown under every
 * result page so a person can hand what they are looking at to an agent.
 */
export function agentViews(filters, { limit, offset } = {}) {
  const p = paramsFrom({ ...filters, ...(limit ? { limit } : {}), ...(offset ? { offset } : {}) });
  const qs = p.toString();
  const url = `${config.siteUrl}/api/v1/search${qs ? `?${qs}` : ''}`;
  const flags = [];
  for (const [k, v] of p) {
    if (k === 'q') continue;
    flags.push(`--${k.replace(/_/g, '-')} ${/[\s,]/.test(v) ? `"${v}"` : v}`);
  }
  const q = filters.q ? ` "${filters.q.replace(/"/g, '\\"')}"` : '';
  const args = {};
  for (const [k, v] of p)
    args[k] = [
      'limit',
      'offset',
      'min_vcpu',
      'max_vcpu',
      'min_ram',
      'max_ram',
      'min_disk',
      'max_disk',
      'min_price',
      'max_price',
    ].includes(k)
      ? Number(v)
      : k === 'gpu'
        ? v === '1'
        : ['kind', 'provider', 'country', 'has', 'ids'].includes(k)
          ? v.split(',')
          : v;
  return {
    url,
    html: `${config.siteUrl}/servers${qs ? `?${qs}` : ''}`,
    csv: `${config.siteUrl}/api/v1/search.csv${qs ? `?${qs}` : ''}`,
    curl: `curl -s '${url}' -H 'accept: application/json'`,
    cli: `r4ck search${q}${flags.length ? ` ${flags.join(' ')}` : ''}`,
    mcp: { tool: 'search_servers', arguments: args },
    mcpJson: JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_servers', arguments: args },
      },
      null,
      2,
    ),
  };
}
