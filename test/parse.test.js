import { describe, expect, test } from 'bun:test';
import { countriesFor } from '@r4ck/core/countries';
import {
  describeFilters,
  filtersFrom,
  paramsFrom,
  toggle,
  toggleBucket,
  without,
} from '@r4ck/core/facets';
import { parseQuery } from '@r4ck/core/parse';

describe('parseQuery', () => {
  test('specs, price and place', () => {
    const { filters, rest } = parseQuery('2 vcpu 4gb under $10 in germany');
    expect(filters).toEqual({ max_price: 10, min_vcpu: 2, min_ram: 4, country: ['DE'] });
    expect(rest).toBe('');
  });
  test('regions expand and are remembered', () => {
    const { filters } = parseQuery('cheapest bare metal with 64gb ram in eu');
    expect(filters.kind).toEqual(['bare-metal']);
    expect(filters.min_ram).toBe(64);
    expect(filters.sort).toBe('price');
    expect(filters.region).toBe('eu');
    expect(filters.country).toContain('DE');
    expect(filters.country).not.toContain('GB');
  });
  test('gpu models and billing terms', () => {
    const { filters } = parseQuery('h100 gpu hourly');
    expect(filters).toMatchObject({ gpu: true, gpu_model: 'h100', interval: 'hour' });
  });
  test('terabytes are disk, not memory', () => {
    const { filters } = parseQuery('nvme storage server 1tb');
    expect(filters.min_disk).toBe(1000);
    expect(filters.min_ram).toBeUndefined();
    expect(filters.kind).toEqual(['storage']);
  });
  test('provider, cores and disk with unit words', () => {
    const { filters } = parseQuery('vps from vultr 2 cores 100gb nvme');
    expect(filters).toMatchObject({
      min_vcpu: 2,
      min_disk: 100,
      provider: ['vultr'],
      kind: ['vps'],
    });
  });
  test('automation words', () => {
    expect(parseQuery('8 cores with an api and a cli').filters.has).toEqual(['api', 'cli']);
    expect(parseQuery('servers with mcp in nordics').filters.has).toEqual(['mcp']);
  });
  test('arm and singapore and a cap', () => {
    expect(parseQuery('arm server in singapore max $20/mo').filters).toMatchObject({
      arch: 'arm64',
      country: ['SG'],
      max_price: 20,
    });
  });
  test('unknown words fall through to text search', () => {
    const { filters, rest } = parseQuery('wordpress hosting uk');
    expect(filters.country).toEqual(['GB']);
    expect(rest).toBe('wordpress');
    expect(filters.q).toBe('wordpress');
  });
  test('price ranges', () => {
    expect(parseQuery('between $5 and $15').filters).toMatchObject({ min_price: 5, max_price: 15 });
    expect(parseQuery('$5-$15').filters).toMatchObject({ min_price: 5, max_price: 15 });
  });
});

describe('filters', () => {
  test('round trip through params', () => {
    const f = filtersFrom('kind=vps,gpu&country=de&min_ram=4&gpu=1&sort=price&has=api');
    expect(f).toEqual({
      kind: ['vps', 'gpu'],
      country: ['DE'],
      has: ['api'],
      min_ram: 4,
      gpu: true,
      sort: 'price',
    });
    expect(paramsFrom(f).toString()).toBe(
      'kind=vps%2Cgpu&country=DE&has=api&min_ram=4&sort=price&gpu=1',
    );
  });
  test('toggle adds and removes', () => {
    const on = toggle({}, 'kind', 'vps');
    expect(on.kind).toEqual(['vps']);
    expect(toggle(on, 'kind', 'vps').kind).toBeUndefined();
  });
  test('buckets set a min and a max, and come off again', () => {
    const on = toggleBucket({}, 'ram', '8');
    expect(on).toEqual({ min_ram: 8, max_ram: 16 });
    expect(toggleBucket(on, 'ram', '8')).toEqual({});
    expect(toggleBucket({}, 'price', '500+')).toEqual({ min_price: 500 });
  });
  test('chips describe and remove', () => {
    const f = { min_vcpu: 2, max_price: 10, country: ['DE'], region: undefined };
    const chips = describeFilters(f);
    expect(chips.map((c) => c.label)).toEqual(['vCPU ≥ 2', '≤ $10/mo', 'DE']);
    expect(without(f, 'vcpu')).toEqual({ max_price: 10, country: ['DE'], region: undefined });
    expect(without({ region: 'eu', country: ['DE', 'FR'] }, 'region')).toEqual({});
  });
  test('ignores junk', () => {
    expect(filtersFrom('sort=bogus&gpu=maybe&limit=abc')).toEqual({});
  });
});

describe('countries', () => {
  test('names, aliases, regions', () => {
    expect(countriesFor('Germany')).toEqual(['DE']);
    expect(countriesFor('uk')).toEqual(['GB']);
    expect(countriesFor('nordics')).toEqual(['SE', 'NO', 'DK', 'FI', 'IS']);
    expect(countriesFor('narnia')).toBeNull();
  });
});
