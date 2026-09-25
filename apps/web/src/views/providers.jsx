import { config } from '@r4ck/config';
import { countryName, fmtMoney } from '@r4ck/core';
import { Layout } from './Layout.jsx';
import { AgentPanel, Automation, flag, initials, Outbound, ProviderCard, Unit } from './parts.jsx';

const csv = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function Providers({ user, result, params }) {
  const { providers, facets, total } = result;
  const has = csv(params.has);
  const category = csv(params.category);
  const country = csv(params.country).map((c) => c.toUpperCase());
  const link = (k, v) => {
    const p = new URLSearchParams(params);
    const cur = csv(p.get(k));
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (next.length) p.set(k, next.join(','));
    else p.delete(k);
    return `/providers?${p}`;
  };
  const agentUrl = `${config.siteUrl}/api/v1/providers${new URLSearchParams(params).toString() ? `?${new URLSearchParams(params)}` : ''}`;
  return (
    <Layout
      user={user}
      path="/providers"
      wide
      title={`Providers${has.length ? ` with ${has.map((h) => h.toUpperCase()).join(' + ')}` : ''}`}
      description="Hosting providers with their automation (API, CLI, Terraform, MCP), country, categories and runtimes."
    >
      <div class="results-layout">
        <aside class="facets" id="facets">
          <div class="facets-head">
            <h2>Narrow it down</h2>
            <a class="button small ghost facets-close" href="#" data-close-facets>
              Done
            </a>
          </div>
          <div class="facet-rail">
            <details class="facet-group" open>
              <summary>Automation</summary>
              <ul>
                {(facets.automation ?? []).map((f) => (
                  <li>
                    <a
                      class={`facet-item ${has.includes(f.value) ? 'on' : ''}`}
                      href={link('has', f.value)}
                      rel="nofollow"
                    >
                      <span class="facet-check"></span>
                      <span class="facet-label">{f.value.toUpperCase()}</span>
                      <span class="facet-count">{f.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <details class="facet-group" open>
              <summary>Category</summary>
              <ul>
                {(facets.category ?? []).slice(0, 20).map((f) => (
                  <li>
                    <a
                      class={`facet-item ${category.includes(f.value) ? 'on' : ''}`}
                      href={link('category', f.value)}
                      rel="nofollow"
                    >
                      <span class="facet-check"></span>
                      <span class="facet-label">{f.value.replace(/-/g, ' ')}</span>
                      <span class="facet-count">{f.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <details class="facet-group" open>
              <summary>Headquarters</summary>
              <ul>
                {(facets.country ?? []).slice(0, 30).map((f) => (
                  <li>
                    <a
                      class={`facet-item ${country.includes(f.value) ? 'on' : ''}`}
                      href={link('country', f.value)}
                      rel="nofollow"
                    >
                      <span class="facet-check"></span>
                      <span class="facet-label">
                        {flag(f.value)} {countryName(f.value)}
                      </span>
                      <span class="facet-count">{f.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <details class="facet-group">
              <summary>Runtime</summary>
              <ul>
                {(facets.runtime ?? []).slice(0, 20).map((f) => (
                  <li>
                    <a
                      class={`facet-item ${csv(params.runtime).includes(f.value) ? 'on' : ''}`}
                      href={link('runtime', f.value)}
                      rel="nofollow"
                    >
                      <span class="facet-check"></span>
                      <span class="facet-label">{f.value}</span>
                      <span class="facet-count">{f.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </aside>
        <section class="results">
          <header class="results-head">
            <div>
              <h1 class="results-title">{total} providers</h1>
              <p class="muted small">
                Register rows from FindHost (CC BY 4.0) plus every storefront the index reads plans
                from.
              </p>
            </div>
            <form class="sort-form" method="get" action="/providers" data-autosubmit>
              {Object.entries(params).map(([k, v]) =>
                k === 'sort' || k === 'q' ? null : <input type="hidden" name={k} value={v} />,
              )}
              <input
                type="search"
                name="q"
                value={params.q ?? ''}
                placeholder="Name or domain"
                aria-label="Filter providers"
              />
              <select name="sort" aria-label="Sort">
                <option value="name" selected={!params.sort || params.sort === 'name'}>
                  Name
                </option>
                <option value="servers" selected={params.sort === 'servers'}>
                  Most offers
                </option>
                <option value="price" selected={params.sort === 'price'}>
                  Lowest price
                </option>
              </select>
              <button type="button" class="button ghost small filter-button" data-open-facets>
                Filters
              </button>
            </form>
          </header>
          <div class="provider-grid">
            {providers.map((p) => (
              <ProviderCard p={p} />
            ))}
          </div>
          <AgentPanel
            agent={{
              url: agentUrl,
              curl: `curl -s '${agentUrl}'`,
              cli: `r4ck providers${has.length ? ` --has ${has.join(',')}` : ''}${country.length ? ` --country ${country.join(',')}` : ''}`,
              mcpJson: JSON.stringify(
                {
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/call',
                  params: {
                    name: 'list_providers',
                    arguments: {
                      ...(has.length ? { has } : {}),
                      ...(country.length ? { country } : {}),
                      ...(category.length ? { category } : {}),
                    },
                  },
                },
                null,
                2,
              ),
            }}
          />
        </section>
      </div>
    </Layout>
  );
}

export function Provider({ user, detail }) {
  const { provider: p, servers } = detail;
  const agent = {
    url: `${config.siteUrl}/api/v1/providers/${p.slug}`,
    curl: `curl -s '${config.siteUrl}/api/v1/providers/${p.slug}'`,
    cli: `r4ck provider ${p.slug}`,
    mcpJson: JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_provider', arguments: { slug: p.slug } },
      },
      null,
      2,
    ),
  };
  const facts = [
    ['Headquarters', p.country ? `${flag(p.country.code)} ${p.country.name}` : '·'],
    ['Regions', p.regions.length ? p.regions.map((r) => `${flag(r)} ${r}`).join(' ') : '·'],
    [
      'Categories',
      p.categories.length ? p.categories.map((c) => c.replace(/-/g, ' ')).join(', ') : '·',
    ],
    ['Runtimes', p.runtimes.length ? p.runtimes.join(', ') : '·'],
    ['Ownership', p.ownership ?? '·'],
    ['Green hosting', p.green ? 'yes' : '·'],
    ['Offers indexed', p.servers ?? servers.length],
    ['From', p.from_usd ? `${fmtMoney(p.from_usd)}/mo` : '·'],
  ];
  return (
    <Layout
      user={user}
      path={`/providers/${p.slug}`}
      title={p.name}
      description={
        p.summary ?? `${p.name}: hosting provider with ${servers.length} offers indexed.`
      }
      image={p.image_url ?? undefined}
      jsonld={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: p.name,
        url: p.url,
        description: p.summary,
      }}
    >
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/providers">Providers</a>
      </nav>
      <header class="detail-hero">
        <div class="provider-hero">
          <span class="provider-mark big" aria-hidden="true">
            {initials(p.name)}
          </span>
          <div>
            <h1>{p.name}</h1>
            <p class="muted">{p.summary}</p>
            <p>
              <Automation list={p.automation} />
            </p>
            <p class="links">
              <Outbound url={p.url} domain={p.domain}>
                {p.domain ?? 'Website'} ↗
              </Outbound>
              {p.links.api_docs ? <a href={p.links.api_docs}>API docs</a> : null}
              {p.links.cli ? <a href={p.links.cli}>CLI</a> : null}
              {p.links.terraform ? <a href={p.links.terraform}>Terraform</a> : null}
              {p.links.github ? <a href={p.links.github}>GitHub</a> : null}
              {p.links.status ? <a href={p.links.status}>Status</a> : null}
            </p>
          </div>
        </div>
      </header>
      <div class="detail-grid">
        <section class="panel">
          <h2>Facts</h2>
          <dl class="spec-grid">
            {facts.map(([k, v]) => (
              <div class="spec-tile">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {p.attribution ? (
            <p class="muted small">
              {p.attribution}
              {p.source === 'findhost-providers' ? '. Description as the register records it.' : ''}
            </p>
          ) : null}
        </section>
        <section class="panel">
          <h2>Search within</h2>
          <form action="/servers" method="get" class="inline-form">
            <input type="hidden" name="provider" value={p.slug} />
            <input
              type="search"
              name="q"
              placeholder="4 vcpu 8gb"
              aria-label="Search this provider"
              data-omni
            />
            <button class="button primary small" type="submit">
              Search
            </button>
          </form>
          <p class="chips">
            <a class="chip" href={`/servers?provider=${p.slug}&sort=price`}>
              Cheapest
            </a>
            <a class="chip" href={`/servers?provider=${p.slug}&sort=value`}>
              Best value
            </a>
            <a class="chip" href={`/servers?provider=${p.slug}&gpu=1`}>
              GPU
            </a>
            <a class="chip" href={`/servers?provider=${p.slug}&kind=bare-metal`}>
              Bare metal
            </a>
          </p>
        </section>
      </div>
      <section class="section">
        <div class="section-head">
          <h2>{servers.length} offers</h2>
        </div>
        {servers.length ? (
          <div class="unit-list">
            {servers.map((s) => (
              <Unit s={s} />
            ))}
          </div>
        ) : (
          <div class="empty">
            <p>
              No plan rows yet for this provider. The register lists it; no catalogue or storefront
              has been read.
            </p>
          </div>
        )}
      </section>
      <AgentPanel agent={agent} title="This provider as data" />
    </Layout>
  );
}
