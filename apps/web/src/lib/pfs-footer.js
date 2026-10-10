/**
 * The shared Profullstack footer (@profullstack/footer): the copyright line and
 * the webring, from the package's @latest template, so a release of the package
 * reaches this site without a redeploy.
 *
 * The Layout renders synchronously, so this returns the last footer rendered and
 * refreshes it in the background on each use (the package caches the template
 * for an hour). Until the first refresh lands it is the installed template.
 */
import { footerHtml, footerHtmlSync } from '@profullstack/footer';
import { raw } from 'hono/html';

const options = { site: 'https://r4ck.dev/' };

let latest = footerHtmlSync(options);

export function PfsFooter() {
  footerHtml(options)
    .then((html) => {
      latest = html;
    })
    .catch(() => {});
  return raw(latest);
}
