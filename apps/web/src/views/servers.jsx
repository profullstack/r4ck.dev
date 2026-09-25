import { config } from '@r4ck/config';
import { countryName, fmtGb, fmtMoney, paramsFrom, SORTS } from '@r4ck/core';
import { ago } from './home.jsx';
import { Layout } from './Layout.jsx';
import {
  AgentPanel,
  Automation,
  Chips,
  FacetRail,
  flag,
  KindBadge,
  Outbound,
  Pager,
  Price,
  Sparkline,
  Unit,
} from './parts.jsx';

const SORT_LABELS = {
  relevance: 'Relevance',
  price: 'Price',
  value: 'Value (USD per vCPU+GB)',
  ram: 'Memory',
  vcpu: 'vCPU',
  disk: 'Disk',
  updated: 'Recently updated',
  name: 'Name',
};

export function Servers({ user, result, page, params }) {
  const { query, chips, total, facets, servers, agent, limit } = result;
  const title = chips.length ? chips.map((c) => c.label).join(' · ') : 'All servers';
  return (
    <Layout
      user={user}
      path="/servers"
      wide
      title={`${title} (${total.toLocaleString()})`}
      description={`${total.toLocaleString()} server offers matching ${title}. Drill down by kind, price, vCPU, memory, disk, GPU, country and provider.`}
      canonical={`/servers?${paramsFrom(query)}`}
    >
      <div class="results-layout">
        <aside class="facets" id="facets">
          <div class="facets-head">
            <h2>Narrow it down</h2>
            <a class="button small ghost facets-close" href="#" data-close-facets>
              Done
            </a>
          </div>
          <FacetRail facets={facets} filters={query} />
        </aside>
        <section class="results">
          <header class="results-head">
            <div>
              <h1 class="results-title">
                {total.toLocaleString()} {total === 1 ? 'offer' : 'offers'}
              </h1>
              {result.understood?.length ? (
                <p class="muted small">Understood: {result.understood.join(', ')}</p>
              ) : null}
            </div>
            <form class="sort-form" method="get" action="/servers" data-autosubmit>
              {Object.entries(query).map(([k, v]) =>
                k === 'sort' || k === 'order' ? null : (
                  <input
                    type="hidden"
                    name={k}
                    value={
                      Array.isArray(v) ? v.join(',') : k === 'gpu' ? (v ? '1' : '0') : String(v)
                    }
                  />
                ),
              )}
              <label>
                <span class="visually-hidden">Sort</span>
                <select name="sort" aria-label="Sort by">
                  {SORTS.map((s) => (
                    <option value={s} selected={result.sort === s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" class="button ghost small filter-button" data-open-facets>
                Filters
              </button>
            </form>
          </header>
          <Chips chips={chips} filters={query} />
          {servers.length === 0 ? (
            <div class="empty">
              <p>
                Nothing matches every filter. Loosen one, or <a href="/servers">start over</a>.
              </p>
            </div>
          ) : (
            <div class="unit-list">
              {servers.map((s) => (
                <Unit s={s} />
              ))}
            </div>
          )}
          <Pager page={page} limit={limit} total={total} params={params} />
          <div class="compare-bar" data-compare-bar hidden>
            <span data-compare-count>0 selected</span>
            <a class="button primary small" href="/compare" data-compare-link>
              Compare
            </a>
            <button type="button" class="button ghost small" data-compare-clear>
              Clear
            </button>
          </div>
          {user ? (
            <form class="save-form" method="post" action="/api/saved">
              <input type="hidden" name="query" value={JSON.stringify(query)} />
              <input type="text" name="name" placeholder="Name this search" aria-label="Name" />
              <button type="submit" class="button ghost small">
                Save search
              </button>
            </form>
          ) : null}
          <AgentPanel agent={agent} />
        </section>
      </div>
    </Layout>
  );
}

export function Server({ user, detail }) {
  const { server: s, provider: p, price_history, similar } = detail;
  const gpu = s.compute.gpu;
  const rows = [
    ['Kind', <KindBadge kind={s.kind} />],
    ['vCPU', s.compute.vcpu ?? '·'],
    ['Cores', s.compute.cores ?? '·'],
    ['Memory', s.compute.ram_gb === null ? '·' : `${s.compute.ram_gb} GB`],
    ['Architecture', s.compute.arch ?? '·'],
    [
      'GPU',
      gpu
        ? `${gpu.count && gpu.count > 1 ? `${gpu.count}× ` : ''}${gpu.model ?? 'yes'}${gpu.vram_mb ? ` (${Math.round(gpu.vram_mb / 1024)} GB)` : ''}`
        : 'none',
    ],
    [
      'Disk',
      s.storage.disk_gb === null
        ? '·'
        : `${fmtGb(s.storage.disk_gb)}${s.storage.type ? ` ${s.storage.type}` : ''}`,
    ],
    ['Transfer', s.network.transfer_gb ? `${fmtGb(s.network.transfer_gb)} / mo` : '·'],
    ['Port', s.network.bandwidth_mbps ? `${s.network.bandwidth_mbps} Mbps` : '·'],
    [
      'IPv4 / IPv6',
      `${s.network.ipv4 ?? '·'} / ${s.network.ipv6 === null ? '·' : s.network.ipv6 ? 'yes' : 'no'}`,
    ],
    ['Tenancy', s.tenancy ?? '·'],
    ['Management', s.management ?? '·'],
    ['Setup fee', s.price.setup ? fmtMoney(s.price.setup, s.price.currency) : 'none'],
    ['Commitment', s.price.commitment ?? 'none'],
    ['Stock', s.stock ?? 'unknown'],
    ['Read from', s.platform ?? s.source],
  ];
  const agent = {
    url: `${config.siteUrl}/api/v1/servers/${s.id}`,
    curl: `curl -s '${config.siteUrl}/api/v1/servers/${s.id}'`,
    cli: `r4ck get ${s.id}`,
    mcpJson: JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_server', arguments: { id: s.id } },
      },
      null,
      2,
    ),
  };
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${s.provider.name} ${s.name}`,
    description: s.summary,
    brand: { '@type': 'Organization', name: s.provider.name },
    url: `${config.siteUrl}/servers/${s.id}`,
    offers:
      s.price.amount === null
        ? undefined
        : {
            '@type': 'Offer',
            price: s.price.amount,
            priceCurrency: s.price.currency,
            url: s.url,
            availability:
              s.stock === 'out_of_stock'
                ? 'https://schema.org/OutOfStock'
                : 'https://schema.org/InStock',
          },
  };
  return (
    <Layout
      user={user}
      path={`/servers/${s.id}`}
      title={`${s.provider.name} ${s.name}`}
      description={s.summary ?? `${s.provider.name} ${s.name}: ${s.kind} server offer.`}
      jsonld={jsonld}
    >
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/servers">Servers</a> ›{' '}
        <a href={`/providers/${s.provider.slug}`}>{s.provider.name}</a>
      </nav>
      <header class="detail-hero">
        <div>
          <h1>{s.name}</h1>
          <p class="detail-meta">
            <a href={`/providers/${s.provider.slug}`}>{s.provider.name}</a>{' '}
            <KindBadge kind={s.kind} />
            {s.location.countries.length ? (
              <span class="muted">
                {' '}
                · {s.location.countries.map((c) => `${flag(c.code)} ${c.name}`).join(', ')}
              </span>
            ) : null}
          </p>
          <p class="muted">{s.summary}</p>
        </div>
        <div class="detail-price">
          <Price price={s.price} big />
          {s.price.hourly_usd ? (
            <span class="muted small">≈ {fmtMoney(s.price.hourly_usd)}/hour</span>
          ) : null}
          <Outbound class="button primary" url={s.url} domain={s.provider.domain}>
            Order at {s.provider.domain ?? s.provider.name} ↗
          </Outbound>
          <label class="compare-toggle">
            <input type="checkbox" data-compare={s.id} />
            <span>Add to compare</span>
          </label>
        </div>
      </header>
      <div class="detail-grid">
        <section class="panel">
          <h2>Specification</h2>
          <dl class="spec-grid">
            {rows.map(([k, v]) => (
              <div class="spec-tile">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p class="muted small">
            Updated {ago(s.updated_at)} · first seen{' '}
            {s.first_seen_at ? new Date(s.first_seen_at).toISOString().slice(0, 10) : '·'} ·{' '}
            <a href={s.nichedb}>row on NicheDB</a>
          </p>
        </section>
        <section class="panel">
          <h2>Price history</h2>
          <Sparkline points={[...price_history].reverse()} />
          <ul class="history">
            {price_history.slice(0, 6).map((h) => (
              <li>
                <span class="mono">{new Date(h.at).toISOString().slice(0, 10)}</span>{' '}
                <span>{h.monthly_usd === null ? '·' : `${fmtMoney(h.monthly_usd)}/mo`}</span>{' '}
                <span class="muted small">
                  {h.amount === null ? '' : `${fmtMoney(h.amount, h.currency)} billed`}
                </span>
              </li>
            ))}
          </ul>
          {p ? (
            <>
              <h2>Provider</h2>
              <div class="provider-inline">
                <a href={`/providers/${p.slug}`}>
                  <strong>{p.name}</strong>
                </a>
                {p.country ? (
                  <span class="muted">
                    {' '}
                    {flag(p.country.code)} {p.country.name}
                  </span>
                ) : null}
                <p class="muted small">{p.summary}</p>
                <Automation list={p.automation} />
                <p class="links small">
                  {p.links.api_docs ? <a href={p.links.api_docs}>API docs</a> : null}
                  {p.links.cli ? <a href={p.links.cli}>CLI</a> : null}
                  {p.links.terraform ? <a href={p.links.terraform}>Terraform</a> : null}
                  {p.links.status ? <a href={p.links.status}>Status</a> : null}
                </p>
              </div>
            </>
          ) : null}
        </section>
      </div>
      {similar.length ? (
        <section class="section">
          <div class="section-head">
            <h2>Similar offers</h2>
          </div>
          <div class="unit-list">
            {similar.map((x) => (
              <Unit s={x} />
            ))}
          </div>
        </section>
      ) : null}
      <AgentPanel agent={agent} title="This offer as data" />
    </Layout>
  );
}

export function Compare({ user, result }) {
  const { servers } = result;
  const rows = [
    ['Provider', (s) => <a href={`/providers/${s.provider.slug}`}>{s.provider.name}</a>],
    ['Kind', (s) => <KindBadge kind={s.kind} />],
    ['Price / mo (est.)', (s) => <Price price={s.price} />],
    ['Hourly (est.)', (s) => (s.price.hourly_usd ? fmtMoney(s.price.hourly_usd) : '·')],
    ['vCPU', (s) => s.compute.vcpu ?? '·'],
    ['Memory', (s) => (s.compute.ram_gb === null ? '·' : `${s.compute.ram_gb} GB`)],
    [
      'Disk',
      (s) =>
        s.storage.disk_gb === null ? '·' : `${fmtGb(s.storage.disk_gb)} ${s.storage.type ?? ''}`,
    ],
    ['GPU', (s) => (s.compute.gpu ? (s.compute.gpu.model ?? 'yes') : '·')],
    ['Transfer', (s) => (s.network.transfer_gb ? fmtGb(s.network.transfer_gb) : '·')],
    ['Arch', (s) => s.compute.arch ?? '·'],
    [
      'Countries',
      (s) => s.location.countries.map((c) => `${flag(c.code)} ${c.code}`).join(' ') || '·',
    ],
    [
      'USD per vCPU+GB',
      (s) =>
        s.price.monthly_usd && (s.compute.vcpu || s.compute.ram_gb)
          ? fmtMoney(s.price.monthly_usd / ((s.compute.vcpu ?? 0) + (s.compute.ram_gb ?? 0)))
          : '·',
    ],
    ['Automation', (s) => <Automation list={s.provider.automation} />],
    [
      'Order',
      (s) =>
        s.url ? (
          <Outbound url={s.url} domain={s.provider.domain}>
            ↗
          </Outbound>
        ) : (
          '·'
        ),
    ],
  ];
  return (
    <Layout user={user} path="/compare" wide title="Compare servers">
      <header class="page-head">
        <h1>Compare</h1>
        <p class="muted">Tick "Compare" on any result to add it here. Up to 20 side by side.</p>
      </header>
      {servers.length === 0 ? (
        <div class="empty">
          <p>
            Nothing selected yet. <a href="/servers">Find some servers</a>.
          </p>
        </div>
      ) : (
        <div class="table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th></th>
                {servers.map((s) => (
                  <th>
                    <a href={`/servers/${s.id}`}>{s.name}</a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr>
                  <th scope="row">{label}</th>
                  {servers.map((s) => (
                    <td>{fn(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {servers.length ? (
        <AgentPanel
          agent={{
            url: result.agent.url,
            curl: `curl -s '${result.agent.url}'`,
            cli: result.agent.cli,
            mcpJson: JSON.stringify(
              {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'compare_servers', arguments: { ids: servers.map((s) => s.id) } },
              },
              null,
              2,
            ),
          }}
          title="This comparison as data"
        />
      ) : null}
    </Layout>
  );
}

void countryName;
