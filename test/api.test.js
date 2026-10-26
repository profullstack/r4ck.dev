import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

/**
 * End-to-end over the Hono app against a real Postgres (DATABASE_URL).
 * Seeds a handful of rows, then walks the API, the pages, MCP and the gate.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  test.skip('needs DATABASE_URL', () => {});
} else {
  const { migrate } = await import('@r4ck/db/migrate');
  const { sql } = await import('@r4ck/db');
  const cat = await import('@r4ck/db/catalog');
  const { syncOnce } = await import('@r4ck/sync');
  const { app } = await import('../apps/web/src/app.js');
  const auth = await import('@r4ck/auth');
  const accounts = await import('@r4ck/db/accounts');

  const SEED = [
    {
      id: 90001,
      kind: 'provider',
      source: 'findhost-providers',
      title: 'TestHost',
      summary: 'A test provider',
      url: 'https://www.findhost.app/testhost/',
      tags: ['provider'],
      updated_at: '2026-09-01T00:00:00Z',
      data: {
        provider: 'testhost',
        findhostId: 'testhost',
        country: 'DE',
        attribution: 'FindHost, findhost.app, CC BY 4.0',
        facets: { hqCountry: 'DE', regions: ['DE'], category: ['vps'], automation: ['api', 'cli'] },
      },
      enrichment: { developer: { domain: 'testhost.example' } },
    },
    {
      id: 90002,
      kind: 'plan',
      source: 'vultr-plans',
      adapter: 'vultr-plans',
      title: 'TestHost small',
      summary: 's',
      url: 'https://testhost.example/small',
      tags: ['plan'],
      updated_at: '2026-09-02T00:00:00Z',
      data: {
        provider: 'testhost',
        providerName: 'TestHost',
        offer: {
          id: 'small',
          name: 'small',
          url: 'https://testhost.example/small',
          kind: 'vps',
          compute: { vcpu: 2, ram_mb: 4096 },
          storage: [{ type: 'nvme', size_gb: 40 }],
          network: { transfer_gb: 1000 },
          price: { amount: 6, currency: 'EUR', interval: 'month' },
          location: { countries: ['DE'] },
        },
      },
    },
    {
      id: 90003,
      kind: 'plan',
      source: 'vultr-plans',
      adapter: 'vultr-plans',
      title: 'TestHost gpu',
      summary: 'g',
      url: 'https://testhost.example/gpu',
      tags: ['plan'],
      updated_at: '2026-09-02T00:00:00Z',
      data: {
        provider: 'testhost',
        providerName: 'TestHost',
        offer: {
          id: 'gpu',
          name: 'gpu-h100',
          url: 'https://testhost.example/gpu',
          kind: 'gpu',
          compute: { vcpu: 16, ram_mb: 65536, gpu: { model: 'H100', count: 1, vram_mb: 81920 } },
          storage: [],
          network: {},
          price: { amount: 2.5, currency: 'USD', interval: 'hour' },
          location: { countries: ['US'] },
        },
      },
    },
    {
      id: 90004,
      kind: 'plan',
      source: 'storefronts',
      adapter: 'storefront',
      title: 'Other basic',
      summary: 'o',
      url: 'https://other.example/basic',
      tags: ['plan'],
      updated_at: '2026-09-02T00:00:00Z',
      data: {
        provider: 'other.example',
        providerName: 'Other Ltd',
        platform: 'whmcs',
        offer: {
          id: 'basic',
          name: 'basic',
          url: 'https://other.example/basic',
          kind: 'shared',
          compute: {},
          storage: [],
          network: {},
          price: { amount: 3, currency: 'USD', interval: 'month' },
          location: { countries: [] },
        },
      },
    },
    {
      id: 90005,
      kind: 'deal',
      source: 'lowendbox',
      title: 'Big sale',
      summary: 'd',
      url: 'https://lowendbox.com/x',
      tags: ['deal'],
      published_at: '2026-09-01T00:00:00Z',
      data: {},
    },
    {
      id: 90006,
      kind: 'addon',
      source: 'storefronts',
      title: 'ignored',
      url: 'x',
      tags: [],
      data: {},
    },
  ];
  const req = (path, init = {}) =>
    app.request(path, {
      headers: { accept: 'application/json', 'x-real-ip': '203.0.113.7', ...(init.headers ?? {}) },
      ...init,
    });

  beforeAll(async () => {
    await migrate({ log: () => {} });
    await sql`delete from servers where nichedb_id between 90000 and 90999`;
    await sql`delete from providers where slug in ('testhost', 'other.example')`;
    await sql`delete from deals where nichedb_id between 90000 and 90999`;
    await sql`delete from users where email like '%@test.r4ck'`;
    await syncOnce({
      log: () => {},
      items: (async function* () {
        yield SEED;
      })(),
    });
  });
  afterAll(async () => {
    await sql`delete from servers where nichedb_id between 90000 and 90999`;
    await sql`delete from providers where slug in ('testhost', 'other.example')`;
    await sql`delete from deals where nichedb_id between 90000 and 90999`;
    await sql`delete from users where email like '%@test.r4ck'`;
  });

  describe('sync', () => {
    test('rows land, storefront hosts get a provider, add-ons are skipped', async () => {
      const p = await cat.getProvider('testhost');
      expect(p.domain).toBe('testhost.example');
      expect(Number(p.server_count)).toBe(2);
      const o = await cat.getProvider('other.example');
      expect(o.data.inferred).toBe(true);
      const [{ n }] =
        await sql`select count(*)::int as n from servers where nichedb_id between 90000 and 90999`;
      expect(n).toBe(3);
      const [{ d }] =
        await sql`select count(*)::int as d from deals where nichedb_id between 90000 and 90999`;
      expect(d).toBe(1);
    });
    test('a second sync with a new price records a point', async () => {
      const changed = structuredClone(SEED[1]);
      changed.data.offer.price.amount = 7;
      await syncOnce({
        log: () => {},
        items: (async function* () {
          yield [changed];
        })(),
      });
      const [row] = await sql`select id from servers where nichedb_id = 90002`;
      const points = await cat.priceHistory(row.id);
      expect(points.length).toBe(2);
    });
  });

  describe('api', () => {
    test('search parses a sentence and returns facets', async () => {
      const r = await req('/api/v1/search?q=2+vcpu+4gb+in+germany&provider=testhost');
      expect(r.status).toBe(200);
      expect(r.headers.get('x-plan')).toBe('anon');
      const body = await r.json();
      expect(body.total).toBe(1);
      expect(body.understood).toContain('in germany');
      expect(body.servers[0].name).toBe('small');
      expect(body.servers[0].price.estimate).toBe(true);
      expect(body.servers[0].price.monthly_usd).toBeGreaterThan(6);
      expect(body.facets.kind[0]).toEqual({ value: 'vps', count: 1 });
      expect(body.agent.cli).toContain('r4ck search');
    });
    test('gpu and hourly', async () => {
      const body = await (await req('/api/v1/search?gpu=1&provider=testhost')).json();
      expect(body.total).toBe(1);
      expect(body.servers[0].compute.gpu.model).toBe('H100');
      expect(body.servers[0].price.monthly_usd).toBeCloseTo(1825, 0);
    });
    test('detail, compare, providers, deals, parse, facets, stats', async () => {
      const list = await (await req('/api/v1/search?provider=testhost&sort=price')).json();
      const id = list.servers[0].id;
      const d = await (await req(`/api/v1/servers/${id}`)).json();
      expect(d.server.id).toBe(id);
      expect(d.provider.slug).toBe('testhost');
      expect(d.price_history.length).toBeGreaterThan(0);
      const c = await (
        await req(`/api/v1/compare?ids=${list.servers.map((s) => s.id).join(',')}`)
      ).json();
      expect(c.count).toBe(2);
      const p = await (await req('/api/v1/providers?has=api,cli&q=testhost')).json();
      expect(p.providers.map((x) => x.slug)).toContain('testhost');
      expect((await (await req('/api/v1/providers/testhost.example')).json()).provider.slug).toBe(
        'testhost',
      );
      expect(
        (await (await req('/api/v1/deals')).json()).deals.some((x) => x.title === 'Big sale'),
      ).toBe(true);
      expect((await (await req('/api/v1/parse?q=h100')).json()).filters.gpu_model).toBe('h100');
      expect((await (await req('/api/v1/facets?provider=testhost')).json()).facets.gpu.length).toBe(
        2,
      );
      expect((await (await req('/api/v1/stats')).json()).servers).toBeGreaterThan(0);
      expect((await req('/api/v1/servers/0')).status).toBe(404);
    });
    test('csv needs a credential, keys unlock it, me answers', async () => {
      expect((await req('/api/v1/search.csv')).status).toBe(402);
      const user = await accounts.findOrCreateUser('api@test.r4ck');
      const { key } = await auth.createApiKey({ userId: user.id, name: 't' });
      expect(key.startsWith('r4k_')).toBe(true);
      const csv = await req('/api/v1/search.csv?provider=testhost', {
        headers: { authorization: `Bearer ${key}` },
      });
      expect(csv.status).toBe(200);
      expect(csv.headers.get('x-plan')).toBe('key');
      expect((await csv.text()).split('\n')[0]).toContain('monthly_usd');
      const me = await (
        await req('/api/v1/me', { headers: { authorization: `Bearer ${key}` } })
      ).json();
      expect(me.email).toBe('api@test.r4ck');
      const saved = await req('/api/v1/saved', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'mine', query: { q: '2 vcpu in de' } }),
      });
      expect(saved.status).toBe(201);
      const s = await saved.json();
      expect(s.saved.query.min_vcpu).toBe(2);
      expect(
        (
          await req(`/api/v1/saved/${s.saved.id}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${key}` },
          })
        ).status,
      ).toBe(200);
      expect((await req('/api/v1/me')).status).toBe(401);
    });
  });

  describe('pages and gate', () => {
    test('html pages render', async () => {
      for (const p of [
        '/',
        '/servers?q=gpu',
        '/providers',
        '/providers/testhost',
        '/deals',
        '/pricing',
        '/docs/api',
        '/docs/cli',
        '/docs/mcp',
        '/login',
        '/llms.txt',
        '/skill.md',
        '/robots.txt',
        '/manifest.webmanifest',
        '/.well-known/openmcp.json',
        '/sitemap.xml',
      ]) {
        const r = await app.request(p, {
          headers: { accept: 'text/html', 'x-real-ip': '203.0.113.8' },
        });
        expect([p, r.status]).toEqual([p, 200]);
      }
      expect((await app.request('/settings', { headers: { accept: 'text/html' } })).status).toBe(
        303,
      );
      expect((await app.request('/nowhere', { headers: { accept: 'text/html' } })).status).toBe(
        404,
      );
    });
    test('robots.txt refuses GoogleOther and still welcomes Googlebot', async () => {
      const txt = await (await app.request('/robots.txt')).text();
      expect(txt).toContain('User-agent: GoogleOther\nDisallow: /\n');
      expect(txt).toContain('User-agent: *\nAllow: /');
    });
    test('GoogleOther gets a bare 403 but can still read robots.txt; Googlebot is served', async () => {
      const ua = (bot) => ({
        headers: { 'user-agent': `Mozilla/5.0 (compatible; ${bot})`, 'x-real-ip': '203.0.113.20' },
      });
      const refused = await app.request('/api/v1/search?kind=vps', ua('GoogleOther'));
      expect(refused.status).toBe(403);
      expect((await refused.text()).length).toBeLessThan(100);
      expect((await app.request('/servers', ua('GoogleOther'))).status).toBe(403);
      expect((await app.request('/robots.txt', ua('GoogleOther'))).status).toBe(200);
      // Googlebot is served from Google's published range; the same string from
      // anywhere else is an impostor and is charged (x402-gateway 0.10).
      const google = {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
          'x-real-ip': '66.249.66.1',
        },
      };
      expect((await app.request('/servers', google)).status).toBe(200);
      expect((await app.request('/servers', ua('Googlebot/2.1'))).status).toBe(402);
    });
    test('training crawlers get 402, readers do not', async () => {
      expect(
        (
          await app.request('/servers', {
            headers: { 'user-agent': 'GPTBot/1.0', 'x-real-ip': '203.0.113.9' },
          })
        ).status,
      ).toBe(402);
      expect(
        (
          await app.request('/servers', {
            headers: {
              'user-agent': 'Mozilla/5.0 Chrome/128',
              'sec-fetch-mode': 'navigate',
              'x-real-ip': '203.0.113.9',
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await app.request('/api/v1/stats', {
            headers: { 'user-agent': 'GPTBot/1.0', 'x-real-ip': '203.0.113.9' },
          })
        ).status,
      ).toBe(200);
    });
    test('magic link creates the account and a session', async () => {
      const link = await auth.createLoginLink('magic@test.r4ck', { next: '/settings' });
      const r = await app.request(link.replace(/^https?:\/\/[^/]+/, ''), {
        headers: { accept: 'text/html' },
      });
      expect(r.status).toBe(303);
      const cookie = r.headers.get('set-cookie');
      expect(cookie).toContain('r4k_session=');
      const me = await app.request('/api/v1/me', {
        headers: { accept: 'application/json', cookie: cookie.split(';')[0] },
      });
      expect((await me.json()).email).toBe('magic@test.r4ck');
      expect(
        (
          await app.request(link.replace(/^https?:\/\/[^/]+/, ''), {
            headers: { accept: 'text/html' },
          })
        ).status,
      ).toBe(400);
    });
    test('signup asks for the profile fields; sign-in does not', async () => {
      const signup = await (
        await app.request('/signup', { headers: { accept: 'text/html' } })
      ).text();
      for (const name of ['first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'])
        expect(signup).toContain(`name="${name}"`);
      // The shared footer's newsletter form (@profullstack/footer 0.3+) has its own email field.
      const signupForm = signup.slice(0, signup.indexOf('class="pfs-footer'));
      expect(signupForm.match(/name="email"/g)?.length).toBe(1);
      expect(signup).toContain('/vendor-profile.js');
      const login = await (
        await app.request('/login', { headers: { accept: 'text/html' } })
      ).text();
      expect(login).not.toContain('name="first_name"');
      const script = await app.request('/vendor-profile.js');
      expect(script.headers.get('content-type')).toContain('javascript');
    });
    test('a signup with the fields stores them on verify', async () => {
      const post = (fields) =>
        app.request('/api/auth/magic', {
          method: 'POST',
          headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ mode: 'signup', next: '/settings', ...fields }),
        });
      await sql`delete from login_tokens where email = 'ada@acme.test'`;
      await sql`delete from users where email = 'ada@acme.test'`;
      // Refused before any link exists, with what was typed kept.
      const refused = await post({ email: 'ada@acme.test', first_name: 'Ada' });
      expect(refused.status).toBe(400);
      const page = await refused.text();
      expect(page).toContain('value="Ada"');
      expect(page).toContain('name="last_name"');
      expect((await sql`select 1 from login_tokens where email = 'ada@acme.test'`).length).toBe(0);

      const ok = await post({
        email: 'Ada@Acme.test',
        first_name: 'Ada',
        last_name: 'Lovelace',
        company_domain: 'https://www.acme.test/about',
        job_title: 'VP Engineering',
        linkedin_url: 'in/ada-lovelace',
      });
      expect(ok.status).toBe(200);
      // Carried on the token, normalized, as a jsonb object (not a JSON string).
      const [row] = await sql`
        select profile, jsonb_typeof(profile) as t from login_tokens
        where email = 'ada@acme.test' and profile is not null limit 1
      `;
      expect(row.t).toBe('object');
      // The emailed URL is not readable here, so a link is minted with the same
      // carried fields; spending it must save them.
      const carried = typeof row.profile === 'string' ? JSON.parse(row.profile) : row.profile;
      const link = await auth.createLoginLink('ada@acme.test', { profile: carried });
      const r = await app.request(link.replace(/^https?:\/\/[^/]+/, ''), {
        headers: { accept: 'text/html' },
      });
      expect(r.status).toBe(303);
      const cookie = r.headers.get('set-cookie').split(';')[0];
      const got = await app.request('/api/v1/me/profile', {
        headers: { accept: 'application/json', cookie },
      });
      expect(got.status).toBe(200);
      expect(JSON.stringify(await got.json())).toContain('"company_domain":"acme.test"');
      const [saved] = await sql`
        select p.* from user_profiles p join users u on u.id = p.user_id
        where u.email = 'ada@acme.test'
      `;
      expect(saved).toMatchObject({
        email: 'ada@acme.test',
        first_name: 'Ada',
        last_name: 'Lovelace',
        company_domain: 'acme.test',
        job_title: 'VP Engineering',
        linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
      });
      // Settings shows the same fields, prefilled, and saves them without script.
      const settings = await app.request('/settings', { headers: { accept: 'text/html', cookie } });
      expect(await settings.text()).toContain('value="VP Engineering"');
      const edit = await app.request('/settings/contact', {
        method: 'POST',
        headers: {
          accept: 'text/html',
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ first_name: 'Ada', last_name: 'King', job_title: 'CTO' }),
      });
      expect(edit.status).toBe(303);
      const [edited] = await sql`
        select p.last_name, p.job_title from user_profiles p join users u on u.id = p.user_id
        where u.email = 'ada@acme.test'
      `;
      expect(edited).toEqual({ last_name: 'King', job_title: 'CTO' });
      // Handed out once: the spent token no longer holds it.
      const spent = await sql`
        select 1 from login_tokens
        where email = 'ada@acme.test' and consumed_at is not null and profile is not null
      `;
      expect(spent.length).toBe(0);
      expect((await app.request('/api/v1/me/profile')).status).toBe(401);
    });
  });

  describe('mcp', () => {
    const rpc = (body, headers = {}) =>
      app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.10', ...headers },
        body: JSON.stringify(body),
      });
    test('initialize, list, call', async () => {
      const init = await (
        await rpc({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18' },
        })
      ).json();
      expect(init.result.serverInfo.name).toBe('r4ck');
      const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
      expect(list.result.tools.map((t) => t.name)).toContain('search_servers');
      const call = await (
        await rpc({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'search_servers', arguments: { provider: ['testhost'], gpu: true } },
        })
      ).json();
      expect(call.result.structuredContent.total).toBe(1);
      const denied = await (
        await rpc({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'saved_searches', arguments: {} },
        })
      ).json();
      expect(denied.result.isError).toBe(true);
      expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
      const res = await (
        await rpc({
          jsonrpc: '2.0',
          id: 5,
          method: 'resources/read',
          params: { uri: 'http://localhost:3000/skill.md' },
        })
      ).json();
      expect(res.result.contents[0].text).toContain('# r4ck');
    });
  });
}
