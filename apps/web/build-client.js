import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bundle the WebAuthn browser helper so sign-in works under a strict CSP with no third-party origin. */
const here = dirname(fileURLToPath(import.meta.url));
const result = await Bun.build({
  entrypoints: [join(here, 'src/client/webauthn-entry.js')],
  outdir: join(here, 'public'),
  naming: 'vendor-webauthn.js',
  minify: true,
  target: 'browser',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log('[build] public/vendor-webauthn.js');
