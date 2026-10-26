/**
 * The shared Profullstack footer (@profullstack/footer): the copyright line and
 * the webring, from the package's @latest template, so a release of the package
 * reaches this site without a redeploy.
 *
 * The Layout renders synchronously, so this returns the last footer rendered and
 * refreshes it in the background on each use (the package caches the template
 * for an hour). Until the first refresh lands it is the installed template.
 */
import { createHash } from 'node:crypto';
import { footerHtml, footerHtmlSync, subscribeForm } from '@profullstack/footer';
import { raw } from 'hono/html';

const options = { site: 'https://r4ck.dev/' };

/**
 * The CSP source for the footer's inline newsletter script (wireSubscribe, footer 0.4.0+), as
 * 'sha256-...'. The CSP has no 'unsafe-inline' and the footer is a cached string (no per-request
 * nonce), but the renderer emits the same script bytes every time, so its hash allows exactly it.
 */
export const FOOTER_SCRIPT_SRC = (() => {
  const m = subscribeForm(options.site).match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m?.[1] ? `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'` : '';
})();

let latest = footerHtmlSync(options);

export function PfsFooter() {
  footerHtml(options)
    .then((html) => {
      latest = html;
    })
    .catch(() => {});
  return raw(latest);
}
