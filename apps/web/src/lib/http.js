import * as auth from '@r4ck/auth';
import { config } from '@r4ck/config';
import { getCookie } from 'hono/cookie';

/** An error the caller should see, with the status it deserves. */
export class Denied extends Error {
  constructor(message, status = 400, extra = null) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const render = async (node) => `<!doctype html>${await node.toString()}`;

export function wantsJson(c) {
  const accept = c.req.header('accept') ?? '';
  const ct = c.req.header('content-type') ?? '';
  return (
    accept.includes('application/json') ||
    ct.includes('application/json') ||
    c.req.header('x-requested-with') === 'fetch' ||
    c.req.path.startsWith('/api/')
  );
}

export function respond(c, { json, redirectTo, status, notice, error } = {}) {
  if (wantsJson(c))
    return c.json(json ?? (error ? { error } : { ok: true }), status ?? (error ? 400 : 200));
  const to = new URL(redirectTo ?? c.req.header('referer') ?? '/', config.siteUrl);
  if (notice) to.searchParams.set('notice', notice);
  if (error) to.searchParams.set('error', error);
  return c.redirect(to.pathname + to.search, 303);
}

export function requireUser(c) {
  const user = c.get('user');
  if (!user) {
    if (wantsJson(c))
      throw new Denied('Sign in or send an API key (Authorization: Bearer r4k_…).', 401);
    throw Object.assign(new Error('auth required'), {
      redirect: `/login?next=${encodeURIComponent(c.req.path)}`,
    });
  }
  return user;
}

/** Cookie session first, then a bearer key. Sets c.var.user and c.var.viaKey. */
export async function loadUser(c, next) {
  let user = null;
  let viaKey = false;
  const sid = getCookie(c, config.session.cookie);
  if (sid) user = await auth.userFromRequest(sid).catch(() => null);
  if (!user) {
    const m =
      (c.req.header('authorization') ?? '').match(/^Bearer\s+(r4k_[0-9a-f]+)$/i) ??
      (c.req.header('x-api-key') ?? '').match(/^(r4k_[0-9a-f]+)$/i);
    if (m) {
      user = await auth.userFromApiKey(m[1]).catch(() => null);
      viaKey = Boolean(user);
    }
  }
  c.set('user', user);
  c.set('viaKey', viaKey);
  await next();
}

export const notice = (c) => ({
  notice: c.req.query('notice') ?? null,
  error: c.req.query('error') ?? null,
});
