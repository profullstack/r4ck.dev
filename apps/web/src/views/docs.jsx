import { COMMANDS } from '@profullstack/r4ck';
import { config } from '@r4ck/config';
import { ALL_PARAMS, KINDS, SORTS } from '@r4ck/core/facets';
import { pricing } from '../lib/gate.js';
import { Layout } from './Layout.jsx';

const site = config.siteUrl;

export function ErrorPage({ user, status, message }) {
  return (
    <Layout user={user} title={String(status)}>
      <section class="auth">
        <h1 class="mono">{status}</h1>
        <p>{message}</p>
        <p>
          <a class="button ghost" href="/">
            Home
          </a>{' '}
          <a class="button ghost" href="/servers">
            Search
          </a>
        </p>
      </section>
    </Layout>
  );
}

export function Pricing({ user }) {
  const p = pricing();
  return (
    <Layout
      user={user}
      path="/pricing"
      title="Pricing"
      description="Read free. A free key for bulk. An x402 pass for no limits at all."
    >
      <header class="page-head">
        <h1>Pricing</h1>
        <p class="muted">
          Three doors. The one you walk through is decided by what you send with the request.
        </p>
      </header>
      <div class="tiers">
        <section class="tier">
          <h2>Anonymous</h2>
          <p class="tier-price">Free</p>
          <ul>
            <li>{p.anonymous.requests_per_hour} API requests an hour</li>
            <li>{p.anonymous.max_rows} rows a page</li>
            <li>Every page, every facet, every field</li>
            <li>100 requests a minute site-wide</li>
          </ul>
          <a class="button ghost" href="/servers">
            Start searching
          </a>
        </section>
        <section class="tier featured">
          <h2>API key</h2>
          <p class="tier-price">Free</p>
          <ul>
            <li>{p.key.requests_per_hour.toLocaleString()} API requests an hour</li>
            <li>{p.key.max_rows} rows a page</li>
            <li>CSV export of any query</li>
            <li>Saved searches, on the page, the CLI and MCP</li>
            <li>600 requests a minute site-wide</li>
          </ul>
          <a class="button primary" href={user ? '/settings' : '/signup'}>
            {user ? 'Make a key' : 'Create an account'}
          </a>
        </section>
        <section class="tier">
          <h2>x402 pass</h2>
          <p class="tier-price">{p.pass.price}</p>
          <ul>
            <li>No hourly allowance</li>
            <li>500 rows a page</li>
            <li>Paid by any x402 client, settled in USDC</li>
            <li>Also what training crawlers pay per page</li>
            <li>Buy up to {config.x402.maxDays} days in one payment</li>
          </ul>
          <a class="button ghost" href="/crawl">
            Buy a pass
          </a>
          {!p.pass.enabled ? (
            <p class="muted small">Payments are not switched on for this deployment yet.</p>
          ) : null}
        </section>
      </div>
      <section class="panel">
        <h2>How the pass works</h2>
        <pre>
          <code>{`npm i -g @profullstack/coinpay\ncoinpay x402 pay ${site}/crawl --output pass.json\ncurl -H "x-crawl-pass: $(node -p "require('./pass.json').pass")" '${site}/api/v1/search?q=h100'`}</code>
        </pre>
        <p class="muted small">
          Over any allowance the API answers <code>402 Payment Required</code> with the offer in the
          body, never a bare 429. Pay it and retry the same request with the pass. Search engines
          and retrieval crawlers read free; training crawlers are asked to pay on every page.
        </p>
      </section>
    </Layout>
  );
}

export function ApiDocs({ user }) {
  const ex = `${site}/api/v1/search?q=2+vcpu+4gb+under+%2410+in+eu`;
  return (
    <Layout
      user={user}
      path="/docs/api"
      title="API"
      description="The r4ck HTTP API: search with one vocabulary, facets, compare, providers, deals, keys."
    >
      <header class="page-head">
        <h1>API</h1>
        <p class="muted">
          JSON over HTTPS. Reads need no key. The same parameters work on the page, so any URL from
          the address bar is an API call with a different Accept header.
        </p>
      </header>
      <section class="panel">
        <h2>Search</h2>
        <pre>
          <code>{`GET ${ex}\n\ncurl -s '${ex}' -H 'accept: application/json'`}</code>
        </pre>
        <p>
          <strong>Parameters:</strong> <code>{ALL_PARAMS.join(', ')}</code>
        </p>
        <ul class="docs-list">
          <li>
            <code>q</code> is parsed: numbers with units, price words, places, kinds, provider
            ("from vultr"), GPU models and "with an api/cli/terraform/mcp". The reply's{' '}
            <code>understood</code> lists what was claimed; explicit parameters always win over the
            sentence.
          </li>
          <li>
            Lists are comma separated: <code>kind=vps,bare-metal</code>, <code>country=DE,NL</code>,{' '}
            <code>has=api,cli</code>.
          </li>
          <li>
            Sizes are GB, prices are estimated USD a month. <code>region=eu</code> expands to member
            states.
          </li>
          <li>
            <code>sort</code>: {SORTS.join(', ')}. <code>value</code> is USD per (vCPU + GB of RAM).{' '}
            <code>order</code>: asc, desc.
          </li>
          <li>
            <code>limit</code> up to {config.api.anonMaxLimit} anonymous, {config.api.keyMaxLimit}{' '}
            with a key, 500 with a pass. <code>offset</code> pages.
          </li>
          <li>Kinds: {KINDS.join(', ')}.</li>
        </ul>
        <p>
          The reply carries <code>query</code> (the filters that ran), <code>understood</code>,{' '}
          <code>chips</code>, <code>total</code>, <code>facets</code> (counts under the current
          filters), <code>servers[]</code>, <code>agent</code> (the same query as URL, curl, CLI and
          MCP) and <code>next</code>.
        </p>
      </section>
      <section class="panel">
        <h2>Everything else</h2>
        <table class="docs-table">
          <tbody>
            {[
              ['GET /api/v1', 'Index: limits, your plan, stats, kinds, sorts.'],
              ['GET /api/v1/search.csv', 'Same rows as CSV. Key or pass.'],
              ['GET /api/v1/parse?q=', 'How a sentence is read, without running it.'],
              ['GET /api/v1/cheapest', 'Search sorted by price, ten rows.'],
              ['GET /api/v1/facets', 'Every facet value with a count, under optional filters.'],
              [
                'GET /api/v1/servers/:id',
                'One offer: provider, price history, similar offers, raw OpenServer offer.',
              ],
              ['GET /api/v1/compare?ids=', 'Up to 20 offers side by side.'],
              [
                'GET /api/v1/providers',
                'q, has, country, category, runtime, green, sort (name, servers, price).',
              ],
              ['GET /api/v1/providers/:slug', 'One provider with every offer indexed for it.'],
              ['GET /api/v1/deals', 'Deals and stories.'],
              ['GET /api/v1/stats', 'What is indexed and when it last synced.'],
              ['GET /api/v1/me', 'Your account, keys and saved searches. Needs a key or session.'],
              [
                'POST /api/v1/keys · DELETE /api/v1/keys/:id',
                'Make and revoke keys. The key is shown once.',
              ],
              [
                'GET/POST /api/v1/saved · DELETE /api/v1/saved/:id',
                'Saved searches. POST {name, query}.',
              ],
              ['POST /mcp', 'MCP, stateless Streamable HTTP. See /docs/mcp.'],
            ].map(([a, b]) => (
              <tr>
                <td>
                  <code>{a}</code>
                </td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h2>A row</h2>
        <pre>
          <code>
            {JSON.stringify(
              {
                id: 1234,
                name: 'vc2-2c-4gb',
                provider: { slug: 'vultr', name: 'Vultr', automation: ['api', 'cli', 'terraform'] },
                kind: 'vps',
                compute: { vcpu: 2, ram_gb: 4, arch: null, gpu: null },
                storage: { disk_gb: 80, type: 'nvme' },
                network: { transfer_gb: 3000, ipv4: 1, ipv6: true },
                price: {
                  amount: 24,
                  currency: 'USD',
                  interval: 'month',
                  monthly_usd: 24,
                  hourly_usd: 0.033,
                  estimate: false,
                },
                location: { countries: [{ code: 'US', name: 'United States' }] },
                stock: 'unknown',
                url: 'https://www.vultr.com/pricing/',
                page: `${site}/servers/1234`,
              },
              null,
              2,
            )}
          </code>
        </pre>
        <p class="muted small">
          Null means the provider did not say. <code>price.estimate</code> is true when the USD
          figure was converted or prorated.
        </p>
      </section>
      <section class="panel">
        <h2>Limits and errors</h2>
        <p>
          Headers <code>x-plan</code>, <code>x-ratelimit-limit</code>,{' '}
          <code>x-ratelimit-remaining</code>, <code>x-ratelimit-reset</code> on every answer. Over
          the allowance: <code>402</code> with an x402 offer (or <code>429</code> where payments are
          off). Errors are <code>{'{ "error": "…" }'}</code> with the right status. See{' '}
          <a href="/pricing">pricing</a>.
        </p>
      </section>
    </Layout>
  );
}

export function CliDocs({ user }) {
  return (
    <Layout
      user={user}
      path="/docs/cli"
      title="CLI"
      description="r4ck from the terminal: search, get, cheapest, compare, providers, deals, keys and an MCP bridge."
    >
      <header class="page-head">
        <h1>CLI</h1>
        <p class="muted">
          One binary, zero dependencies, Node 22 or later. Talks to this site. <code>--json</code>{' '}
          for agents.
        </p>
      </header>
      <pre>
        <code>{`npm i -g @profullstack/r4ck\nr4ck search "2 vcpu 4gb under $10 in eu"\nr4ck search --kind bare-metal --min-ram 64 --country US --sort price --json\nr4ck cheapest --min-vcpu 4 --min-ram 8 --has api,cli\nr4ck compare 120 344 902\nr4ck providers --has cli --country DE\nr4ck login          # paste a key from ${site}/settings\nr4ck mcp            # stdio bridge for MCP clients`}</code>
      </pre>
      <section class="panel">
        <h2>Commands</h2>
        <table class="docs-table">
          <tbody>
            {COMMANDS.map((c) => (
              <tr>
                <td>
                  <code>{c.usage}</code>
                </td>
                <td>{c.help}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="muted small">
          Global flags: <code>--json</code>, <code>--api &lt;url&gt;</code>,{' '}
          <code>--key &lt;r4k_…&gt;</code>, <code>--help</code>, <code>--version</code>. Config
          lives at <code>~/.config/r4ck/config.json</code>; <code>R4CK_KEY</code> and{' '}
          <code>R4CK_API</code> override it.
        </p>
      </section>
    </Layout>
  );
}

export function McpDocs({ user, tools }) {
  return (
    <Layout
      user={user}
      path="/docs/mcp"
      title="MCP"
      description="r4ck as an MCP server: search_servers, cheapest, compare_servers, list_providers and more over stateless Streamable HTTP."
    >
      <header class="page-head">
        <h1>MCP</h1>
        <p class="muted">
          Stateless Streamable HTTP at <code>{site}/mcp</code>. Reads need no key;{' '}
          <code>Authorization: Bearer r4k_…</code> unlocks saved searches. Descriptor at{' '}
          <a href="/.well-known/openmcp.json">/.well-known/openmcp.json</a>.
        </p>
      </header>
      <pre>
        <code>{`# Claude Code, via the CLI bridge\nnpm i -g @profullstack/r4ck && claude mcp add r4ck -- r4ck mcp\n\n# Any client, directly\n{ "mcpServers": { "r4ck": { "url": "${site}/mcp", "headers": { "Authorization": "Bearer r4k_…" } } } }\n\n# By hand\ncurl -s ${site}/mcp -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_servers","arguments":{"q":"h100 gpu hourly"}}}'`}</code>
      </pre>
      <section class="panel">
        <h2>Tools</h2>
        {tools.map((t) => (
          <details class="tool">
            <summary>
              <code>{t.name}</code> <span class="muted">{t.title}</span>
            </summary>
            <p>{t.description}</p>
            <pre>
              <code>{JSON.stringify(t.inputSchema, null, 2)}</code>
            </pre>
          </details>
        ))}
      </section>
      <section class="panel">
        <h2>Resources and prompts</h2>
        <p>
          <code>{site}/llms.txt</code> and <code>{site}/skill.md</code> are readable resources. The{' '}
          <code>find_server</code> prompt turns a need into a shortlist with a recommendation.
        </p>
      </section>
    </Layout>
  );
}

export function About({ user, stats }) {
  return (
    <Layout user={user} path="/about" title="About">
      <header class="page-head">
        <h1>About r4ck</h1>
      </header>
      <section class="panel">
        <p class="lede">
          Buying a server should take one sentence, whether a person or an agent is doing the
          buying. r4ck reads every offer the{' '}
          <a href={`${config.nichedb.url}/c/hosting`}>NicheDB hosting collection</a> has read from
          providers' own catalogues and storefronts, normalises each to an{' '}
          <a href="https://logicsrc.com/docs/openserver">OpenServer</a> offer, and puts one search
          over all of it: {stats.servers.toLocaleString()} offers from {stats.providers} providers
          in {stats.countries} countries at the last count.
        </p>
        <p>
          The page, the API, the CLI and the MCP tools speak one vocabulary. Prices are kept as
          billed and estimated in USD a month from daily ECB rates so they can be compared. Provider
          descriptions come from the <a href="https://www.findhost.app/">FindHost</a> register under
          CC BY 4.0. Nothing here was scraped from a site that forbids it.
        </p>
        <p>
          Made by <a href="https://profullstack.com">Profullstack</a>. Source on{' '}
          <a href="https://github.com/profullstack/r4ck.dev">GitHub</a>, MIT.
        </p>
      </section>
    </Layout>
  );
}
