import { config } from '@r4ck/config';
import { fmtMoney } from '@r4ck/core';
import { Layout } from './Layout.jsx';
import { AgentPanel, ProviderCard, Stat, Unit } from './parts.jsx';

const EXAMPLES = [
  ['2 vcpu 4gb under $10 in eu', 'Cheap EU VPS'],
  ['h100 gpu hourly', 'H100 by the hour'],
  ['bare metal 64gb ram in the us', 'US bare metal'],
  ['arm server in singapore', 'ARM in Singapore'],
  ['8 cores 32gb nvme with an api and a cli', 'Scriptable 8-core'],
  ['cheapest storage 1tb', '1 TB storage'],
];

export function Home({ user, stats, cheapest, gpu, providers }) {
  const agent = {
    url: `${config.siteUrl}/api/v1/search?q=2+vcpu+4gb+under+%2410+in+eu`,
    curl: `curl -s '${config.siteUrl}/api/v1/search?q=2+vcpu+4gb+under+%2410+in+eu' -H 'accept: application/json'`,
    cli: 'r4ck search "2 vcpu 4gb under $10 in eu"',
    mcpJson: JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_servers', arguments: { q: '2 vcpu 4gb under $10 in eu' } },
      },
      null,
      2,
    ),
  };
  return (
    <Layout
      user={user}
      path="/"
      wide
      jsonld={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'r4ck',
        url: config.siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${config.siteUrl}/servers?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }}
    >
      <section class="hero">
        <p class="kicker">
          <span class="dot"></span> {stats.servers.toLocaleString()} offers · {stats.providers}{' '}
          providers · synced {ago(stats.synced_at)}
        </p>
        <h1 class="hero-title">
          Every server for sale.
          <br />
          <span class="grad">One query away.</span>
        </h1>
        <p class="hero-sub">
          Say what you need. r4ck reads it, searches every VPS, cloud, bare metal, GPU and PaaS
          offer it knows, and hands back rows a person can read and an agent can act on.
        </p>
        <form class="omnibox" action="/servers" method="get" role="search">
          <input
            type="search"
            name="q"
            placeholder="2 vcpu 4gb under $10 in germany"
            aria-label="Describe the server you need"
            autocomplete="off"
            data-omni
            data-omni-main
            autofocus
          />
          <button type="submit" class="button primary">
            Search
          </button>
          <div class="understood" data-understood aria-live="polite"></div>
        </form>
        <ul class="chips example-chips">
          {EXAMPLES.map(([q, label]) => (
            <li>
              <a class="chip" href={`/servers?q=${encodeURIComponent(q)}`}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section class="stats">
        <Stat value={stats.servers.toLocaleString()} label="offers indexed" href="/servers" />
        <Stat value={stats.providers} label="providers" href="/providers" />
        <Stat value={stats.countries} label="countries" href="/servers" />
        <Stat value={stats.gpu_servers} label="GPU offers" href="/servers?gpu=1" />
        <Stat
          value={stats.cheapest_usd ? `${fmtMoney(stats.cheapest_usd)}` : '–'}
          label="cheapest priced plan"
          href="/servers?sort=price"
        />
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Cheapest VPS with a real CPU and a gig of RAM</h2>
          <a class="button ghost small" href="/servers?kind=vps&min_vcpu=1&min_ram=1&sort=price">
            See all →
          </a>
        </div>
        <div class="unit-list">
          {cheapest.map((s) => (
            <Unit s={s} />
          ))}
        </div>
      </section>

      <section class="section split">
        <div>
          <div class="section-head">
            <h2>Built for agents first</h2>
          </div>
          <p class="lede">
            The page, the API, the CLI and the MCP tools take the same parameters. Copy a URL from
            the address bar and it runs as a curl. Every result page carries its own JSON, curl, CLI
            and MCP form, so a person can hand what they see to a machine without translating.
          </p>
          <ul class="feature-list">
            <li>
              <strong>Sentences in, structure out.</strong> "8 cores 32gb nvme in eu under $60"
              becomes min_vcpu, min_ram, min_disk, country and max_price, and the reply says exactly
              how it was read.
            </li>
            <li>
              <strong>Facets that never lie.</strong> Every count is how many rows remain if that
              value is chosen next.
            </li>
            <li>
              <strong>Prices you can compare.</strong> As billed, plus an estimated USD a month from
              daily ECB rates, marked as an estimate.
            </li>
            <li>
              <strong>Keys, passkeys and x402.</strong> Read free, get a key for bulk, or pay a
              dollar a day over x402 and drop the allowance entirely. Over the limit is a 402 with
              the offer, not a 429.
            </li>
          </ul>
          <p>
            <a class="button primary" href="/docs/api">
              API docs
            </a>{' '}
            <a class="button ghost" href="/docs/mcp">
              MCP
            </a>{' '}
            <a class="button ghost" href="/docs/cli">
              CLI
            </a>
          </p>
        </div>
        <div>
          <AgentPanel agent={agent} title="One query, four ways" open />
          <pre class="install">
            <code>{`npm i -g @profullstack/r4ck\nr4ck search "h100 gpu hourly" --json\nclaude mcp add r4ck -- r4ck mcp`}</code>
          </pre>
        </div>
      </section>

      {gpu.length ? (
        <section class="section">
          <div class="section-head">
            <h2>GPU, by the hour or the month</h2>
            <a class="button ghost small" href="/servers?gpu=1&sort=price">
              All GPU offers →
            </a>
          </div>
          <div class="unit-list">
            {gpu.map((s) => (
              <Unit s={s} />
            ))}
          </div>
        </section>
      ) : null}

      <section class="section">
        <div class="section-head">
          <h2>Providers a script can drive</h2>
          <a class="button ghost small" href="/providers?has=api,cli">
            All with API + CLI →
          </a>
        </div>
        <div class="provider-grid">
          {providers.map((p) => (
            <ProviderCard p={p} />
          ))}
        </div>
      </section>
    </Layout>
  );
}

export function ago(at) {
  if (!at) return 'never';
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
