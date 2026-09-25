/**
 * Referral links.
 *
 * A few providers pay a commission on a referred order. Where one does, the
 * outbound link to that provider goes through their referral endpoint instead
 * of straight to their site, and says so where a reader can see it.
 *
 * ## Why this table lives in source and not in the database
 *
 * `providers` is a mirror. `sync` pulls the hosting collection from NicheDB
 * and upserts it with `coalesce(excluded.x, providers.x)` on every column, so
 * a referral URL stored there would arrive as null on each sync and survive
 * only by the grace of that coalesce — one upsert written differently and the
 * deal is silently gone. It would also be invisible: nothing in the repository
 * would record who pays us. A table in source makes the commercial
 * relationship reviewable in a diff, and it means a provider who is not in the
 * catalogue yet is already wired up for the day they appear.
 *
 * ## Landing-only links, which is what Dedirock's is
 *
 * Most referral endpoints set a cookie and then forward the visitor to a URL
 * of the caller's choosing. Dedirock's is WHMCS `aff.php`, and it was measured
 * on 2026-09-25: it answers 301 to `https://dedirock.com`, sets
 * `WHMCSAffiliateID` for ninety days, and ignores both `url` and `goto`.
 * Passing `aff=960` inline on a billing page sets no cookie at all. There is
 * therefore no way to earn the referral *and* land on a named plan.
 *
 * So a landing-only link replaces a link to the provider's front door, where
 * nothing is lost because that is where it lands anyway, and never replaces a
 * deep link to a particular offer. Sending somebody who clicked a specific
 * plan to a homepage instead, to earn a commission, would be charging the
 * reader for our revenue — which is the thing that makes a directory worth
 * nothing. An entry without `landingOnly` is free to replace any link.
 */

/** domain -> referral endpoint. Keys are registrable domains, lowercase. */
export const AFFILIATES = {
  'dedirock.com': {
    url: 'https://billing.dedirock.com/aff.php?aff=960',
    landingOnly: true,
    network: 'whmcs',
  },
};

/** The rel for a paid link. `sponsored` is the value search engines ask for. */
export const AFFILIATE_REL = 'noopener nofollow sponsored';
export const PLAIN_REL = 'noopener nofollow';

export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** A domain however it was written — bare, with www, or as a whole URL. */
function key(domain) {
  if (!domain) return null;
  const d = String(domain).trim().toLowerCase();
  if (!d) return null;
  if (d.includes('://')) return hostOf(d);
  return d.replace(/^www\./, '').replace(/[/?#].*$/, '') || null;
}

/** The deal for a domain, or null. A subdomain still belongs to its provider. */
export function affiliateFor(domain) {
  const k = key(domain);
  if (!k) return null;
  if (AFFILIATES[k]) return AFFILIATES[k];
  for (const [d, entry] of Object.entries(AFFILIATES)) {
    if (k.endsWith(`.${d}`)) return entry;
  }
  return null;
}

/**
 * Is this URL the provider's front door rather than a particular page?
 * Only a front door may be swapped for a landing-only referral link.
 */
export function isFrontDoor(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  return (u.pathname === '' || u.pathname === '/') && u.search === '';
}

/**
 * Where an outbound link should actually point, and how to mark it.
 * Returns the original URL untouched when no deal applies, so this is safe to
 * wrap around every outbound link in the site.
 */
export function outbound(url, domain) {
  // An empty string is no link at all, and would render an <a> pointing at
  // the current page, so it is normalised away rather than passed through.
  const plain = { href: url || null, affiliate: false, rel: PLAIN_REL };
  if (!url) return plain;

  const entry = affiliateFor(domain ?? hostOf(url));
  if (!entry) return plain;
  if (entry.landingOnly && !isFrontDoor(url)) return plain;

  return { href: entry.url, affiliate: true, rel: AFFILIATE_REL };
}
