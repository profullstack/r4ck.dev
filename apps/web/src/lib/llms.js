import { config } from '@r4ck/config';
import { ALL_PARAMS, BUCKETS, KINDS } from '@r4ck/core/facets';
import * as cat from '@r4ck/db/catalog';
import { pricing } from './gate.js';

const money = (n) => (n === null || n === undefined ? 'n/a' : `$${Number(n).toFixed(2)}`);

export async function llmsTxt() {
  const s = await cat.stats();
  const p = pricing();
  const site = config.siteUrl;
  return `# ${config.siteName}

> The server search engine built for agents. Every VPS, cloud instance, bare metal box, GPU
> node, PaaS and shared plan for sale, mirrored from the NicheDB hosting collection and made
> searchable by spec, price and place. One query vocabulary everywhere: the page, the API, the
> CLI and the MCP tools take the same parameters, so a URL copied from the browser runs as a curl.

Servers: ${s.servers}. Providers: ${s.providers}. Countries: ${s.countries}. GPU offers: ${s.gpu_servers}.
Cheapest priced plan: ${money(s.cheapest_usd)} a month. Last sync: ${s.synced_at ? new Date(s.synced_at).toISOString() : 'never'}.

## Read this first

- Prices are stored as billed (amount, currency, interval) AND as an estimated USD per month
  (\`price.monthly_usd\`) so rows can be compared. The estimate uses daily ECB rates; say "about" when
  quoting one. A row with no billing term has no estimate and sorts last, never as free.
- Specs come from the provider's own catalogue or storefront. Null means the provider did not say,
  not zero. A storefront row with no vCPU is usually a shared, DNS or add-on plan.
- \`stock\` is "unknown" for most rows: only storefronts that publish stock say otherwise.
- Provider rows from the FindHost register are CC BY 4.0: credit "FindHost, findhost.app" when you
  republish their descriptions. Plan rows are read from each provider's public catalogue.

## Endpoints

- \`GET ${site}/api/v1/search\` — the search. Parameters: ${ALL_PARAMS.join(', ')}.
  \`q\` is free text and is parsed: "2 vcpu 4gb under $10 in germany" becomes min_vcpu=2, min_ram=4,
  max_price=10, country=DE. Lists are comma separated. Sizes are GB, prices USD a month.
  Answers {query, understood, total, limit, offset, facets, servers[], agent{curl, cli, mcp}}.
- \`GET ${site}/api/v1/search.csv\` — the same rows as CSV (key or pass).
- \`GET ${site}/api/v1/parse?q=…\` — what a sentence becomes, without running it.
- \`GET ${site}/api/v1/servers/:id\` — one offer with provider, price history and similar rows.
- \`GET ${site}/api/v1/compare?ids=1,2,3\` — up to 20 rows side by side.
- \`GET ${site}/api/v1/cheapest?min_vcpu=2&min_ram=4\` — the cheapest rows meeting a spec.
- \`GET ${site}/api/v1/facets\` — every facet value with its count, optionally under a filter.
- \`GET ${site}/api/v1/providers\` — providers; q, has (api,cli,terraform,mcp), country, category, runtime.
- \`GET ${site}/api/v1/providers/:slug\` — one provider with every offer it sells here.
- \`GET ${site}/api/v1/deals\` — hosting deals and industry stories.
- \`GET ${site}/api/v1/me\`, \`/api/v1/keys\`, \`/api/v1/saved\` — the account, its keys, its saved searches.
- \`POST ${site}/mcp\` — MCP, stateless Streamable HTTP. Descriptor at /.well-known/openmcp.json.

Kinds: ${KINDS.join(', ')}. Sorts: relevance, price, value (USD per vCPU+GB), ram, vcpu, disk, updated, name.
Price buckets: ${BUCKETS.price.map((b) => b.label).join('; ')}.

## Access and pricing

- Anonymous: ${p.anonymous.requests_per_hour} requests an hour on the API, ${p.anonymous.max_rows} rows a page, no bulk export.
- API key: free, ${p.key.requests_per_hour} an hour, ${p.key.max_rows} rows a page, CSV export, saved searches.
  Make one at ${p.key.url} (sign in with an emailed link or a passkey). Send it as
  \`Authorization: Bearer r4k_…\`.
- x402 pass: ${p.pass.price}, no hourly allowance, 500 rows a page. Pay the 402 at ${p.pass.url}
  with any x402 client (\`coinpay x402 pay ${p.pass.url}\`) and present the pass as \`x-crawl-pass\`.
  Going over an allowance answers 402 with the offer rather than 429.${p.pass.enabled ? '' : ' (Payments are not configured on this deployment yet.)'}
- Site-wide: 100 requests a minute per address on every route, 600 with a key or session.
- Training crawlers (GPTBot, ClaudeBot, CCBot, …) pay the same pass on every page. Retrieval and
  search crawlers read free.

## Tools

- CLI: \`npm i -g @profullstack/r4ck\`, then \`r4ck search "2 vcpu 4gb under $10 in eu" --json\`.
- MCP: \`claude mcp add r4ck -- r4ck mcp\` or point any client at ${site}/mcp.
- Skill: ${site}/skill.md describes how to use this site well.
- Source: https://github.com/profullstack/r4ck.dev. Data: ${config.nichedb.url}/c/hosting.
`;
}

export async function skillMd() {
  const site = config.siteUrl;
  return `---
name: r4ck
description: Find servers for sale (VPS, cloud, bare metal, GPU, PaaS, shared) by spec, price and place, compare them, and hand the result to a person or a deploy step. Use when a task needs a machine, a price for a machine, or the cheapest provider meeting a spec.
homepage: ${site}
---

# r4ck

Search every server offer for sale, then drill down. Everything is one vocabulary: the same
parameters work on \`${site}/servers?…\`, \`${site}/api/v1/search?…\`, \`r4ck search …\` and the
\`search_servers\` MCP tool.

## Start with a sentence

\`GET ${site}/api/v1/search?q=2+vcpu+4gb+under+$10+in+germany\`

The reply's \`understood\` says how the sentence was read (min_vcpu, min_ram, max_price, country).
If it read something wrong, send the parameter directly instead of rephrasing.

## Narrow with facets

Every reply carries \`facets\`: counts per kind, price bucket, vCPU, RAM, disk, GPU, country,
provider and provider automation (api, cli, terraform, mcp), computed under the current filters.
A count is how many rows remain if you choose that value next. Pick one and repeat.

## Compare and decide

\`GET ${site}/api/v1/compare?ids=…\` lays up to 20 rows side by side. Sort by \`value\` for USD per
(vCPU + GB of RAM). Quote \`price.monthly_usd\` as an estimate and \`price.amount price.currency
per price.interval\` as the fact. Link \`page\` (this site) or \`url\` (the provider's page).

## Prefer providers a machine can drive

\`has=api,cli\` keeps only providers with an API and a CLI, so what you recommend can be provisioned
without a browser. \`has=mcp\` finds the ones with an MCP server.

## Limits

Anonymous: 300 requests an hour, 50 rows a page. A free key (\`Authorization: Bearer r4k_…\`, made at
${site}/settings) gives 6,000 an hour, 200 rows and CSV export. An x402 pass (\`${site}/crawl\`,
one dollar a day) removes the allowance. Over the limit you get a 402 with the offer, not a 429.
`;
}
