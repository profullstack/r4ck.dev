import { afterAll, describe, expect, test } from 'bun:test';

/**
 * Customer webhooks end to end against a real Postgres (DATABASE_URL): the
 * Bun.SQL adapter, /api/v1/webhooks behind the key, api_key.* events, and the
 * watcher path (a sync tick lists and cuts an offer that matches a saved
 * search). Deliveries go to a stub fetch, never to the network.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  test.skip('needs DATABASE_URL', () => {});
} else {
  const { migrate } = await import('@r4ck/db/migrate');
  const { sql } = await import('@r4ck/db');
  const cat = await import('@r4ck/db/catalog');
  const { syncTick } = await import('@r4ck/sync');
  const accounts = await import('@r4ck/db/accounts');
  const auth = await import('@r4ck/auth');
  const { app } = await import('../apps/web/src/app.js');
  const wh = await import('../apps/web/src/lib/webhooks.js');
  const { verifySignature } = wh;

  const EMAIL = 'hooks@webhooks.test.r4ck';
  const PROVIDER = 'whtest';
  const sent = [];
  const fetchStub = async (to, init) => {
    sent.push({ url: String(to), headers: new Headers(init.headers), body: String(init.body) });
    return new Response(null, { status: 204 });
  };
  const hub = wh.makeHooks({
    fetchImpl: fetchStub,
    guard: { lookup: async () => ['93.184.216.34'] },
  });
  wh.setHooks(hub);

  const plan = (id, price, updated) => ({
    id,
    kind: 'plan',
    source: 'vultr-plans',
    adapter: 'vultr-plans',
    title: `wh plan ${id}`,
    tags: ['plan'],
    updated_at: updated,
    data: {
      provider: PROVIDER,
      providerName: 'WhTest',
      offer: {
        id: `wh-${id}`,
        name: `wh-${id}`,
        url: 'https://whtest.example/x',
        kind: 'vps',
        compute: { vcpu: 2, ram_mb: 2048 },
        storage: [],
        network: {},
        price: { amount: price, currency: 'USD', interval: 'month' },
        location: { countries: ['US'] },
      },
    },
  });

  async function clean() {
    await sql`delete from servers where provider = ${PROVIDER}`;
    await sql`delete from providers where slug = ${PROVIDER}`;
    const [u] = await sql`select id from users where email = ${EMAIL}`;
    if (u) {
      await wh.forgetOwner(u.id);
      await sql`delete from users where id = ${u.id}`;
    }
  }

  const call = (key, path, init = {}) =>
    app.request(path, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-real-ip': '198.51.100.21',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  let key;
  let secret;
  let endpointId;

  afterAll(async () => {
    await clean();
  });

  describe('Bun.SQL adapter', () => {
    test('query(text, params) answers { rows } with $n params', async () => {
      await migrate({ log: () => {} });
      const q = wh.pgQuery(sql);
      const r = await q.query('select $1::int + 1 as n, $2::text as s', [41, 'x']);
      expect(r.rows).toEqual([{ n: 42, s: 'x' }]);
      expect((await q.query('select 1 as one')).rows[0].one).toBe(1);
    });
  });

  describe('/api/v1/webhooks', () => {
    test('needs a key; lists the event types; creates an endpoint with a secret', async () => {
      await clean();
      const user = await accounts.findOrCreateUser(EMAIL);
      key = (await auth.createApiKey({ userId: user.id, name: 'hooks' })).key;

      expect((await call(null, '/api/v1/webhooks')).status).toBe(401);

      const list = await call(key, '/api/v1/webhooks');
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.endpoints).toEqual([]);
      expect(body.event_types).toEqual(expect.arrayContaining(wh.EVENT_TYPES));

      const bad = await call(key, '/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.example.com/r4ck', events: ['nope.*'] }),
      });
      expect(bad.status).toBe(400);

      const created = await call(key, '/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          url: 'https://hooks.example.com/r4ck',
          events: ['server.*', 'api_key.created'],
          description: 'test receiver',
        }),
      });
      expect(created.status).toBe(201);
      const c = await created.json();
      secret = c.secret;
      endpointId = c.endpoint.id;
      expect(secret).toStartWith('whsec_');
      expect(c.endpoint.events).toEqual(['server.*', 'api_key.created']);
    });

    test('a new key emits api_key.created, signed so a Standard Webhooks receiver verifies it', async () => {
      sent.length = 0;
      const r = await call(key, '/api/v1/keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'ci' }),
      });
      expect(r.status).toBe(201);
      const made = await r.json();
      await hub.drain();
      expect(sent.length).toBe(1);
      const d = sent[0];
      expect(d.url).toBe('https://hooks.example.com/r4ck');
      expect(verifySignature({ headers: d.headers, body: d.body, secret }).ok).toBe(true);
      expect(verifySignature({ headers: d.headers, body: d.body, secret: 'whsec_AAAA' }).ok).toBe(
        false,
      );
      const event = JSON.parse(d.body);
      expect(event.type).toBe('api_key.created');
      expect(event.data).toEqual({ id: made.id, name: 'ci', prefix: made.prefix });
      expect(d.body).not.toContain(made.key);

      // Not subscribed to api_key.revoked: nothing goes out.
      sent.length = 0;
      await call(key, `/api/v1/keys/${made.id}`, { method: 'DELETE' });
      await hub.drain();
      expect(sent.length).toBe(0);
    });
  });

  describe('watchers', () => {
    test('a sync tick that lists, then cuts, an offer on a saved search notifies its owner', async () => {
      const saved = await call(key, '/api/v1/saved', {
        method: 'POST',
        body: JSON.stringify({ name: 'whtest boxes', query: { provider: PROVIDER } }),
      });
      expect(saved.status).toBe(201);
      // No walk due: only the recent page is read.
      const state = (await cat.getSyncState('nichedb')) ?? {};
      await cat.setSyncState('nichedb', {
        ...state,
        walk: null,
        walkCompletedAt: new Date().toISOString(),
      });
      const tick = (items) =>
        syncTick({
          log: () => {},
          client: { recent: async () => items, page: async () => [] },
          walkEveryMs: 86_400_000,
          onChanges: (changes) => wh.notifyWatchers(changes),
        });

      sent.length = 0;
      await tick([plan(93001, 10, '2026-10-28T00:00:00Z')]);
      await hub.drain();
      expect(sent.length).toBe(1);
      let event = JSON.parse(sent[0].body);
      expect(event.type).toBe('server.listed');
      expect(event.subject).toStartWith('saved_search:');
      expect(event.data.saved_search.name).toBe('whtest boxes');
      expect(event.data.total).toBe(1);
      expect(event.data.servers[0].name).toBe('wh-93001');

      // Same price again: nothing.
      sent.length = 0;
      await tick([plan(93001, 10, '2026-10-28T01:00:00Z')]);
      await hub.drain();
      expect(sent.length).toBe(0);

      // Cheaper: server.price_dropped with the old price.
      await tick([plan(93001, 8, '2026-10-28T02:00:00Z')]);
      await hub.drain();
      expect(sent.length).toBe(1);
      event = JSON.parse(sent[0].body);
      expect(event.type).toBe('server.price_dropped');
      expect(event.data.servers[0].price.amount).toBe(8);
      expect(event.data.servers[0].price_before).toEqual({ price: 10, currency: 'USD' });
      expect(verifySignature({ headers: sent[0].headers, body: sent[0].body, secret }).ok).toBe(
        true,
      );

      // Dearer again: no event.
      sent.length = 0;
      await tick([plan(93001, 12, '2026-10-28T03:00:00Z')]);
      await hub.drain();
      expect(sent.length).toBe(0);

      // A paused endpoint hears nothing.
      await hub.updateEndpoint(String((await accounts.findOrCreateUser(EMAIL)).id), endpointId, {
        enabled: false,
      });
      await tick([plan(93002, 3, '2026-10-28T04:00:00Z')]);
      await hub.drain();
      expect(sent.length).toBe(0);
    }, 30_000);
  });

  describe('mcp', () => {
    test('list_webhooks answers for the key; without one it is a tool error', async () => {
      const rpc = (k, name) =>
        call(k, '/mcp', {
          method: 'POST',
          headers: { accept: 'application/json, text/event-stream' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: {} },
          }),
        }).then((r) => r.json());
      const ok = await rpc(key, 'list_webhooks');
      const out = ok.result.structuredContent ?? JSON.parse(ok.result.content[0].text);
      expect(out.endpoints.map((e) => e.id)).toContain(endpointId);
      expect(out.event_types).toEqual(wh.EVENT_TYPES);
      const anon = await rpc(null, 'list_webhooks');
      expect(anon.result?.isError ?? Boolean(anon.error)).toBe(true);
    });
  });

  describe('settings page', () => {
    test('shows the panel; the form adds an endpoint and shows its secret once', async () => {
      const page = await call(key, '/settings', { headers: { accept: 'text/html' } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('id="webhooks"');
      const r = await app.request('/settings/webhooks', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'text/html',
          'content-type': 'application/x-www-form-urlencoded',
          'x-real-ip': '198.51.100.21',
        },
        body: 'url=https%3A%2F%2Fhooks.example.com%2Fsecond&events=pass.granted&events=server.listed',
      });
      expect(r.status).toBe(200);
      const html = await r.text();
      expect(html).toContain('whsec_');
      const list = await (await call(key, '/api/v1/webhooks')).json();
      const second = list.endpoints.find((e) => e.url.endsWith('/second'));
      expect(second.events).toEqual(['pass.granted', 'server.listed']);
    });
  });
}
