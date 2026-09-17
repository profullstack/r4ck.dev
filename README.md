# r4ck.dev

**The server search engine built for agents.** Every VPS, cloud instance, bare metal box, GPU node, PaaS and shared plan for sale, mirrored from the [NicheDB hosting collection](https://nichedb.dev/c/hosting), normalised to [OpenServer](https://logicsrc.com/docs/openserver) offers, and searchable by spec, price and place.

One vocabulary everywhere: the page, `/api/v1/search`, the `r4ck` CLI and the MCP tools take the same parameters. A URL copied from the address bar runs as a curl. Every result page carries its own JSON, curl, CLI and MCP form.

```
r4ck search "2 vcpu 4gb under $10 in eu"
curl -s 'https://r4ck.dev/api/v1/search?q=h100+gpu+hourly' -H 'accept: application/json'
claude mcp add r4ck -- r4ck mcp
```

## What is in the box

| Surface | Where |
| --- | --- |
| Web + PWA (mobile first, installable, offline shell) | `apps/web` (Bun + Hono JSX, no framework, no build step for CSS) |
| JSON API | `/api/v1/*`, documented at `/docs/api` and `/llms.txt` |
| MCP server (stateless Streamable HTTP, both protocol eras) | `/mcp`, descriptor at `/.well-known/openmcp.json` |
| CLI + stdio MCP bridge | `apps/cli` → `@profullstack/r4ck` on npm |
| Desktop shell (Electron, CLI bundled) | `apps/desktop` |
| Agent skill | `/skill.md` |

Access: read free (300 API requests an hour, 50 rows a page); a free key (magic link or passkey sign-in, 6,000 an hour, 200 rows, CSV export, saved searches); an x402 pass ($1 a day, no allowance) bought at `/crawl` with any x402 client. Going over an allowance answers `402` with the offer, never a bare `429`. Training crawlers pay the same pass on every page.

## Run it

```
cp .env.example .env            # DATABASE_URL, SITE_URL at least
bun install
bun run migrate
bun run sync --full             # first mirror from nichedb.dev (a few minutes; it is slow upstream)
bun run dev                     # http://localhost:3000
bun test                        # needs DATABASE_URL; the api test seeds and cleans its own rows
```

`bun run sync --file snapshot.json` seeds from a saved `/api/v1/items` dump. The worker resyncs every `SYNC_MINUTES` with `since=` and refreshes ECB rates daily.

## Layout

```
apps/web        routes, views (JSX), lib (gate, mcp, service, llms), public (styles, app.js, sw.js, fonts, icons)
apps/cli        zero-dependency Node CLI, published as @profullstack/r4ck
apps/desktop    Electron shell
packages/config every env var, read once
packages/core   query parser, facet vocabulary, FX, NicheDB item → row
packages/db     Bun SQL, migrations, accounts, catalog, search + facets
packages/auth   magic link, passkeys, r4k_ API keys
packages/sync   NicheDB client and the mirror loop
```

## Data

Plan rows come from each provider's public catalogue or storefront as NicheDB reads them. Provider descriptions come from the FindHost register, [findhost.app](https://www.findhost.app/), CC BY 4.0. USD figures are estimates from daily ECB rates and are marked as such. Nothing here was scraped from a site that forbids it.

MIT. Made by [Profullstack](https://profullstack.com).
