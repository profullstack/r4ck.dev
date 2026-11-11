import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { config } from '@r4ck/config';
import { gateway, OPEN_PATHS } from '../apps/web/src/lib/gate.js';
import { render } from '../apps/web/src/lib/http.js';
import { LEGAL_EFFECTIVE_DATE, Privacy, Terms } from '../apps/web/src/views/legal.jsx';

/**
 * /privacy and /terms render without a database, so this runs everywhere; the
 * routes themselves are walked in api.test.js with the other pages.
 */
const pages = {
  privacy: [await render(Privacy({ user: null })), 'Privacy Policy'],
  terms: [await render(Terms({ user: null })), 'Terms of Service'],
};

describe('legal pages', () => {
  for (const [name, [html, heading]] of Object.entries(pages)) {
    test(`/${name} is a full page headed "${heading}"`, () => {
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toMatch(new RegExp(`<title>[^<]*${heading}[^<]*</title>`));
      expect(html).toContain(`<h1>${heading}</h1>`);
      expect(LEGAL_EFFECTIVE_DATE).toBe('November 11, 2026');
      expect(html).toContain(`Effective date: ${LEGAL_EFFECTIVE_DATE}`);
      expect(html).toContain('Profullstack, Inc., 16375 Bonnie Lane, Los Gatos, CA 95032, USA');
      expect(html).toContain('support@profullstack.com');
      expect(html).toContain(`${config.siteUrl}/mcp`);
    });

    test(`/${name} has no em or en dashes in its body`, () => {
      const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
      expect(main.length).toBeGreaterThan(0);
      expect(main).not.toMatch(/[–—]/);
    });
  }

  test('the privacy policy has the AI agents and MCP section', () => {
    const [html] = pages.privacy;
    expect(html).toContain('AI agents and MCP');
    expect(html).toContain('MCP and API requests are logged');
    expect(html).toContain('No MCP data is sold or used for advertising');
  });

  test('the site footer links to both', () => {
    const [html] = pages.privacy;
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  test('both are routed and in the sitemap', () => {
    const pagesSrc = readFileSync(
      new URL('../apps/web/src/routes/pages.js', import.meta.url),
      'utf8',
    );
    expect(pagesSrc).toContain("app.get('/privacy'");
    expect(pagesSrc).toContain("app.get('/terms'");
    const staticSrc = readFileSync(
      new URL('../apps/web/src/routes/static.js', import.meta.url),
      'utf8',
    );
    expect(staticSrc).toContain("'/privacy',");
    expect(staticSrc).toContain("'/terms',");
  });
  test('both stay open to AI crawlers, which the x402 gate otherwise charges', async () => {
    expect(OPEN_PATHS).toContain('/privacy');
    expect(OPEN_PATHS).toContain('/terms');
    const ua = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)';
    for (const path of ['/privacy', '/terms']) {
      const res = await gateway.handle(
        new Request(`https://r4ck.dev${path}`, { headers: { 'user-agent': ua } }),
      );
      expect([path, res]).toEqual([path, null]);
    }
  });
});
