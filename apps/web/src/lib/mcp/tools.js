import { config } from '@r4ck/config';
import { ALL_PARAMS, KINDS, SORTS } from '@r4ck/core/facets';
import * as credits from '../credits.js';
import * as svc from '../service.js';
import { EVENT_TYPES, hooks, WebhookError } from '../webhooks.js';

/**
 * The tools, the single source of truth for tools/list and /docs/mcp. Each
 * carries its schema and the function that runs it; `key: true` marks the
 * ones that need an account.
 */
const toolError = (message) => Object.assign(new Error(message), { toolError: true });

const filterSchema = {
  q: {
    type: 'string',
    description:
      'A sentence or keywords: "2 vcpu 4gb under $10 in germany". Parsed into the fields below; explicit fields win.',
  },
  kind: { type: 'array', items: { type: 'string', enum: KINDS }, description: 'Offer kinds.' },
  provider: {
    type: 'array',
    items: { type: 'string' },
    description: 'Provider slugs, domains or names.',
  },
  country: {
    type: 'array',
    items: { type: 'string' },
    description: 'ISO 3166 alpha-2 codes the offer is available in.',
  },
  region: {
    type: 'string',
    description:
      'A region word (eu, europe, asia, north america, nordics, dach…) expanded to countries.',
  },
  has: {
    type: 'array',
    items: { type: 'string', enum: ['api', 'cli', 'terraform', 'mcp', 'iac'] },
    description: 'Provider automation required.',
  },
  min_vcpu: { type: 'number' },
  max_vcpu: { type: 'number' },
  min_ram: { type: 'number', description: 'GB' },
  max_ram: { type: 'number', description: 'GB' },
  min_disk: { type: 'number', description: 'GB' },
  max_disk: { type: 'number', description: 'GB' },
  min_price: { type: 'number', description: 'USD per month, estimated' },
  max_price: { type: 'number', description: 'USD per month, estimated' },
  gpu: { type: 'boolean' },
  gpu_model: { type: 'string', description: 'Substring of the GPU model, e.g. h100' },
  arch: { type: 'string', enum: ['x86_64', 'arm64'] },
  currency: { type: 'string', description: 'Billed-in currency code' },
  interval: {
    type: 'string',
    enum: ['hour', 'day', 'week', 'month', 'quarter', 'year', 'biennial', 'triennial'],
  },
  tenancy: { type: 'string', enum: ['shared', 'dedicated'] },
  platform: { type: 'string', description: 'Where the row was read: api, whmcs, openserver…' },
  stock: { type: 'string', enum: ['in_stock', 'out_of_stock', 'unknown'] },
  sort: { type: 'string', enum: SORTS },
  order: { type: 'string', enum: ['asc', 'desc'] },
  limit: { type: 'integer', minimum: 1, maximum: 500 },
  offset: { type: 'integer', minimum: 0 },
};

export const TOOLS = [
  {
    name: 'search_servers',
    title: 'Search servers for sale',
    description:
      'Search every offer by spec, price and place. Returns rows, how the sentence was understood, and facet counts for narrowing. Prices carry the billed amount and an estimated USD per month.',
    schema: { type: 'object', properties: filterSchema },
    run: (args, ctx) => svc.runSearch(args, { access: ctx.access }),
  },
  {
    name: 'cheapest',
    title: 'Cheapest servers meeting a spec',
    description:
      'The lowest priced rows that meet the given minimums, ranked by estimated monthly USD.',
    schema: { type: 'object', properties: filterSchema },
    run: (args, ctx) => svc.cheapest(args, { access: ctx.access }),
  },
  {
    name: 'parse_query',
    title: 'Parse a sentence into filters',
    description: 'See how a sentence would be read, without running it.',
    schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    run: (args) => svc.parseOnly(String(args.q ?? '')),
  },
  {
    name: 'get_server',
    title: 'One server offer',
    description: 'One offer by id with its provider, price history and similar offers.',
    schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    run: (args) => svc.serverDetail(args.id),
  },
  {
    name: 'compare_servers',
    title: 'Compare servers',
    description: 'Up to 20 offers side by side.',
    schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 20 } },
      required: ['ids'],
    },
    run: (args) => svc.compare(args.ids ?? []),
  },
  {
    name: 'facets',
    title: 'Facet counts',
    description: 'Every facet value with its count, under an optional filter set.',
    schema: { type: 'object', properties: filterSchema },
    run: (args) => svc.facetsOnly(args),
  },
  {
    name: 'list_providers',
    title: 'Providers',
    description:
      'Hosting providers with their automation (api, cli, terraform, mcp), country, categories and runtimes. Filter with has, country, category, runtime, q.',
    schema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        has: { type: 'array', items: { type: 'string' } },
        country: { type: 'array', items: { type: 'string' } },
        category: { type: 'array', items: { type: 'string' } },
        runtime: { type: 'array', items: { type: 'string' } },
        green: { type: 'boolean' },
        sort: { type: 'string', enum: ['name', 'servers', 'price'] },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
    run: (args) => svc.providers(args),
  },
  {
    name: 'get_provider',
    title: 'One provider',
    description: 'A provider by slug or domain, with every offer it sells here.',
    schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
    run: (args) => svc.provider(String(args.slug ?? '')),
  },
  {
    name: 'deals',
    title: 'Hosting deals',
    description: 'Current hosting deals and industry stories.',
    schema: { type: 'object', properties: { limit: { type: 'integer' } } },
    run: (args) => svc.deals({ limit: args.limit ?? 50 }),
  },
  {
    name: 'stats',
    title: 'What is indexed',
    description: 'Counts of servers, providers, countries, GPU offers and the last sync.',
    schema: { type: 'object', properties: {} },
    run: () => svc.stats(),
  },
  {
    name: 'save_search',
    title: 'Save a search',
    description: 'Save a filter set under a name on the caller’s account.',
    key: true,
    schema: {
      type: 'object',
      properties: { name: { type: 'string' }, query: { type: 'object', properties: filterSchema } },
      required: ['query'],
    },
    run: (args, ctx) => svc.saveSearch(needUser(ctx), args),
  },
  {
    name: 'saved_searches',
    title: 'Saved searches',
    description: 'The caller’s saved searches, each with its URL, curl and CLI form.',
    key: true,
    schema: { type: 'object', properties: {} },
    run: (_args, ctx) => svc.listSaved(needUser(ctx)),
  },
  {
    name: 'delete_saved_search',
    title: 'Delete a saved search',
    description: 'Remove one saved search by id.',
    key: true,
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) => svc.deleteSaved(needUser(ctx), String(args.id ?? '')),
  },
  {
    name: 'redeem_code',
    title: 'Redeem a credit code',
    description:
      'Redeem a credit code (CR-…) on the caller’s account for days of the pass: no hourly allowance and 500 rows a page on every key, the CLI and MCP while it runs.',
    key: true,
    schema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    run: async (args, ctx) => {
      const r = await credits.redeemCode(needUser(ctx).id, args.code);
      if (!r.ok) throw toolError(r.error);
      return { ok: true, unit: credits.UNIT, days: r.days, pass_until: r.until };
    },
  },
  {
    name: 'list_invites',
    title: 'My invites',
    description:
      'The caller’s invites (quota, status of each) and open affiliate link. Invites are scarce and single use.',
    key: true,
    schema: { type: 'object', properties: {} },
    run: (_args, ctx) => credits.myInvites(needUser(ctx)),
  },
  {
    name: 'create_invite',
    title: 'Make an invite',
    description:
      'Make one invite link from the caller’s quota. The link is returned once; both sides get days of the pass when a new account is made from it.',
    key: true,
    schema: { type: 'object', properties: { note: { type: 'string' } } },
    run: async (args, ctx) => {
      const r = await credits.createInvite(needUser(ctx), { note: args.note });
      if (!r.ok) throw toolError(r.error);
      return r.invite;
    },
  },
  ...webhookTools(),
];

/** The /api/v1/webhooks API as tools: endpoints on the caller's account. */
function webhookTools() {
  const ID = { type: 'string', description: 'The endpoint id (wh_…), from list_webhooks.' };
  const EVENTS = {
    type: 'array',
    items: { type: 'string' },
    description: `Event patterns ("*", an exact type or "server.*"). Types: ${EVENT_TYPES.join(', ')}.`,
  };
  const asOwner = (fn) => async (args, ctx) => {
    const owner = String(needUser(ctx).id);
    try {
      return await fn(args, owner);
    } catch (err) {
      if (err instanceof WebhookError) throw toolError(err.message);
      throw err;
    }
  };
  return [
    {
      name: 'list_webhooks',
      title: 'Your webhooks',
      description:
        'The caller’s webhook endpoints (url, event filters, on/off, failures) and the event types r4ck sends: server.listed and server.price_dropped for offers matching a saved search, pass.granted, api_key.created, api_key.revoked.',
      key: true,
      readOnly: true,
      schema: { type: 'object', properties: {} },
      run: asOwner(async (_a, owner) => ({
        endpoints: await hooks().listEndpoints(owner),
        event_types: EVENT_TYPES,
      })),
    },
    {
      name: 'create_webhook',
      title: 'Add a webhook',
      description:
        'Register an https URL to receive the caller’s events as signed POSTs (CloudEvents body, Standard Webhooks headers). Returns the endpoint and its signing secret (whsec_…), shown once.',
      key: true,
      readOnly: false,
      schema: {
        type: 'object',
        properties: { url: { type: 'string' }, events: EVENTS, description: { type: 'string' } },
        required: ['url'],
      },
      run: asOwner((a, owner) =>
        hooks().createEndpoint(owner, {
          url: String(a.url ?? ''),
          events: a.events,
          description: String(a.description ?? ''),
        }),
      ),
    },
    {
      name: 'update_webhook',
      title: 'Change a webhook',
      description:
        'Change an endpoint’s url, events or description, or switch it on/off (switching on clears its failure count).',
      key: true,
      readOnly: false,
      schema: {
        type: 'object',
        properties: {
          id: ID,
          url: { type: 'string' },
          events: EVENTS,
          description: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
      run: asOwner((a, owner) => {
        const { id, ...patch } = a;
        return hooks().updateEndpoint(owner, String(id ?? ''), patch);
      }),
    },
    {
      name: 'delete_webhook',
      title: 'Remove a webhook',
      description: 'Delete an endpoint and its delivery log.',
      key: true,
      readOnly: false,
      schema: { type: 'object', properties: { id: ID }, required: ['id'] },
      run: asOwner((a, owner) => hooks().deleteEndpoint(owner, String(a.id ?? ''))),
    },
    {
      name: 'test_webhook',
      title: 'Send a test delivery',
      description:
        'Send a signed webhook.test event to the endpoint now and report the HTTP status.',
      key: true,
      readOnly: false,
      schema: { type: 'object', properties: { id: ID }, required: ['id'] },
      run: asOwner((a, owner) => hooks().test(owner, String(a.id ?? ''))),
    },
    {
      name: 'rotate_webhook_secret',
      title: 'Replace a webhook’s signing secret',
      description: 'Mint a new signing secret and return it; the old one stops working at once.',
      key: true,
      readOnly: false,
      schema: { type: 'object', properties: { id: ID }, required: ['id'] },
      run: asOwner((a, owner) => hooks().rotateSecret(owner, String(a.id ?? ''))),
    },
    {
      name: 'webhook_deliveries',
      title: 'Webhook delivery log',
      description:
        'Recent deliveries (status, attempts, last HTTP status or error, payload), for one endpoint or all.',
      key: true,
      readOnly: true,
      schema: {
        type: 'object',
        properties: {
          id: { ...ID, description: 'Only this endpoint; omit for all.' },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
      run: asOwner(async (a, owner) => ({
        deliveries: await hooks().deliveries(owner, {
          endpointId: a.id ? String(a.id) : undefined,
          limit: Math.min(Number(a.limit) || 50, 200),
        }),
      })),
    },
  ];
}

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const OPEN_TOOLS = TOOLS.filter((t) => !t.key).map((t) => t.name);

function needUser(ctx) {
  if (!ctx.user)
    throw toolError(
      `This tool needs an API key: send Authorization: Bearer r4k_… (make one at ${config.siteUrl}/settings).`,
    );
  return ctx.user;
}

export const describe = (t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.schema,
  annotations: {
    readOnlyHint:
      t.readOnly ??
      !['save_search', 'delete_saved_search', 'redeem_code', 'create_invite'].includes(t.name),
    openWorldHint: false,
  },
});

export async function runTool(tool, args, ctx) {
  try {
    return await tool.run(args ?? {}, ctx);
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw toolError(err.message);
    throw err;
  }
}

export const PARAM_NAMES = ALL_PARAMS;
