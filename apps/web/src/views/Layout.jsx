import { config } from '@r4ck/config';
import { raw } from 'hono/html';
import { assetUrl } from '../routes/static.js';

/**
 * The one HTML shell. Dark ground by default, a light theme on request,
 * a sticky top bar on wide screens and a bottom bar on phones, and the
 * command palette that turns any page into the search box.
 */
export async function Layout({
  title,
  description,
  user,
  path = '/',
  wide = false,
  canonical,
  image,
  jsonld,
  children,
  head,
}) {
  const fullTitle = title
    ? `${title} · ${config.siteName}`
    : `${config.siteName}: the server search engine built for agents`;
  const desc =
    description ??
    'Every VPS, cloud, bare metal, GPU and PaaS offer for sale, searchable by spec, price and place. Same query on the page, the API, the CLI and MCP.';
  const css = await assetUrl('styles.css');
  const js = await assetUrl('app.js');
  const vendor = await assetUrl('vendor-webauthn.js');
  const url = `${config.siteUrl}${canonical ?? path}`;
  const nav = [
    ['/servers', 'Servers', 'search'],
    ['/providers', 'Providers', 'grid'],
    ['/compare', 'Compare', 'columns'],
    ['/deals', 'Deals', 'tag'],
  ];
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{fullTitle}</title>
        <meta name="description" content={desc} />
        <meta name="theme-color" content="#0b0d12" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)" />
        <meta name="color-scheme" content="dark light" />
        <link rel="canonical" href={url} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="r4ck" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preload" href="/fonts/Geist.woff2" as="font" type="font/woff2" crossorigin="" />
        <link
          rel="preload"
          href="/fonts/GeistMono.woff2"
          as="font"
          type="font/woff2"
          crossorigin=""
        />
        <link rel="stylesheet" href={css} />
        <link
          rel="alternate"
          type="application/json"
          href={`${config.siteUrl}/api/v1/search`}
          title="Search API"
        />
        <link rel="llms" href="/llms.txt" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={config.siteName} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={image ?? `${config.siteUrl}/og.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        {jsonld ? <script type="application/ld+json">{raw(JSON.stringify(jsonld))}</script> : null}
        {head ?? null}
      </head>
      <body data-path={path}>
        <a class="skip" href="#main">
          Skip to content
        </a>
        <header class="topbar">
          <a class="brand" href="/" aria-label="r4ck home">
            <img src="/logo.svg" alt="" width="28" height="28" />
            <span class="wordmark">
              r<em>4</em>ck
            </span>
          </a>
          <form class="topsearch" action="/servers" method="get" role="search">
            <input
              type="search"
              name="q"
              placeholder="2 vcpu 4gb under $10 in germany"
              aria-label="Search servers"
              autocomplete="off"
              data-omni
            />
            <kbd>⌘K</kbd>
          </form>
          <nav class="nav" aria-label="Primary">
            {nav.map(([href, label]) => (
              <a href={href} aria-current={active(href) ? 'page' : undefined}>
                {label}
              </a>
            ))}
            <a href="/docs/api" aria-current={active('/docs') ? 'page' : undefined}>
              API
            </a>
          </nav>
          <div class="nav-actions">
            <button
              type="button"
              class="icon-button"
              data-theme-toggle
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            {user ? (
              <a class="button ghost" href="/settings">
                {user.email.split('@')[0]}
              </a>
            ) : (
              <a class="button primary" href="/login">
                Sign in
              </a>
            )}
          </div>
        </header>
        <main id="main" class={wide ? 'wide' : 'wrap'}>
          {children}
        </main>
        <footer class="footer">
          <div class="footer-grid">
            <div>
              <a class="brand" href="/">
                <span class="wordmark">
                  r<em>4</em>ck
                </span>
              </a>
              <p class="muted">
                The server search engine built for agents. Same query on the page, the API, the CLI
                and MCP.
              </p>
              <p class="muted small">
                Plan data mirrored from the{' '}
                <a href={`${config.nichedb.url}/c/hosting`}>NicheDB hosting collection</a>. Provider
                descriptions from the FindHost register,{' '}
                <a href="https://www.findhost.app/">findhost.app</a>, CC BY 4.0. Prices in USD are
                estimates from daily ECB rates.
              </p>
            </div>
            <nav aria-label="Product">
              <h4>Product</h4>
              <a href="/servers">Servers</a>
              <a href="/providers">Providers</a>
              <a href="/compare">Compare</a>
              <a href="/deals">Deals</a>
              <a href="/pricing">Pricing</a>
            </nav>
            <nav aria-label="Agents">
              <h4>For agents</h4>
              <a href="/docs/api">API</a>
              <a href="/docs/cli">CLI</a>
              <a href="/docs/mcp">MCP</a>
              <a href="/llms.txt">llms.txt</a>
              <a href="/skill.md">skill.md</a>
              <a href="/crawl">Crawl pass</a>
            </nav>
            <nav aria-label="Company">
              <h4>Profullstack</h4>
              <a href="/about">About</a>
              <a href="https://github.com/profullstack/r4ck.dev">Source</a>
              <a href="https://profullstack.com">profullstack.com</a>
              <a href="https://logicsrc.com/docs/openserver">OpenServer</a>
            </nav>
          </div>
        </footer>
        <nav class="bottomnav" aria-label="Sections">
          {[
            ['/', 'Home', 'home'],
            ...nav.slice(0, 3),
            [user ? '/settings' : '/login', user ? 'Account' : 'Sign in', 'user'],
          ].map(([href, label, icon]) => (
            <a href={href} aria-current={active(href) ? 'page' : undefined}>
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <dialog id="palette" class="palette" aria-label="Search">
          <form action="/servers" method="get">
            <input
              type="search"
              name="q"
              placeholder="Describe the server: 8 cores, 32gb, nvme, eu, under $60"
              autofocus
              autocomplete="off"
              data-omni
            />
            <div class="palette-understood" data-understood aria-live="polite"></div>
            <ul class="palette-results" data-palette-results></ul>
            <footer>
              <span>Enter to search</span>
              <span>Esc to close</span>
            </footer>
          </form>
        </dialog>
        <script src={vendor} defer></script>
        <script src={js} defer></script>
      </body>
    </html>
  );
}

export function Icon({ name, size = 22 }) {
  const paths = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm9 16-4.3-4.3',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    columns: 'M4 4h16v16H4zM12 4v16',
    tag: 'M20 12 12 20l-8-8V4h8zM7.5 7.5h.01',
    user: 'M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.search} />
    </svg>
  );
}
