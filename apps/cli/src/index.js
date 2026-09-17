import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/**
 * r4ck from the terminal, and for agents. Zero dependencies, Node 22+.
 * Every command is a thin call to the site's API; `--json` prints the
 * reply verbatim, otherwise a table a person can read. `r4ck mcp` bridges
 * stdio to the site's MCP endpoint so any client gets every tool.
 */
export const VERSION = '0.1.0';
const DEFAULT_API = process.env.R4CK_API ?? 'https://r4ck.dev';
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'r4ck');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const COMMANDS = [
  {
    name: 'search',
    usage:
      'search [sentence] [--kind vps,gpu] [--min-vcpu N] [--min-ram GB] [--max-price USD] [--country DE,NL] [--has api,cli] [--sort price|value|ram] [--limit N] [--facets]',
    help: 'Search every offer. A sentence is parsed; flags win over it.',
  },
  {
    name: 'cheapest',
    usage: 'cheapest [sentence] [--min-vcpu N] [--min-ram GB] [--kind K] [--country C]',
    help: 'The cheapest rows meeting a spec.',
  },
  {
    name: 'get',
    usage: 'get <id>',
    help: 'One offer with provider, price history and similar rows.',
  },
  { name: 'compare', usage: 'compare <id> <id> [...]', help: 'Up to 20 offers side by side.' },
  { name: 'parse', usage: 'parse <sentence>', help: 'How a sentence is read, without running it.' },
  { name: 'facets', usage: 'facets [filters]', help: 'Every facet value with its count.' },
  {
    name: 'providers',
    usage: 'providers [--has api,cli] [--country DE] [--category vps] [--q name]',
    help: 'Providers and their automation.',
  },
  {
    name: 'provider',
    usage: 'provider <slug|domain>',
    help: 'One provider with every offer indexed for it.',
  },
  { name: 'deals', usage: 'deals', help: 'Hosting deals and stories.' },
  { name: 'stats', usage: 'stats', help: 'What is indexed and when it last synced.' },
  { name: 'login', usage: 'login [--key r4k_…]', help: 'Store an API key from r4ck.dev/settings.' },
  { name: 'logout', usage: 'logout', help: 'Forget the stored key.' },
  { name: 'whoami', usage: 'whoami', help: 'The account behind the stored key.' },
  {
    name: 'saved',
    usage: 'saved [list|add <name> [filters]|rm <id>]',
    help: 'Saved searches on the account.',
  },
  {
    name: 'open',
    usage: 'open <id|sentence>',
    help: 'Print the page URL for an offer or a search.',
  },
  {
    name: 'mcp',
    usage: 'mcp',
    help: 'Serve MCP over stdio, bridged to the site (for Claude Code and friends).',
  },
];

const LIST_FLAGS = ['kind', 'provider', 'country', 'has', 'ids', 'category', 'runtime'];

/* -------------------------------------------------------------- config -- */
async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return { api: DEFAULT_API, keys: {} };
  }
}
async function writeConfig(cfg) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

/* ------------------------------------------------------------- parsing -- */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const rawKey = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      let value = eq > 0 ? a.slice(eq + 1) : undefined;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          value = next;
          i++;
        } else value = true;
      }
      if (key.startsWith('no') && key.length > 2 && value === true)
        flags[key[2].toLowerCase() + key.slice(3)] = false;
      else flags[key] = value;
    } else positional.push(a);
  }
  return { flags, positional };
}

const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Flags → API query parameters. Lists stay comma separated. */
export function queryFrom(flags, sentence) {
  const p = new URLSearchParams();
  if (sentence) p.set('q', sentence);
  for (const [k, v] of Object.entries(flags)) {
    if (
      ['json', 'api', 'key', 'help', 'version', 'facets', 'urls'].includes(k) ||
      v === undefined ||
      v === false
    )
      continue;
    const name = snake(k);
    if (v === true) p.set(name, '1');
    else
      p.set(
        name,
        LIST_FLAGS.includes(name)
          ? String(v)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .join(',')
          : String(v),
      );
  }
  return p;
}

/* -------------------------------------------------------------- client -- */
export function makeClient({ api, key, fetchImpl = fetch }) {
  const base = String(api ?? DEFAULT_API).replace(/\/$/, '');
  const headers = () => ({
    accept: 'application/json',
    'user-agent': `r4ck-cli/${VERSION}`,
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  });
  async function send(method, path, body) {
    const r = await fetchImpl(`${base}${path}`, {
      method,
      headers: { ...headers(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      const err = new Error(data?.error ?? `${r.status} from ${path}`);
      err.status = r.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  return {
    base,
    key,
    get: (p) => send('GET', p),
    post: (p, b) => send('POST', p, b),
    del: (p) => send('DELETE', p),
    send,
  };
}

/* --------------------------------------------------------------- output -- */
const money = (n) =>
  n === null || n === undefined
    ? ''
    : `$${Number(n) < 10 ? Number(n).toFixed(2) : Math.round(Number(n)).toLocaleString()}`;
const pad = (s, n, right = false) => {
  const t = String(s ?? '');
  const w = [...t].length;
  return w >= n ? t : right ? ' '.repeat(n - w) + t : t + ' '.repeat(n - w);
};
export function table(rows, cols) {
  const widths = cols.map((c) =>
    Math.max([...c.label].length, ...rows.map((r) => [...String(c.get(r) ?? '')].length)),
  );
  const line = (cells) => cells.map((v, i) => pad(v, widths[i], cols[i].right)).join('  ');
  return [
    line(cols.map((c) => c.label)),
    line(widths.map((w) => '─'.repeat(w))),
    ...rows.map((r) => line(cols.map((c) => c.get(r)))),
  ].join('\n');
}
const SERVER_COLS = [
  { label: 'id', get: (s) => s.id, right: true },
  { label: 'provider', get: (s) => s.provider.name },
  { label: 'name', get: (s) => s.name.slice(0, 34) },
  { label: 'kind', get: (s) => s.kind },
  { label: 'vcpu', get: (s) => s.compute.vcpu ?? '', right: true },
  {
    label: 'ram',
    get: (s) => (s.compute.ram_gb === null ? '' : `${s.compute.ram_gb}G`),
    right: true,
  },
  {
    label: 'disk',
    get: (s) => (s.storage.disk_gb === null ? '' : `${Math.round(s.storage.disk_gb)}G`),
    right: true,
  },
  { label: 'gpu', get: (s) => s.compute.gpu?.model ?? '' },
  {
    label: 'where',
    get: (s) =>
      s.location.countries
        .slice(0, 4)
        .map((c) => c.code)
        .join(' '),
  },
  { label: 'usd/mo', get: (s) => money(s.price.monthly_usd), right: true },
  {
    label: 'billed',
    get: (s) =>
      s.price.amount === null
        ? ''
        : `${s.price.amount} ${s.price.currency}/${s.price.interval ?? '?'}`,
  },
];
const PROVIDER_COLS = [
  { label: 'slug', get: (p) => p.slug },
  { label: 'name', get: (p) => p.name.slice(0, 28) },
  { label: 'hq', get: (p) => p.country?.code ?? '' },
  { label: 'automation', get: (p) => p.automation.join(',') },
  { label: 'offers', get: (p) => p.servers ?? '', right: true },
  { label: 'from', get: (p) => money(p.from_usd), right: true },
  { label: 'site', get: (p) => p.domain ?? '' },
];

function printSearch(r, { facets = false } = {}) {
  const out = [];
  if (r.understood?.length) out.push(`understood: ${r.understood.join(', ')}`);
  if (r.chips?.length) out.push(`filters: ${r.chips.map((c) => c.label).join(' · ')}`);
  out.push(
    `${r.total.toLocaleString()} offers${r.total > r.servers.length ? `, showing ${r.offset + 1}-${r.offset + r.servers.length}` : ''}\n`,
  );
  out.push(r.servers.length ? table(r.servers, SERVER_COLS) : '(nothing matched)');
  if (facets && r.facets) {
    out.push('');
    for (const [name, values] of Object.entries(r.facets))
      out.push(
        `${name}: ${values
          .slice(0, 8)
          .map((v) => `${v.label ?? v.value} (${v.count})`)
          .join(', ')}`,
      );
  }
  if (r.agent?.url) out.push(`\napi: ${r.agent.url}`);
  return out.join('\n');
}

const help = () =>
  [
    `r4ck ${VERSION}: the server search engine built for agents`,
    '',
    'Usage: r4ck <command> [options]',
    '',
    ...COMMANDS.map((c) => `  ${pad(c.usage, 60)}  ${c.help}`),
    '',
    'Global: --json  --api <url>  --key <r4k_…>  --help  --version',
    `Config: ${CONFIG_FILE}  (R4CK_KEY / R4CK_API override)`,
  ].join('\n');

/* ----------------------------------------------------------------- run -- */
export async function run(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    stdin = process.stdin,
    fetchImpl = fetch,
  } = {},
) {
  const { flags, positional } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  const cfg = await readConfig();
  const api = flags.api ?? process.env.R4CK_API ?? cfg.api ?? DEFAULT_API;
  const key = flags.key ?? cfg.keys?.[api] ?? process.env.R4CK_KEY ?? null;
  const client = makeClient({ api, key, fetchImpl });
  const json = (v) => {
    stdout.write(`${JSON.stringify(v, null, 2)}\n`);
  };
  const say = (s) => {
    stdout.write(`${s}\n`);
  };
  if (flags.version) return say(VERSION);
  if (!cmd || flags.help || cmd === 'help') return say(help());

  switch (cmd) {
    case 'search':
    case 'cheapest': {
      const q = queryFrom(flags, rest.join(' ').trim() || undefined);
      const r = await client.get(`/api/v1/${cmd}?${q}`);
      return flags.json ? json(r) : say(printSearch(r, { facets: Boolean(flags.facets) }));
    }
    case 'parse': {
      const r = await client.get(`/api/v1/parse?q=${encodeURIComponent(rest.join(' '))}`);
      return flags.json
        ? json(r)
        : say(
            `${r.chips.map((c) => c.label).join(' · ') || '(nothing understood)'}${r.rest ? `\ntext search: ${r.rest}` : ''}\n${r.agent.url}`,
          );
    }
    case 'get': {
      if (!rest[0]) throw new Error('usage: r4ck get <id>');
      const r = await client.get(`/api/v1/servers/${encodeURIComponent(rest[0])}`);
      if (flags.json) return json(r);
      const s = r.server;
      say(`${s.provider.name} ${s.name}  [${s.kind}]`);
      say(table([s], SERVER_COLS.slice(4)));
      say(
        `price: ${s.price.amount ?? '?'} ${s.price.currency ?? ''}/${s.price.interval ?? '?'}${s.price.monthly_usd !== null ? `  ≈ ${money(s.price.monthly_usd)}/mo` : ''}`,
      );
      if (s.url) say(`order: ${s.url}`);
      say(`page:  ${s.page}`);
      if (r.similar?.length) say(`\nsimilar:\n${table(r.similar, SERVER_COLS)}`);
      return;
    }
    case 'compare': {
      const ids = rest.flatMap((x) => x.split(',')).filter(Boolean);
      if (!ids.length) throw new Error('usage: r4ck compare <id> <id> ...');
      const r = await client.get(`/api/v1/compare?ids=${ids.join(',')}`);
      return flags.json ? json(r) : say(`${table(r.servers, SERVER_COLS)}\n\n${r.agent.html}`);
    }
    case 'facets': {
      const r = await client.get(`/api/v1/facets?${queryFrom(flags, rest.join(' ') || undefined)}`);
      if (flags.json) return json(r);
      for (const [name, values] of Object.entries(r.facets))
        say(
          `${name}: ${values
            .slice(0, 12)
            .map((v) => `${v.label ?? v.value} (${v.count})`)
            .join(', ')}`,
        );
      return;
    }
    case 'providers': {
      const r = await client.get(
        `/api/v1/providers?${queryFrom(flags, undefined)}${rest.length ? `&q=${encodeURIComponent(rest.join(' '))}` : ''}`,
      );
      return flags.json
        ? json(r)
        : say(`${r.total} providers\n\n${table(r.providers, PROVIDER_COLS)}`);
    }
    case 'provider': {
      if (!rest[0]) throw new Error('usage: r4ck provider <slug>');
      const r = await client.get(`/api/v1/providers/${encodeURIComponent(rest[0])}`);
      if (flags.json) return json(r);
      const p = r.provider;
      say(
        `${p.name}  ${p.domain ?? ''}  ${p.country?.code ?? ''}  automation: ${p.automation.join(',') || 'none'}`,
      );
      if (p.summary) say(p.summary);
      say(`\n${r.servers.length} offers\n${table(r.servers, SERVER_COLS)}`);
      return;
    }
    case 'deals': {
      const r = await client.get('/api/v1/deals');
      return flags.json
        ? json(r)
        : say(r.deals.map((d) => `[${d.kind}] ${d.title}\n  ${d.url}`).join('\n'));
    }
    case 'stats': {
      const r = await client.get('/api/v1/stats');
      return flags.json
        ? json(r)
        : say(
            Object.entries(r)
              .map(([k, v]) => `${pad(k, 18)} ${v}`)
              .join('\n'),
          );
    }
    case 'login': {
      let k = flags.key;
      if (!k) {
        const rl = createInterface({ input: stdin, output: stderr });
        k = await new Promise((res) =>
          rl.question(`Paste an API key from ${api}/settings: `, (a) => {
            rl.close();
            res(a.trim());
          }),
        );
      }
      if (!/^r4k_[0-9a-f]{16,}$/i.test(k)) throw new Error('that does not look like an r4k_ key');
      const me = await makeClient({ api, key: k, fetchImpl }).get('/api/v1/me');
      cfg.api = api;
      cfg.keys = { ...(cfg.keys ?? {}), [api]: k };
      await writeConfig(cfg);
      return say(`Signed in as ${me.email}. Key stored in ${CONFIG_FILE}.`);
    }
    case 'logout': {
      delete cfg.keys?.[api];
      await writeConfig(cfg);
      return say('Key forgotten.');
    }
    case 'whoami': {
      const r = await client.get('/api/v1/me');
      return flags.json
        ? json(r)
        : say(`${r.email} (${r.plan}) · ${r.keys.length} keys · ${r.saved.length} saved searches`);
    }
    case 'saved': {
      const [sub = 'list', ...more] = rest;
      if (sub === 'list') {
        const r = await client.get('/api/v1/saved');
        return flags.json
          ? json(r)
          : say(
              r.saved.length
                ? r.saved.map((s) => `${s.id}  ${s.name}\n  ${s.cli}`).join('\n')
                : 'nothing saved',
            );
      }
      if (sub === 'add') {
        const name = more[0];
        const q = Object.fromEntries(queryFrom(flags, more.slice(1).join(' ') || undefined));
        const r = await client.post('/api/v1/saved', { name, query: q });
        return flags.json ? json(r) : say(`saved ${r.saved.id}: ${r.saved.name}`);
      }
      if (sub === 'rm') {
        await client.del(`/api/v1/saved/${encodeURIComponent(more[0] ?? '')}`);
        return say('removed');
      }
      throw new Error('usage: r4ck saved [list|add <name> [filters]|rm <id>]');
    }
    case 'open': {
      if (/^\d+$/.test(rest[0] ?? '')) return say(`${client.base}/servers/${rest[0]}`);
      return say(`${client.base}/servers?${queryFrom(flags, rest.join(' ') || undefined)}`);
    }
    case 'mcp':
      return serveMcp({ client, stdin, stdout, fetchImpl });
    default:
      stderr.write(`Unknown command: ${cmd}\n\n${help()}\n`);
      return 2;
  }
}

/**
 * stdio ↔ HTTP bridge: each newline-delimited JSON-RPC message is POSTed to
 * the site's /mcp with the stored key; the answer is written back. Nothing
 * about the tools is duplicated here, so the CLI never lags the server.
 */
export async function serveMcp({ client, stdin, stdout, fetchImpl = fetch }) {
  const rl = createInterface({ input: stdin, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`,
      );
      continue;
    }
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': `r4ck-cli/${VERSION}`,
    };
    if (client.key) headers.authorization = `Bearer ${client.key}`;
    const version = msg?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (version) {
      headers['mcp-protocol-version'] = version;
      headers['mcp-method'] = msg.method;
      const name = msg.params?.name ?? msg.params?.uri;
      if (name) headers['mcp-name'] = name;
    }
    try {
      const r = await fetchImpl(`${client.base}/mcp`, { method: 'POST', headers, body: text });
      if (r.status === 202) continue;
      const body = await r.text();
      if (body.trim()) stdout.write(`${body.trim()}\n`);
    } catch (err) {
      if ('id' in msg)
        stdout.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `bridge: ${err.message}` } })}\n`,
        );
    }
  }
}
