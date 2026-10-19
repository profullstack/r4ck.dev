/**
 * The pit.world global footer (site name, search, ring, publish), fetched on the
 * server from pit.world and rendered as the last thing in <body>.
 *
 * The Layout renders synchronously, so this keeps the last good copy in a
 * module-level cache and refreshes it in the background once it is an hour old
 * (3s timeout). A failed refresh keeps the old copy; with no copy at all the
 * footer is simply absent, so pit.world being down never breaks a page. The CSP
 * already allows inline styles, so the snippet's <style> goes in as is.
 */
import { raw } from 'hono/html';

const URL = 'https://pit.world/snippets/footer.html?site=r4ck.dev';
const MAX_AGE_MS = 60 * 60 * 1000;

let html = '';
let fetchedAt = 0;
let inflight = null;

const refresh = () => {
  inflight ??= fetch(URL, { signal: AbortSignal.timeout(3000) })
    .then(async (res) => {
      const text = res.ok ? await res.text() : '';
      if (!text.includes('data-pit-footer')) throw new Error(`pit footer: HTTP ${res.status}`);
      html = text;
      fetchedAt = Date.now();
    })
    .catch(() => {
      fetchedAt = Date.now() - MAX_AGE_MS + 60_000; // try again in a minute
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export function PitFooter() {
  if (Date.now() - fetchedAt > MAX_AGE_MS) refresh();
  return raw(html);
}
