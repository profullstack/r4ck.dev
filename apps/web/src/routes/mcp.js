import { config } from '@r4ck/config';
import { accessFor } from '../lib/gate.js';
import { render } from '../lib/http.js';
import { ERRORS, fail } from '../lib/mcp/protocol.js';
import { handle } from '../lib/mcp/server.js';
import { describe, OPEN_TOOLS, TOOLS } from '../lib/mcp/tools.js';
import { McpDocs } from '../views/docs.jsx';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, authorization, x-crawl-pass, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-protocol-version',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};
const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });

export function registerMcp(app) {
  for (const path of ['/mcp', '/api/mcp']) {
    app.post(path, async (c) => {
      const ctx = {
        header: (name) => c.req.header(name) ?? null,
        user: c.get('user'),
        access: await accessFor(c),
      };
      let payload;
      try {
        payload = await c.req.json();
      } catch {
        return json(400, fail(null, ERRORS.PARSE, 'Invalid JSON'));
      }
      if (Array.isArray(payload)) {
        const answers = await Promise.all(payload.map((m) => handle(m, ctx)));
        const bodies = answers.map((a) => a.body).filter(Boolean);
        if (bodies.length === 0) return new Response(null, { status: 202, headers: CORS });
        return json(200, bodies);
      }
      const { status, body } = await handle(payload, ctx);
      if (!body) return new Response(null, { status, headers: CORS });
      return json(status, body);
    });
    app.options(path, () => new Response(null, { status: 204, headers: CORS }));
    app.delete(path, () =>
      json(405, fail(null, ERRORS.METHOD_NOT_FOUND, 'This MCP server is stateless'), {
        allow: 'POST, OPTIONS',
      }),
    );
  }
  app.get('/mcp', async (c) => {
    if ((c.req.header('accept') ?? '').includes('text/html'))
      return c.html(await render(<McpDocs user={c.get('user')} tools={TOOLS.map(describe)} />));
    return json(405, fail(null, ERRORS.METHOD_NOT_FOUND, 'This MCP endpoint accepts POST only'), {
      allow: 'POST, OPTIONS',
    });
  });
  app.get('/.well-known/openmcp.json', (_c) =>
    json(
      200,
      {
        openmcp: '0.1',
        mcp: `${config.siteUrl}/mcp`,
        name: config.siteName,
        description:
          'The server search engine built for agents: every VPS, cloud, bare metal, GPU and PaaS offer for sale, searchable by spec, price and place, over MCP.',
        url: config.siteUrl,
        auth: { kind: 'api-key', url: `${config.siteUrl}/settings`, open: OPEN_TOOLS },
        tags: ['hosting', 'servers', 'vps', 'gpu', 'bare-metal', 'pricing', 'search', 'x402'],
        tools: TOOLS.map((t) => t.name),
        catalogs: ['https://openmcp.logicsrc.com'],
      },
      { 'cache-control': 'public, max-age=300' },
    ),
  );
  app.get('/docs/mcp', async (c) =>
    c.html(await render(<McpDocs user={c.get('user')} tools={TOOLS.map(describe)} />)),
  );
}
