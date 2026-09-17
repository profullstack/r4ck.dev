import { Hono } from 'hono';
import { gate } from './lib/gate.js';
import { Denied, loadUser, render, wantsJson } from './lib/http.js';
import { registerApi } from './routes/api.js';
import { registerAuth } from './routes/auth.js';
import { registerMcp } from './routes/mcp.js';
import { registerPages } from './routes/pages.js';
import { registerStatic } from './routes/static.js';
import { ErrorPage } from './views/docs.jsx';

export const app = new Hono();

app.use('*', async (c, next) => {
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (!c.req.path.startsWith('/api/') && c.req.path !== '/mcp')
    c.header(
      'content-security-policy',
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  await next();
});
app.use('*', gate);
app.use('*', loadUser);

app.onError(async (err, c) => {
  if (err?.redirect) return c.redirect(err.redirect, 303);
  const status = err instanceof Denied ? err.status : Number(err?.status) || 500;
  if (status >= 500) console.error('[web]', err);
  const message = status >= 500 ? 'Something broke on our side. It is logged.' : err.message;
  if (wantsJson(c))
    return c.json(
      { error: message, ...(err instanceof Denied && err.extra ? err.extra : {}) },
      status,
    );
  return c.html(
    await render(<ErrorPage user={c.get('user')} status={status} message={message} />),
    status,
  );
});
app.notFound(async (c) => {
  if (wantsJson(c)) return c.json({ error: 'Not found' }, 404);
  return c.html(
    await render(
      <ErrorPage user={c.get('user')} status={404} message="Nothing lives at that address." />,
    ),
    404,
  );
});

registerStatic(app);
registerAuth(app);
registerApi(app);
registerMcp(app);
registerPages(app);
