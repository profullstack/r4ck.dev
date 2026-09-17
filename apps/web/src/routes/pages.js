import * as auth from '@r4ck/auth';
import { config } from '@r4ck/config';
import * as accounts from '@r4ck/db/accounts';
import { accessFor } from '../lib/gate.js';
import { Denied, notice, render, requireUser, respond, wantsJson } from '../lib/http.js';
import * as svc from '../lib/service.js';
import { Settings } from '../views/account.jsx';
import { Deals } from '../views/deals.jsx';
import { About, ApiDocs, CliDocs, Pricing } from '../views/docs.jsx';
import { Home } from '../views/home.jsx';
import { Provider, Providers } from '../views/providers.jsx';
import { Compare, Server, Servers } from '../views/servers.jsx';

const raw = (c) => {
  const out = {};
  for (const [k, v] of new URL(c.req.url).searchParams)
    out[k] = out[k] === undefined ? v : `${out[k]},${v}`;
  return out;
};

export function registerPages(app) {
  app.get('/', async (c) => {
    const [stats, cheapest, gpu, providers] = await Promise.all([
      svc.stats(),
      svc.runSearch(
        { kind: 'vps', min_vcpu: 1, min_ram: 1, sort: 'price', limit: 6 },
        { withFacets: false },
      ),
      svc.runSearch({ gpu: '1', sort: 'price', limit: 4 }, { withFacets: false }),
      svc.providers({ has: 'api,cli', sort: 'servers', limit: 12 }),
    ]);
    c.header('cache-control', c.get('user') ? 'private, no-cache' : 'public, max-age=120');
    return c.html(
      await render(
        <Home
          user={c.get('user')}
          stats={stats}
          cheapest={cheapest.servers}
          gpu={gpu.servers}
          providers={providers.providers}
        />,
      ),
    );
  });

  app.get('/servers', async (c) => {
    const params = raw(c);
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(Number(params.limit) || 25, 100);
    const r = await svc.runSearch(
      { ...params, limit, offset: (page - 1) * limit },
      { access: await accessFor(c) },
    );
    if (wantsJson(c)) return c.json(r);
    return c.html(
      await render(<Servers user={c.get('user')} result={r} page={page} params={params} />),
    );
  });
  app.get('/servers.json', (c) => c.redirect(`/api/v1/search${new URL(c.req.url).search}`, 302));
  app.get('/search', (c) => c.redirect(`/servers${new URL(c.req.url).search}`, 302));

  app.get('/servers/:id', async (c) => {
    const d = await svc.serverDetail(c.req.param('id'));
    if (wantsJson(c)) return c.json(d);
    c.header('cache-control', 'public, max-age=120');
    return c.html(await render(<Server user={c.get('user')} detail={d} />));
  });

  app.get('/compare', async (c) => {
    const ids = String(c.req.query('ids') ?? '')
      .split(',')
      .filter(Boolean);
    const d = ids.length ? await svc.compare(ids) : { count: 0, servers: [] };
    if (wantsJson(c)) return c.json(d);
    return c.html(await render(<Compare user={c.get('user')} result={d} />));
  });

  app.get('/providers', async (c) => {
    const params = raw(c);
    const r = await svc.providers({ ...params, limit: 500 });
    if (wantsJson(c)) return c.json(r);
    return c.html(await render(<Providers user={c.get('user')} result={r} params={params} />));
  });
  app.get('/providers/:slug', async (c) => {
    const d = await svc.provider(c.req.param('slug'));
    if (wantsJson(c)) return c.json(d);
    c.header('cache-control', 'public, max-age=120');
    return c.html(await render(<Provider user={c.get('user')} detail={d} />));
  });

  app.get('/deals', async (c) => {
    const d = await svc.deals({ limit: 100 });
    if (wantsJson(c)) return c.json(d);
    return c.html(await render(<Deals user={c.get('user')} deals={d.deals} />));
  });

  app.get('/pricing', async (c) => c.html(await render(<Pricing user={c.get('user')} />)));
  app.get('/about', async (c) =>
    c.html(await render(<About user={c.get('user')} stats={await svc.stats()} />)),
  );
  app.get('/docs', (c) => c.redirect('/docs/api', 302));
  app.get('/docs/api', async (c) => c.html(await render(<ApiDocs user={c.get('user')} />)));
  app.get('/docs/cli', async (c) => c.html(await render(<CliDocs user={c.get('user')} />)));

  /* ------------------------------------------------------------ account -- */
  app.get('/settings', async (c) => {
    const user = requireUser(c);
    const [keys, passkeys, saved] = await Promise.all([
      auth.listApiKeys(user.id),
      accounts.listPasskeys(user.id),
      svc.listSaved(user),
    ]);
    return c.html(
      await render(
        <Settings
          user={user}
          keys={keys}
          passkeys={passkeys}
          saved={saved.saved}
          freshKey={c.req.query('key')}
          {...notice(c)}
        />,
      ),
    );
  });
  app.post('/api/keys', async (c) => {
    const user = requireUser(c);
    const body = await c.req.parseBody();
    const created = await auth.createApiKey({
      userId: user.id,
      name: String(body.name ?? 'default').slice(0, 60),
    });
    if (wantsJson(c)) return c.json(created, 201);
    return c.redirect(`/settings?key=${encodeURIComponent(created.key)}`, 303);
  });
  app.post('/api/keys/:id/revoke', async (c) => {
    const user = requireUser(c);
    await auth.revokeApiKey({ userId: user.id, id: c.req.param('id') });
    return respond(c, { redirectTo: '/settings', notice: 'Key revoked.' });
  });
  app.post('/api/saved', async (c) => {
    const user = requireUser(c);
    const body = await c.req.parseBody();
    let query = {};
    try {
      query = JSON.parse(String(body.query ?? '{}'));
    } catch {
      throw new Denied('Bad query.', 400);
    }
    await svc.saveSearch(user, { name: body.name, query });
    return respond(c, { redirectTo: '/settings', notice: 'Search saved.' });
  });
  app.post('/api/saved/:id/delete', async (c) => {
    const user = requireUser(c);
    await svc.deleteSaved(user, c.req.param('id'));
    return respond(c, { redirectTo: '/settings', notice: 'Saved search removed.' });
  });
  app.post('/api/account/delete', async (c) => {
    const user = requireUser(c);
    const { sql } = await import('@r4ck/db');
    await sql`delete from users where id = ${user.id}`;
    c.header('set-cookie', auth.sessionCookie('', { clear: true }));
    return respond(c, { redirectTo: '/', notice: 'Account deleted.' });
  });
  void config;
}
