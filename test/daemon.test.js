import { describe, expect, test } from 'bun:test';
import { looksLikeOpenServer } from '../packages/sync/src/daemon.js';

describe('updater daemon', () => {
  test('an OpenServer descriptor is recognised by its version key or its offer lists', () => {
    expect(looksLikeOpenServer({ openserver: '0.1', provider: { name: 'x' } })).toBe(true);
    expect(looksLikeOpenServer({ offers: [] })).toBe(true);
    expect(looksLikeOpenServer({ plans: [{ name: 'vps-1' }] })).toBe(true);
    expect(looksLikeOpenServer({ hello: 'world' })).toBe(false);
    expect(looksLikeOpenServer([])).toBe(false);
    expect(looksLikeOpenServer(null)).toBe(false);
  });
});
