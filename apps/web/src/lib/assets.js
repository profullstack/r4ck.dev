import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the static files live. */
export const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

/**
 * Content-hash version for cache busting: computed once per process.
 *
 * Synchronous on purpose. The Layout is rendered by code that has to answer
 * with a string, not a promise (the x402 gateway's sales page hook), so the
 * one thing the shell needs from disk is read the plain way. It happens once
 * per asset per process; every later call is a map lookup.
 */
const versions = new Map();
export function assetVersion(name) {
  if (versions.has(name)) return versions.get(name);
  try {
    const hash = new Bun.CryptoHasher('sha1')
      .update(readFileSync(join(PUBLIC, name)))
      .digest('hex')
      .slice(0, 10);
    versions.set(name, hash);
    return hash;
  } catch {
    return 'dev';
  }
}

export const assetUrl = (name) => `/${name}?v=${assetVersion(name)}`;
