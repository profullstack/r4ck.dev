import { beforeAll, expect, test } from 'bun:test';

/**
 * The crawl gateway must not trust a session cookie's mere presence
 * (x402-gateway 0.18.3 `sessionCookie`): GPTBot with a made-up cookie is
 * charged, exactly as without one. No network.
 */
let gateway;
beforeAll(async () => {
  ({ gateway } = await import('../apps/web/src/lib/gate.js'));
});

const GPTBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const page = (cookie) =>
  new Request('https://r4ck.dev/servers', {
    headers: {
      'user-agent': GPTBOT,
      accept: 'application/json',
      'x-real-ip': '198.51.100.32',
      ...(cookie ? { cookie } : {}),
    },
  });

test('a declared crawler is offered a crawl pass', async () => {
  expect((await gateway.handle(page()))?.status).toBe(402);
});

test('a forged session cookie does not exempt it', async () => {
  expect((await gateway.handle(page('r4k_session=forged')))?.status).toBe(402);
});
