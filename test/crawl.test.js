import { describe, expect, test } from 'bun:test';
import { renderCrawl } from '../apps/web/src/views/crawl.jsx';

/**
 * /crawl is the x402 gateway's sales page. It used to be the gateway's own
 * bare HTML; now it renders through the site Layout, and the gateway's hook
 * needs a string back, not a promise.
 */
const ctx = {
  siteName: 'r4ck',
  siteUrl: 'https://r4ck.dev',
  buyUrl: 'https://r4ck.dev/crawl',
  price: '1.00 USD',
  minutes: 1440,
  days: 1,
  total: '1.00 USD',
  maxDays: 30,
  header: 'x-crawl-pass',
  enabled: true,
  offer: { x402Version: 2, accepts: [{ network: 'eip155:8453' }, { network: 'eip155:1' }] },
  training: ['GPTBot', 'ClaudeBot'],
  retrieval: ['OAI-SearchBot', 'Claude-User'],
  contact: 'mailto:hello@profullstack.com',
  benefits: ['No hourly allowance on the API', 'Every field on every row'],
  quota: null,
};

describe('/crawl page', () => {
  test('renders synchronously inside the site shell', () => {
    const html = renderCrawl(ctx);
    expect(typeof html).toBe('string');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Crawl pass · r4ck</title>');
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="footer"');
    expect(html).toContain('/styles.css?v=');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toContain('Training crawlers pay for access here.');
    expect(html).toContain('1.00 USD');
    expect(html).toContain('eip155:8453, eip155:1');
    expect(html).toContain('GPTBot, ClaudeBot');
    expect(html).toContain('No hourly allowance on the API');
    expect(html).toContain('coinpay x402 pay https://r4ck.dev/crawl --output pass.json');
    expect(html).toContain('href="mailto:hello@profullstack.com"');
    expect(html).toContain('?days=&lt;n&gt;');
  });

  test('speaks to a throttled reader differently', () => {
    const html = renderCrawl({
      ...ctx,
      quota: { requests: 100, windowSeconds: 60, used: 101, resetSeconds: 42, exceeded: true },
    });
    expect(html).toContain('You have used up the free allowance.');
    expect(html).toContain('it resets in 42 seconds');
    expect(html).toContain('Before you reach for a proxy pool');
    expect(html).not.toContain('Training crawlers pay for access here.');
  });

  test('quotes a multi-day offer', () => {
    const html = renderCrawl({ ...ctx, days: 7, total: '7.00 USD' });
    expect(html).toContain('7.00 USD');
    expect(html).toContain('7 × one day');
    expect(html).toContain('This offer is for 7 days at 1.00 USD a day.');
  });

  test('escapes what it is given', () => {
    const html = renderCrawl({ ...ctx, siteName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  test('the gateway serves it', async () => {
    const { gateway } = await import('../apps/web/src/lib/gate.js');
    const html = gateway.page();
    expect(html).toContain('class="topbar"');
    expect(html).toContain('<title>Crawl pass · r4ck</title>');
  });
});
