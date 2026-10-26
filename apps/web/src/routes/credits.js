/**
 * Credit codes and invites, served: the "Have a code?" redeem endpoint (on
 * /settings), /account/invites and its API, the /i/<code> landing, ?ref=
 * affiliate links and the admin's mint. Everything that decides anything is in
 * lib/credits.js.
 *
 * Every write answers on two paths: /api/v1/... for API callers (always JSON,
 * see wantsJson) and a twin without the prefix for the page's plain forms,
 * which get a 303 (or the page) back.
 */
import { config } from '@r4ck/config';
import { getCookie, setCookie } from 'hono/cookie';
import * as lib from '../lib/credits.js';
import { callerAddress } from '../lib/gate.js';
import { Denied, render, requireUser, respond, wantsJson } from '../lib/http.js';
import { InviteLanding, InvitesPage } from '../views/credits.jsx';
import { INVITE_COOKIE, REF_COOKIE } from './auth.js';
import { settingsPage } from './pages.js';

const requireAdmin = (c) => {
  const user = requireUser(c);
  if (user.role !== 'admin') throw new Denied('Admins only.', 403);
  return user;
};

async function readBody(c) {
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('application/json')) return (await c.req.json().catch(() => ({}))) ?? {};
  return c.req.parseBody();
}

const cookieOpts = (maxAge) => ({
  path: '/',
  maxAge,
  sameSite: 'Lax',
  httpOnly: true,
  secure: config.isProd,
});

/**
 * ?ref=<code> on any page, before sign-up: remember it for the account the
 * emailed link creates (first touch, so an existing cookie is kept).
 */
export async function rememberRef(c, next) {
  const ref = c.req.query('ref');
  if (
    ref &&
    c.req.method === 'GET' &&
    /^[A-Za-z0-9]{6,16}$/.test(ref) &&
    !getCookie(c, REF_COOKIE) &&
    !getCookie(c, config.session.cookie)
  )
    setCookie(c, REF_COOKIE, ref.toUpperCase(), cookieOpts(30 * 86400));
  await next();
}

export function registerCredits(app, deps = {}) {
  const svc = () => deps.services ?? lib.services();

  /* --------------------------------------------------------- credit codes -- */

  app.on('POST', ['/api/v1/credits/redeem', '/settings/redeem'], async (c) => {
    const user = requireUser(c);
    const body = await readBody(c);
    const r = await lib.redeemCode(user.id, body.code, svc());
    if (!r.ok)
      return respond(c, {
        json: { ok: false, reason: r.reason, error: r.error },
        status: r.reason === 'grant_failed' ? 500 : 400,
        redirectTo: '/settings#redeem',
        error: r.error,
      });
    return respond(c, {
      json: { ok: true, unit: lib.UNIT, days: r.days, pass_until: r.until },
      redirectTo: '/settings#redeem',
      notice: `Redeemed: ${r.days} day${r.days === 1 ? '' : 's'} of pass added. Your account is unmetered until ${new Date(r.until).toUTCString()}.`,
    });
  });

  app.get('/api/v1/pass', async (c) => c.json(await lib.passFor(requireUser(c))));

  /* ------------------------------------------------------------- invites -- */

  app.get('/invites', (c) => c.redirect('/account/invites', 302));

  app.get('/account/invites', async (c) => {
    const user = requireUser(c);
    const mine = await lib.myInvites(user, { origin: lib.originFrom(c) }, svc());
    c.header('cache-control', 'private, no-store');
    return c.html(
      await render(
        <InvitesPage
          user={user}
          data={mine}
          notice={c.req.query('notice')}
          error={c.req.query('error')}
        />,
      ),
    );
  });

  app.get('/api/v1/invites', async (c) => {
    const user = requireUser(c);
    return c.json(await lib.myInvites(user, { origin: lib.originFrom(c) }, svc()));
  });

  app.on('POST', ['/api/v1/invites', '/account/invites'], async (c) => {
    const user = requireUser(c);
    const body = await readBody(c);
    const origin = lib.originFrom(c);
    const r = await lib.createInvite(
      user,
      { note: body.note, ip: callerAddress(c), origin },
      svc(),
    );
    if (!r.ok)
      return respond(c, {
        json: { ok: false, error: r.error },
        status: 409,
        redirectTo: '/account/invites',
        error: r.error,
      });
    if (wantsJson(c)) return c.json({ ok: true, invite: r.invite }, 201);
    // The plaintext exists only now: render it here, never in a URL.
    const mine = await lib.myInvites(user, { origin }, svc());
    c.header('cache-control', 'private, no-store');
    return c.html(await render(<InvitesPage user={user} data={mine} made={r.invite} />));
  });

  app.on('POST', ['/api/v1/invites/:id/revoke', '/account/invites/:id/revoke'], async (c) => {
    const user = requireUser(c);
    const r = await lib.revokeInvite(user.id, c.req.param('id'), svc());
    if (!r.ok) return respond(c, { status: 404, redirectTo: '/account/invites', error: r.error });
    return respond(c, {
      redirectTo: '/account/invites',
      notice: 'Invite withdrawn; the slot is yours again.',
    });
  });

  /** An invite link: remember the code (it also rides on the emailed link), then sign up. */
  app.get('/i/:code', async (c) => {
    const raw = String(c.req.param('code') ?? '').slice(0, 40);
    const status = await lib.inviteStatus(raw, svc());
    const code = status === 'invalid' ? raw.slice(0, 24) : lib.canonicalInvite(raw);
    const user = c.get('user');
    if (status === 'ok' && !user)
      setCookie(c, INVITE_COOKIE, code, cookieOpts(config.invites.ttlDays * 86400));
    c.header('cache-control', 'private, no-store');
    c.header('x-robots-tag', 'noindex');
    const origin = lib.originFrom(c);
    if (wantsJson(c))
      return c.json({
        code,
        status,
        bonus_days: config.invites.bonusDays,
        signup: `${origin}/signup`,
      });
    return c.html(
      await render(<InviteLanding user={user} code={code} status={status} />),
      status === 'ok' ? 200 : 404,
    );
  });

  /* --------------------------------------------------------------- admin -- */

  app.get('/api/v1/admin/credits', async (c) => {
    requireAdmin(c);
    return c.json({ codes: (await svc().credits.list()).map((x) => lib.codeOut(x)) });
  });

  app.on('POST', ['/api/v1/admin/credits', '/settings/credits'], async (c) => {
    const user = requireAdmin(c);
    const body = await readBody(c);
    let made;
    try {
      made = await lib.mintPassCode(
        {
          days: body.days,
          label: body.label,
          maxRedemptions: body.max || body.max_redemptions || 1,
          expiresInDays: body.expires_days ?? body.expires_in_days ?? null,
          createdBy: user.email,
        },
        svc(),
      );
    } catch (err) {
      if (err.status === 400)
        return respond(c, { status: 400, redirectTo: '/settings#codes', error: err.message });
      throw err;
    }
    if (wantsJson(c)) return c.json({ ok: true, ...made }, 201);
    // Shown once, on the page itself: the plaintext never goes in a URL.
    return settingsPage(c, { freshCode: made });
  });

  app.on(
    'POST',
    ['/api/v1/admin/credits/:id/revoke', '/settings/credits/:id/revoke'],
    async (c) => {
      requireAdmin(c);
      try {
        await svc().credits.revoke(c.req.param('id'));
      } catch {
        return respond(c, { status: 404, redirectTo: '/settings#codes', error: 'No such code.' });
      }
      return respond(c, { redirectTo: '/settings#codes', notice: 'Code revoked.' });
    },
  );
}
