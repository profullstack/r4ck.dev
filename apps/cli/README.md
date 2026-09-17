# @profullstack/r4ck

[r4ck.dev](https://r4ck.dev) from the terminal, and for agents: search every VPS, cloud, bare metal, GPU and PaaS offer for sale, drill down by spec, price and place, and bridge the same tools into any MCP client.

```
npm i -g @profullstack/r4ck
r4ck search "2 vcpu 4gb under $10 in eu"
r4ck search --kind bare-metal --min-ram 64 --country US --sort price --json
r4ck cheapest --min-vcpu 4 --min-ram 8 --has api,cli
r4ck compare 120 344 902
r4ck providers --has cli --country DE
r4ck login                        # paste a key from https://r4ck.dev/settings
claude mcp add r4ck -- r4ck mcp   # every tool in Claude Code
```

Zero dependencies, Node 22 or later. `--json` prints the API reply verbatim. Config lives at `~/.config/r4ck/config.json`; `R4CK_KEY` and `R4CK_API` override it.

Reads need no key. A free key gives 6,000 requests an hour, 200 rows a page and CSV export. An x402 pass (`coinpay x402 pay https://r4ck.dev/crawl`) removes the allowance.

MIT. Source: https://github.com/profullstack/r4ck.dev
