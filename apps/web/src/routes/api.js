import * as auth from '@r4ck/auth';
import { config } from '@r4ck/config';
import { KINDS, SORTS } from '@r4ck/core/facets';
import { meterApi, pricing } from '../lib/gate.js';
import { Denied, requireUser } from '../lib/http.js';
import * as svc from '../lib/service.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-api-key, x-crawl-pass',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-expose-headers':
    'x-plan, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset',
};

const raw = (c) => {
  const out = {};
  for (const [k, v] of new URL(c.req.url).searchParams)
    out[k] = out[k] === undefined ? v : `${out[k]},${v}`;
  return out;
};

export function registerApi(app) {
  app.use('/api/v1/*', async (c, next) => {
    for (const [k, v] of Object.entries(CORS)) c.header(k, v);
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  });
  app.use('/api/v1/*', meterApi);

  app.get('/api/v1', async (c) => {
    const user = c.get('user');
    return c.json({
      name: config.siteName,
      version: 1,
      description: 'The server search engine built for agents.',
      documentation: `${config.siteUrl}/docs/api`,
      llms: `${config.siteUrl}/llms.txt`,
      skill: `${config.siteUrl}/skill.md`,
      mcp: `${config.siteUrl}/mcp`,
      you: { email: user?.email ?? null, plan: c.get('access').plan },
      limits: pricing(),
      endpoints: [
        '/api/v1/search',
        '/api/v1/search.csv',
        '/api/v1/parse',
        '/api/v1/servers/:id',
        '/api/v1/compare',
        '/api/v1/cheapest',
        '/api/v1/facets',
        '/api/v1/providers',
        '/api/v1/providers/:slug',
        '/api/v1/deals',
        '/api/v1/stats',
        '/api/v1/me',
        '/api/v1/keys',
        '/api/v1/saved',
      ],
      kinds: KINDS,
      sorts: SORTS,
      stats: await svc.stats(),
    });
  });

  app.get('/api/v1/search', async (c) => {
    const r = await svc.runSearch(raw(c), { access: c.get('access') });
    c.header('cache-control', 'public, max-age=60');
    return c.json(r);
  });

  app.get('/api/v1/search.csv', async (c) => {
    const access = c.get('access');
    if (!access.bulk)
      throw new Denied('CSV export needs an API key (free, at /settings) or an x402 pass.', 402, {
        key: `${config.siteUrl}/settings`,
        pass: `${config.siteUrl}/crawl`,
      });
    const r = await svc.runSearch(
      { ...raw(c), limit: raw(c).limit ?? 500 },
      { access, withFacets: false },
    );
    const cols = [
      'id',
      'provider',
      'provider_name',
      'name',
      'kind',
      'vcpu',
      'ram_gb',
      'disk_gb',
      'disk_type',
      'gpu',
      'transfer_gb',
      'countries',
      'price',
      'currency',
      'interval',
      'monthly_usd',
      'url',
      'page',
    ];
    const esc = (v) =>
      v === null || v === undefined
        ? ''
        : /[",\n]/.test(String(v))
          ? `"${String(v).replace(/"/g, '""')}"`
          : String(v);
    const lines = [cols.join(',')];
    for (const s of r.servers) {
      lines.push(
        [
          s.id,
          s.provider.slug,
          s.provider.name,
          s.name,
          s.kind,
          s.compute.vcpu,
          s.compute.ram_gb,
          s.storage.disk_gb,
          s.storage.type,
          s.compute.gpu?.model ?? '',
          s.network.transfer_gb,
          s.location.countries.map((x) => x.code).join(' '),
          s.price.amount,
          s.price.currency,
          s.price.interval,
          s.price.monthly_usd,
          s.url,
          s.page,
        ]
          .map(esc)
          .join(','),
      );
    }
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', 'attachment; filename="r4ck-search.csv"');
    return c.body(`${lines.join('\n')}\n`);
  });

  app.get('/api/v1/parse', (c) => c.json(svc.parseOnly(c.req.query('q') ?? '')));
  app.get('/api/v1/cheapest', async (c) =>
    c.json(await svc.cheapest(raw(c), { access: c.get('access') })),
  );
  app.get('/api/v1/facets', async (c) => c.json(await svc.facetsOnly(raw(c))));
  app.get('/api/v1/stats', async (c) => c.json(await svc.stats()));
  app.get('/api/v1/servers/:id', async (c) => {
    c.header('cache-control', 'public, max-age=120');
    return c.json(await svc.serverDetail(c.req.param('id')));
  });
  app.get('/api/v1/compare', async (c) =>
    c.json(await svc.compare(String(c.req.query('ids') ?? '').split(','))),
  );
  app.get('/api/v1/providers', async (c) => c.json(await svc.providers(raw(c))));
  app.get('/api/v1/providers/:slug', async (c) => c.json(await svc.provider(c.req.param('slug'))));
  app.get('/api/v1/deals', async (c) =>
    c.json(await svc.deals({ limit: Number(c.req.query('limit')) || 50 })),
  );

  /* ------------------------------------------------------------- account -- */
  app.get('/api/v1/me', async (c) => {
    const user = requireUser(c);
    const keys = await auth.listApiKeys(user.id);
    return c.json({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: c.get('access').plan,
      keys: keys.map(keyOut),
      saved: (await svc.listSaved(user)).saved,
    });
  });
  app.get('/api/v1/keys', async (c) =>
    c.json({ keys: (await auth.listApiKeys(requireUser(c).id)).map(keyOut) }),
  );
  app.post('/api/v1/keys', async (c) => {
    const user = requireUser(c);
    const body = await c.req.json().catch(() => ({}));
    const created = await auth.createApiKey({
      userId: user.id,
      name: String(body.name ?? 'default').slice(0, 60),
    });
    return c.json(
      {
        key: created.key,
        id: created.id,
        prefix: created.prefix,
        note: 'Shown once. Send it as Authorization: Bearer r4k_…',
      },
      201,
    );
  });
  app.delete('/api/v1/keys/:id', async (c) => {
    const user = requireUser(c);
    await auth.revokeApiKey({ userId: user.id, id: c.req.param('id') });
    return c.json({ ok: true });
  });
  app.get('/api/v1/saved', async (c) => c.json(await svc.listSaved(requireUser(c))));
  app.post('/api/v1/saved', async (c) => {
    const user = requireUser(c);
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      await svc.saveSearch(user, { name: body.name, query: body.query ?? raw(c) }),
      201,
    );
  });
  app.delete('/api/v1/saved/:id', async (c) =>
    c.json(await svc.deleteSaved(requireUser(c), c.req.param('id'))),
  );
}

const keyOut = (k) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  created_at: k.createdAt,
  last_used_at: k.lastUsedAt,
});
