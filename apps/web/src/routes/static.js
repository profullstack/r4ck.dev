import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@r4ck/config';
import { sql } from '@r4ck/db';
import { gateway } from '../lib/gate.js';
import { llmsTxt, skillMd } from '../lib/llms.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const TYPES = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json',
};
const FILES = [
  'styles.css',
  'app.js',
  'vendor-webauthn.js',
  'logo.svg',
  'favicon.svg',
  'favicon.ico',
  'og.png',
  'fonts/Geist.woff2',
  'fonts/GeistMono.woff2',
];

/** Content-hash version for cache busting: computed once per process. */
const versions = new Map();
export async function assetVersion(name) {
  if (versions.has(name)) return versions.get(name);
  try {
    const buf = await Bun.file(join(PUBLIC, name)).arrayBuffer();
    const hash = new Bun.CryptoHasher('sha1').update(buf).digest('hex').slice(0, 10);
    versions.set(name, hash);
    return hash;
  } catch {
    return 'dev';
  }
}
export const assetUrl = async (name) => `/${name}?v=${await assetVersion(name)}`;

async function serve(c, name, { cache = 'public, max-age=3600' } = {}) {
  const file = Bun.file(join(PUBLIC, name));
  if (!(await file.exists())) return c.notFound();
  const ext = name.split('.').pop();
  const immutable = c.req.query('v') && c.req.query('v') === (await assetVersion(name));
  return new Response(file, {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : cache,
    },
  });
}

export function registerStatic(app) {
  for (const name of FILES) app.get(`/${name}`, (c) => serve(c, name));
  app.get('/icons/:file', (c) =>
    /^[\w.-]+\.(png|svg)$/.test(c.req.param('file'))
      ? serve(c, `icons/${c.req.param('file')}`, { cache: 'public, max-age=86400' })
      : c.notFound(),
  );
  app.get('/sw.js', (c) => serve(c, 'sw.js', { cache: 'no-cache' }));

  app.get('/manifest.webmanifest', (c) =>
    c.json(
      {
        name: 'r4ck',
        short_name: 'r4ck',
        description: 'The server search engine built for agents.',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        categories: ['developer tools', 'utilities', 'shopping'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Cheapest VPS', url: '/servers?kind=vps&sort=price' },
          { name: 'GPU servers', url: '/servers?gpu=1' },
          { name: 'Bare metal', url: '/servers?kind=bare-metal' },
          { name: 'Providers with a CLI', url: '/providers?has=cli' },
        ],
      },
      200,
      { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' },
    ),
  );

  app.get('/robots.txt', (c) =>
    c.text(
      gateway.robotsTxt({
        disallow: ['/login', '/signup', '/settings', '/auth/', '/api/auth/'],
        sitemap: `${config.siteUrl}/sitemap.xml`,
      }),
    ),
  );
  app.get('/llms.txt', async (c) =>
    c.text(await llmsTxt(), 200, { 'cache-control': 'public, max-age=600' }),
  );
  app.get('/skill.md', async (c) =>
    c.text(await skillMd(), 200, {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=600',
    }),
  );
  app.get('/.well-known/security.txt', (c) =>
    c.text(
      `Contact: ${config.x402.contact}\nPreferred-Languages: en\nCanonical: ${config.siteUrl}/.well-known/security.txt\n`,
    ),
  );
  app.get('/healthz', async (c) => {
    try {
      await sql`select 1`;
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: err.message }, 503);
    }
  });
  app.get('/sitemap.xml', async (c) => {
    const [servers, providers] = await Promise.all([
      sql`select id, updated_at from servers order by id limit 5000`,
      sql`select slug, updated_at from providers order by slug`,
    ]);
    const urls = [
      ...[
        '/',
        '/servers',
        '/providers',
        '/deals',
        '/pricing',
        '/docs/api',
        '/docs/cli',
        '/docs/mcp',
      ].map((p) => ({ loc: `${config.siteUrl}${p}` })),
      ...providers.map((p) => ({
        loc: `${config.siteUrl}/providers/${p.slug}`,
        lastmod: p.updated_at,
      })),
      ...servers.map((s) => ({ loc: `${config.siteUrl}/servers/${s.id}`, lastmod: s.updated_at })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
    return c.body(xml, 200, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    });
  });
}
