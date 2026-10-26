import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

/**
 * Credit codes and invites end to end over the Hono app against a real
 * Postgres (DATABASE_URL): a code grants days of the pass to the account, an
 * invite pays both sides once for a new, link-confirmed account, and the spam
 * checks withhold it.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  test.skip('needs DATABASE_URL', () => {});
} else {
  const { migrate } = await import('@r4ck/db/migrate');
  const { sql } = await import('@r4ck/db');
  const { app } = await import('../apps/web/src/app.js');
  const auth = await import('@r4ck/auth');
  const accounts = await import('@r4ck/db/accounts');
  const lib = await import('../apps/web/src/lib/credits.js');

  const DOMAIN = 'credits.test.r4ck';
  const path = (link) => link.replace(/^https?:\/\/[^/]+/, '');
  const sessionOf = (r) =>
    r.headers
      .getSetCookie()
      .find((c) => c.startsWith('r4k_session='))
      ?.split(';')[0];

  /** Make an account through the emailed link, as a person would. */
  async function signUp(email, { invite = null, cookie = '', ip = '198.51.100.1' } = {}) {
    const link = await auth.createLoginLink(email, { next: '/settings', invite });
    const r = await app.request(path(link), {
      headers: { accept: 'text/html', cookie, 'x-real-ip': ip },
    });
    expect(r.status).toBe(303);
    const session = sessionOf(r);
    const user = await accounts.findOrCreateUser(email);
    return { session, user, response: r };
  }
  const api = (session, p, init = {}) =>
    app.request(p, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-real-ip': '198.51.100.9',
        cookie: session,
        ...(init.headers ?? {}),
      },
    });
  const age = (userId, days) =>
    sql`update users set created_at = now() - make_interval(days => ${days}::int) where id = ${userId}::uuid`;

  async function cleanup() {
    const ids = (await sql`select id::text as id from users where email like ${`%@${DOMAIN}`}`).map(
      (r) => r.id,
    );
    for (const id of ids) {
      await sql`delete from credit_redemptions where user_id = ${id}`;
      await sql`delete from credit_ledger where user_id = ${id}`;
      await sql`delete from credit_accounts where user_id = ${id}`;
      await sql`delete from aff_invites where inviter_id = ${id} or used_by = ${id}`;
      await sql`delete from aff_quotas where user_id = ${id}`;
      await sql`delete from aff_codes where user_id = ${id}`;
      await sql`delete from aff_attributions where user_id = ${id} or affiliate_id = ${id}`;
    }
    await sql`delete from credit_codes where label like 'test:%'`;
    await sql`delete from users where email like ${`%@${DOMAIN}`}`;
  }

  beforeAll(async () => {
    await migrate({ log: () => {} });
    await cleanup();
  });
  afterAll(cleanup);

  describe('rules', () => {
    test('same mailbox, throwaway inboxes, same network, monthly cap', () => {
      expect(lib.canonicalMailbox('A.Da+x@GoogleMail.com')).toBe('ada@gmail.com');
      expect(lib.isDisposableEmail('x@mailinator.com')).toBe(true);
      expect(lib.isDisposableEmail('x@eu.mailinator.com')).toBe(true);
      expect(lib.isDisposableEmail('x@acme.dev')).toBe(false);
      const base = {
        inviterEmail: 'ada@acme.dev',
        inviteeEmail: 'bob@acme.dev',
        inviterIpHash: 'a',
        inviteeIpHash: 'b',
        inviterBonuses30d: 0,
      };
      expect(lib.bonusVerdict(base).ok).toBe(true);
      expect(lib.bonusVerdict({ ...base, inviteeEmail: 'ada+2@acme.dev' }).reason).toBe(
        'same mailbox',
      );
      expect(lib.bonusVerdict({ ...base, inviteeEmail: 'b@yopmail.com' }).reason).toBe(
        'disposable email',
      );
      expect(lib.bonusVerdict({ ...base, inviteeIpHash: 'a' }).ok).toBe(false);
      expect(lib.bonusVerdict({ ...base, inviterBonuses30d: 10 }).ok).toBe(false);
      expect(lib.looksLikeInvite('inv 7k3m qx9d 2f8h')).toBe(true);
      expect(lib.looksLikeInvite('12345')).toBe(false);
    });
  });

  describe('credit codes', () => {
    test('a code grants pass days once; the account is then served as a pass', async () => {
      const { session, user } = await signUp(`coder@${DOMAIN}`);
      const before = await api(session, '/api/v1/search?limit=1');
      expect(before.headers.get('x-plan')).toBe('session');

      const minted = await lib.mintPassCode({ days: 3, label: 'test:three', maxRedemptions: 2 });
      expect(minted.code).toMatch(/^CR-/);

      const r = await api(session, '/api/v1/credits/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: minted.code.toLowerCase() }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.days).toBe(3);
      const until = new Date(body.pass_until).getTime();
      expect(Math.round((until - Date.now()) / 86_400_000)).toBe(3);

      const again = await api(session, '/api/v1/credits/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: minted.code }),
      });
      expect(again.status).toBe(400);
      expect((await again.json()).reason).toBe('already_redeemed');

      const after = await api(session, '/api/v1/search?limit=1');
      expect(after.headers.get('x-plan')).toBe('pass');
      const me = await (await api(session, '/api/v1/me')).json();
      expect(me.pass_until).toBe(body.pass_until);

      // A second code stacks after the first, not on top of today.
      const more = await lib.mintPassCode({ days: 2, label: 'test:two' });
      const r2 = await (
        await api(session, '/api/v1/credits/redeem', {
          method: 'POST',
          body: JSON.stringify({ code: more.code }),
        })
      ).json();
      expect(Math.round((new Date(r2.pass_until).getTime() - Date.now()) / 86_400_000)).toBe(5);

      // The grant is a $0 crawl_sales row owned by the account, and not a sale.
      const rows =
        await sql`select price_cents, source, days from crawl_sales where user_id = ${user.id}::uuid order by created_at`;
      expect(rows.map((x) => [x.price_cents, x.source, x.days])).toEqual([
        [0, 'code', 3],
        [0, 'code', 2],
      ]);
      const settings = await app.request('/settings', {
        headers: { accept: 'text/html', cookie: session },
      });
      const html = await settings.text();
      expect(html).toContain('Have a code?');
      expect(html).toContain('holds the pass until');
    });

    test('bad codes are refused in words; the form path redirects back', async () => {
      const { session } = await signUp(`bad@${DOMAIN}`);
      const r = await api(session, '/api/v1/credits/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: 'CR-0000-0000-0000-0000' }),
      });
      expect(r.status).toBe(400);
      expect((await r.json()).reason).toBe('invalid');
      const form = await app.request('/settings/redeem', {
        method: 'POST',
        headers: {
          accept: 'text/html',
          'content-type': 'application/x-www-form-urlencoded',
          cookie: session,
        },
        body: 'code=nope',
      });
      expect(form.status).toBe(303);
      expect(form.headers.get('location')).toContain('/settings?error=');
    });

    test('the MCP tools redeem and make invites for the key holder', async () => {
      const { TOOLS_BY_NAME } = await import('../apps/web/src/lib/mcp/tools.js');
      const { user } = await signUp(`mcp@${DOMAIN}`);
      const code = await lib.mintPassCode({ days: 1, label: 'test:mcp' });
      const r = await TOOLS_BY_NAME.get('redeem_code').run({ code: code.code }, { user });
      expect(r.days).toBe(1);
      await expect(
        TOOLS_BY_NAME.get('redeem_code').run({ code: code.code }, { user }),
      ).rejects.toThrow('already redeemed');
      await expect(TOOLS_BY_NAME.get('create_invite').run({}, { user })).rejects.toThrow(
        'days old',
      );
      const listed = await TOOLS_BY_NAME.get('list_invites').run({}, { user });
      expect(listed.quota.left).toBe(3);
    });

    test('only an admin mints', async () => {
      const { session } = await signUp(`nonadmin@${DOMAIN}`);
      const r = await api(session, '/api/v1/admin/credits', {
        method: 'POST',
        body: JSON.stringify({ days: 5 }),
      });
      expect(r.status).toBe(403);
    });
  });

  describe('invites', () => {
    test('a young account cannot send; an older one sends, a new account accepts once, both are paid', async () => {
      const { session, user: inviter } = await signUp(`inviter@${DOMAIN}`, {
        ip: '198.51.100.20',
      });
      const young = await api(session, '/api/v1/invites', { method: 'POST', body: '{}' });
      expect(young.status).toBe(409);
      await age(inviter.id, 30);

      const made = await api(session, '/api/v1/invites', {
        method: 'POST',
        body: JSON.stringify({ note: 'for Bob' }),
        headers: { host: 'localhost:4321', 'x-real-ip': '198.51.100.20' },
      });
      expect(made.status).toBe(201);
      const { invite } = await made.json();
      expect(invite.url).toBe(`http://localhost:4321/i/${invite.code}`);

      // The landing page remembers it in a cookie and is not behind the gate.
      const land = await app.request(`/i/${invite.code}`, { headers: { accept: 'text/html' } });
      expect(land.status).toBe(200);
      expect(await land.text()).toContain('You are invited');
      const inviteCookie = land.headers
        .getSetCookie()
        .find((c) => c.startsWith('r4k_invite='))
        .split(';')[0];

      // Carried on the emailed link: no cookie on the browser that opens it.
      const { user: bob } = await signUp(`bob@${DOMAIN}`, {
        invite: invite.code,
        ip: '198.51.100.30',
      });
      const bonuses =
        await sql`select side, paid, days from invite_bonuses where invite_id = ${invite.id} order by side`;
      expect(bonuses.map((b) => [b.side, b.paid, b.days])).toEqual([
        ['invitee', true, 7],
        ['inviter', true, 7],
      ]);
      expect(await accounts.accountPassUntil(bob.id)).not.toBeNull();
      expect(await accounts.accountPassUntil(inviter.id)).not.toBeNull();

      // Used: a second new account gets nothing from the same code.
      const { user: carol } = await signUp(`carol@${DOMAIN}`, { cookie: inviteCookie });
      expect(await accounts.accountPassUntil(carol.id)).toBeNull();
      expect((await lib.inviteStatus(invite.code)) === 'used').toBe(true);

      // An existing account signing in with an invite never accepts it.
      const second = await (
        await api(session, '/api/v1/invites', { method: 'POST', body: '{}' })
      ).json();
      await signUp(`bob@${DOMAIN}`, { invite: second.invite.code });
      expect(await lib.inviteStatus(second.invite.code)).toBe('ok');

      const list = await (await api(session, '/api/v1/invites')).json();
      expect(list.quota).toEqual({ total: 3, used: 2, left: 1 });
      expect(list.affiliate.url).toContain('/?ref=');
    });

    test('a same-mailbox alias is accepted but the bonus is withheld', async () => {
      const { session, user: inviter } = await signUp(`dana@${DOMAIN}`);
      await age(inviter.id, 30);
      const { invite } = await (
        await api(session, '/api/v1/invites', { method: 'POST', body: '{}' })
      ).json();
      const { user: alias } = await signUp(`dana+farm@${DOMAIN}`, { invite: invite.code });
      const rows =
        await sql`select paid, reason from invite_bonuses where invite_id = ${invite.id}`;
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.paid === false && r.reason === 'same mailbox')).toBe(true);
      expect(await accounts.accountPassUntil(alias.id)).toBeNull();
    });

    test('an affiliate link attributes a new account', async () => {
      const { session, user: aff } = await signUp(`affy@${DOMAIN}`);
      const { affiliate } = await (await api(session, '/api/v1/invites')).json();
      const visit = await app.request(`/pricing?ref=${affiliate.code}`, {
        headers: { accept: 'text/html' },
      });
      const ref = visit.headers
        .getSetCookie()
        .find((c) => c.startsWith('referral_code='))
        .split(';')[0];
      const { user } = await signUp(`referred@${DOMAIN}`, { cookie: ref });
      expect(await lib.services().aff.affiliateOf(user.id)).toBe(aff.id);
    });
  });
}
