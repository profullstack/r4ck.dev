import * as auth from '@r4ck/auth';
import { config } from '@r4ck/config';
import * as accounts from '@r4ck/db/accounts';
import { getCookie, setCookie } from 'hono/cookie';
import { render, requireUser, respond } from '../lib/http.js';
import { sendLoginLink } from '../lib/mail.js';
import { SignIn } from '../views/account.jsx';

const PK_COOKIE = 'r4k_pk';

export function registerAuth(app) {
  app.get('/login', async (c) => {
    if (c.get('user')) return c.redirect(c.req.query('next') ?? '/settings', 303);
    return c.html(
      await render(<SignIn mode="login" next={c.req.query('next')} error={c.req.query('error')} />),
    );
  });
  app.get('/signup', async (c) => {
    if (c.get('user')) return c.redirect('/settings', 303);
    return c.html(await render(<SignIn mode="signup" next={c.req.query('next')} />));
  });

  /** Request a link. The answer is identical whether or not the address exists. */
  app.post('/api/auth/magic', async (c) => {
    const body = await c.req.parseBody();
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const next = String(body.next ?? '/settings');
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      try {
        const url = await auth.createLoginLink(email, { next });
        await sendLoginLink({ email, url });
      } catch (err) {
        console.error('[auth] link send failed:', err.message);
        if (!config.mail.enabled)
          console.log(
            `[auth] mail is not configured; the link would have been ${await auth.createLoginLink(email, { next })}`,
          );
      }
    }
    if ((c.req.header('accept') ?? '').includes('application/json')) return c.json({ ok: true });
    return c.html(await render(<SignIn mode="login" sent />));
  });

  app.get('/auth/magic', async (c) => {
    const token = c.req.query('t');
    if (!token) return c.redirect('/login', 303);
    const result = await auth.consumeLoginLink(token, { userAgent: c.req.header('user-agent') });
    if (!result)
      return c.html(
        await render(
          <SignIn
            mode="login"
            error="That link has expired or was already used. Ask for another."
          />,
        ),
        400,
      );
    c.header('set-cookie', auth.sessionCookie(result.sessionId));
    const next = c.req.query('next');
    return c.redirect(next?.startsWith('/') ? next : '/settings', 303);
  });

  app.post('/api/auth/logout', async (c) => {
    const sid = getCookie(c, config.session.cookie);
    if (sid) await accounts.endSession(sid);
    c.header('set-cookie', auth.sessionCookie('', { clear: true }));
    return respond(c, { redirectTo: '/' });
  });

  const stash = async (c, challenge) => {
    const id = await accounts.stashChallenge(challenge);
    setCookie(c, PK_COOKIE, id, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 300,
      secure: config.isProd,
    });
  };
  const take = async (c) => {
    const id = getCookie(c, PK_COOKIE);
    return id ? accounts.takeChallenge(id) : null;
  };

  app.post('/api/auth/passkey/register/options', async (c) => {
    const user = requireUser(c);
    const options = await auth.passkeyRegistrationOptions(user);
    await stash(c, options.challenge);
    return c.json(options);
  });
  app.post('/api/auth/passkey/register/verify', async (c) => {
    const user = requireUser(c);
    const expectedChallenge = await take(c);
    if (!expectedChallenge) return c.json({ error: 'challenge expired' }, 400);
    const ok = await auth.verifyPasskeyRegistration({
      user,
      response: await c.req.json(),
      expectedChallenge,
    });
    return c.json({ ok }, ok ? 200 : 400);
  });
  app.post('/api/auth/passkey/remove', async (c) => {
    const user = requireUser(c);
    const body = await c.req.parseBody();
    await accounts.deletePasskey({
      userId: user.id,
      credentialId: String(body.credential_id ?? ''),
    });
    return respond(c, { redirectTo: '/settings', notice: 'Passkey removed.' });
  });
  app.post('/api/auth/passkey/authenticate/options', async (c) => {
    const options = await auth.passkeyAuthenticationOptions();
    await stash(c, options.challenge);
    return c.json(options);
  });
  app.post('/api/auth/passkey/authenticate/verify', async (c) => {
    const expectedChallenge = await take(c);
    if (!expectedChallenge) return c.json({ error: 'challenge expired' }, 400);
    const result = await auth.verifyPasskeyAuthentication({
      response: await c.req.json(),
      expectedChallenge,
      userAgent: c.req.header('user-agent'),
    });
    if (!result) return c.json({ error: 'That passkey was not recognised.' }, 400);
    c.header('set-cookie', auth.sessionCookie(result.sessionId));
    return c.json({ ok: true });
  });
}
