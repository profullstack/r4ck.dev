import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  AFFILIATE_REL,
  AFFILIATES,
  affiliateFor,
  hostOf,
  isFrontDoor,
  outbound,
  PLAIN_REL,
  parseAffiliates,
} from '@r4ck/core';

const DEDIROCK = 'https://billing.dedirock.com/aff.php?aff=960';

describe('the table itself', () => {
  test('Dedirock is in it, with the referral URL we were given', () => {
    expect(AFFILIATES['dedirock.com'].url).toBe(DEDIROCK);
  });

  test('every key is a bare lowercase domain, because that is what lookups use', () => {
    for (const key of Object.keys(AFFILIATES)) {
      expect(key).toBe(key.toLowerCase());
      expect(key).not.toContain('://');
      expect(key).not.toContain('/');
      expect(key.startsWith('www.')).toBe(false);
    }
  });

  test('every entry points somewhere absolute and https', () => {
    for (const entry of Object.values(AFFILIATES)) {
      expect(() => new URL(entry.url)).not.toThrow();
      expect(new URL(entry.url).protocol).toBe('https:');
    }
  });
});

describe('affiliateFor', () => {
  test('finds a provider by its bare domain', () => {
    expect(affiliateFor('dedirock.com')?.url).toBe(DEDIROCK);
  });

  test('does not care about www, case or a stray path', () => {
    expect(affiliateFor('www.DediRock.com')?.url).toBe(DEDIROCK);
    expect(affiliateFor('dedirock.com/vps')?.url).toBe(DEDIROCK);
    expect(affiliateFor('https://www.dedirock.com/')?.url).toBe(DEDIROCK);
  });

  test('a subdomain still belongs to the provider', () => {
    expect(affiliateFor('billing.dedirock.com')?.url).toBe(DEDIROCK);
  });

  test('a domain that merely ends in the same letters is not a match', () => {
    // The guard is on the dot: "notdedirock.com" must not borrow the deal.
    expect(affiliateFor('notdedirock.com')).toBeNull();
    expect(affiliateFor('dedirock.com.evil.example')).toBeNull();
  });

  test('is null for a provider we have no deal with, and for nothing at all', () => {
    expect(affiliateFor('hetzner.com')).toBeNull();
    expect(affiliateFor('')).toBeNull();
    expect(affiliateFor(null)).toBeNull();
    expect(affiliateFor(undefined)).toBeNull();
  });
});

describe('isFrontDoor', () => {
  test('a bare origin is, with or without the trailing slash', () => {
    expect(isFrontDoor('https://dedirock.com')).toBe(true);
    expect(isFrontDoor('https://dedirock.com/')).toBe(true);
  });

  test('a path or a query is not', () => {
    expect(isFrontDoor('https://dedirock.com/vps')).toBe(false);
    expect(isFrontDoor('https://dedirock.com/?plan=9')).toBe(false);
  });

  test('a hash alone still counts as the front door', () => {
    expect(isFrontDoor('https://dedirock.com/#pricing')).toBe(true);
  });

  test('nonsense is not a front door rather than throwing', () => {
    expect(isFrontDoor('not a url')).toBe(false);
    expect(isFrontDoor(null)).toBe(false);
  });
});

describe('outbound', () => {
  test('a provider with no deal is returned exactly as it came in', () => {
    const out = outbound('https://hetzner.com/', 'hetzner.com');
    expect(out.href).toBe('https://hetzner.com/');
    expect(out.affiliate).toBe(false);
    expect(out.rel).toBe(PLAIN_REL);
  });

  test('the front door is swapped for the referral link and marked sponsored', () => {
    const out = outbound('https://dedirock.com/', 'dedirock.com');
    expect(out.href).toBe(DEDIROCK);
    expect(out.affiliate).toBe(true);
    expect(out.rel).toBe(AFFILIATE_REL);
    expect(out.rel).toContain('sponsored');
  });

  test('it works out the provider from the URL when no domain is stored', () => {
    expect(outbound('https://www.dedirock.com/').href).toBe(DEDIROCK);
  });

  /*
   * The one that matters. aff.php was measured on 2026-09-25: it 301s to
   * https://dedirock.com and ignores `url` and `goto`, so swapping it in for a
   * deep link would silently drop somebody who clicked a named plan onto the
   * homepage. Earning a commission is not worth that, so a deep link is left
   * alone and simply earns nothing.
   */
  test('a deep link to a named offer is left alone, commission or not', () => {
    const deep = 'https://dedirock.com/kvm-vps/ryzen-4gb';
    const out = outbound(deep, 'dedirock.com');
    expect(out.href).toBe(deep);
    expect(out.affiliate).toBe(false);
    expect(out.rel).toBe(PLAIN_REL);
  });

  test('a deep link into the billing subdomain is left alone too', () => {
    const cart = 'https://billing.dedirock.com/index.php?rp=/store/vps';
    expect(outbound(cart, 'dedirock.com').href).toBe(cart);
  });

  test('a missing URL stays missing rather than becoming a referral link', () => {
    expect(outbound(null, 'dedirock.com').href).toBeNull();
    expect(outbound(undefined, 'dedirock.com').affiliate).toBe(false);
    expect(outbound('', 'dedirock.com').href).toBeNull();
  });
});

describe('hostOf', () => {
  test('strips www and lowercases', () => {
    expect(hostOf('https://WWW.Example.com/x')).toBe('example.com');
  });

  test('is null for something that is not a URL', () => {
    expect(hostOf('nope')).toBeNull();
  });
});

const OPALSTACK = 'https://my.opalstack.com/signup/?via=68ba4d';

describe('affiliates.txt', () => {
  const file = new URL('../affiliates.txt', import.meta.url);
  const entries = () =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean);

  test('reads without errors', () => {
    expect(parseAffiliates(readFileSync(file, 'utf8')).errors).toEqual([]);
  });

  test('is sorted by domain with no duplicates, so `bun run affiliates` has nothing to do', () => {
    const domains = entries().map((l) => l.split(/\s+/)[0]);
    expect(domains).toEqual([...new Set(domains)].sort());
  });

  test('rejects a line it cannot read, a second listing, and plain http', () => {
    const { errors } = parseAffiliates(
      'a.com https://a.com/?r=1\na.com https://a.com/?r=2\nb.com\nc.com http://c.com/\nd.com https://d.com/ sometimes',
    );
    expect(errors).toHaveLength(4);
  });
});

describe('Opalstack (Rewardful, forwards anywhere)', () => {
  test('is in the table and is not landing-only', () => {
    expect(AFFILIATES['opalstack.com']).toEqual({ url: OPALSTACK, landingOnly: false });
  });

  test('every Opalstack link, front door or deep, goes through the referral link', () => {
    for (const url of [
      'https://opalstack.com/',
      'https://www.opalstack.com/pricing',
      'https://my.opalstack.com/signup/',
    ]) {
      const out = outbound(url, 'opalstack.com');
      expect(out.href).toBe(OPALSTACK);
      expect(out.affiliate).toBe(true);
      expect(out.rel).toBe(AFFILIATE_REL);
    }
  });
});
