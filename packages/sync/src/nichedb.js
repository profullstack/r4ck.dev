import { config } from '@r4ck/config';

/**
 * The NicheDB items API, read the only way it is fast enough: keyset pages
 * by id, with `since` for the incremental pass. Reads need no key; one is
 * sent when configured so the caller gets the larger allowance.
 */
export function nichedbClient({
  base = config.nichedb.url,
  key = config.nichedb.key,
  fetchImpl = fetch,
  timeoutMs = config.nichedb.timeoutMs,
} = {}) {
  const headers = { accept: 'application/json', 'user-agent': 'r4ck-sync/0.1 (+https://r4ck.dev)' };
  if (key) headers.authorization = `Bearer ${key}`;
  async function get(path) {
    const r = await fetchImpl(`${base}${path}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`${r.status} from ${path}`);
    return r.json();
  }
  /** Every item in the collection, newest id first, page by page. */
  async function* items({
    collection = config.nichedb.collection,
    kind = null,
    since = null,
    limit = 200,
  } = {}) {
    let before = null;
    for (;;) {
      const p = new URLSearchParams({
        collection,
        limit: String(limit),
        sort: 'id',
        order: 'desc',
      });
      if (kind) p.set('kind', kind);
      if (since) p.set('since', since);
      if (before) p.set('before', String(before));
      const body = await get(`/api/v1/items?${p}`);
      const rows = body.items ?? [];
      if (rows.length === 0) return;
      yield rows;
      if (rows.length < limit) return;
      before = Math.min(...rows.map((i) => Number(i.id)));
    }
  }
  /** The most recently updated rows in the collection, newest first, one page. */
  async function recent({ collection = config.nichedb.collection, limit = 200 } = {}) {
    const p = new URLSearchParams({
      collection,
      limit: String(limit),
      sort: 'updated',
      order: 'desc',
    });
    const body = await get(`/api/v1/items?${p}`);
    return body.items ?? [];
  }
  /** One keyset page by id, for a resumable full walk. */
  async function page({ collection = config.nichedb.collection, before = null, limit = 200 } = {}) {
    const p = new URLSearchParams({ collection, limit: String(limit), sort: 'id', order: 'desc' });
    if (before) p.set('before', String(before));
    const body = await get(`/api/v1/items?${p}`);
    return body.items ?? [];
  }
  return { get, items, recent, page, base };
}
