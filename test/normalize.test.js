import { describe, expect, test } from 'bun:test';
import { DEFAULT_RATES, monthlyUsd } from '@r4ck/core/fx';
import { itemToDeal, itemToProvider, itemToServer, providerFromServer } from '@r4ck/core/normalize';

const plan = {
  id: 9931301,
  external_id: 'vultr:plan:vbm-8c-128gb-amd',
  kind: 'plan',
  source: 'vultr-plans',
  adapter: 'vultr-plans',
  title: 'Vultr vbm-8c-128gb-amd',
  summary: '16 vCPU, 123.4 GB RAM',
  tags: ['plan', 'provider:vultr', 'kind:bare-metal'],
  updated_at: '2026-09-13T01:50:42.156Z',
  data: {
    provider: 'vultr',
    providerName: 'Vultr',
    priceHourly: 0.55,
    offer: {
      id: 'vbm-8c-128gb-amd',
      name: 'vbm-8c-128gb-amd',
      url: 'https://www.vultr.com/pricing/',
      kind: 'bare-metal',
      tenancy: 'dedicated',
      compute: { vcpu: 16, cores: 8, ram_mb: 126386, arch: null, gpu: null },
      storage: [
        { type: 'nvme', size_gb: 1945 },
        { type: 'nvme', size_gb: 1945 },
      ],
      network: { bandwidth_mbps: 0, transfer_gb: 10240, ipv4: 1, ipv6: true },
      price: { amount: 395, currency: 'USD', interval: 'month', setup: 0, commitment: null },
      stock: 'unknown',
      location: { regions: ['ewr'], countries: ['US'] },
    },
  },
};

describe('monthlyUsd', () => {
  test('converts and prorates, never guesses', () => {
    expect(monthlyUsd({ amount: 10, currency: 'EUR', interval: 'year' })).toBeCloseTo(
      (10 / 12) * DEFAULT_RATES.EUR,
      3,
    );
    expect(monthlyUsd({ amount: 0.02, currency: 'USD', interval: 'hour' })).toBeCloseTo(14.6, 1);
    expect(monthlyUsd({ amount: 5, currency: 'USD', interval: null })).toBeNull();
    expect(monthlyUsd({ amount: 5, currency: 'XXX', interval: 'month' })).toBeNull();
    expect(monthlyUsd({ amount: 0, currency: 'USD', interval: 'month' })).toBe(0);
  });
});

describe('itemToServer', () => {
  test('reads an OpenServer offer', () => {
    const s = itemToServer(plan);
    expect(s).toMatchObject({
      nichedb_id: 9931301,
      provider: 'vultr',
      provider_name: 'Vultr',
      kind: 'bare-metal',
      vcpu: 16,
      cores: 8,
      ram_mb: 126386,
      disk_gb: 3890,
      disk_type: 'nvme',
      transfer_gb: 10240,
      ipv6: true,
      price: 395,
      currency: 'USD',
      interval: 'month',
      monthly_usd: 395,
      hourly_usd: 0.55,
      countries: ['US'],
      platform: 'api',
    });
    expect(s.gpu_model).toBeNull();
    expect(s.bandwidth_mbps).toBe(0);
  });
  test('null specs stay null', () => {
    const s = itemToServer({
      ...plan,
      data: {
        ...plan.data,
        offer: {
          ...plan.data.offer,
          compute: { vcpu: null, ram_mb: null },
          storage: [],
          network: {},
        },
      },
    });
    expect(s.vcpu).toBeNull();
    expect(s.ram_mb).toBeNull();
    expect(s.disk_gb).toBeNull();
  });
  test('gpu offers', () => {
    const s = itemToServer({
      ...plan,
      data: {
        ...plan.data,
        offer: {
          ...plan.data.offer,
          kind: 'gpu',
          compute: { vcpu: 24, ram_mb: 262144, gpu: { model: 'H100', count: 2, vram_mb: 81920 } },
        },
      },
    });
    expect(s).toMatchObject({ kind: 'gpu', gpu_model: 'H100', gpu_count: 2, gpu_vram_mb: 81920 });
  });
});

describe('providers and deals', () => {
  test('a register row', () => {
    const p = itemToProvider({
      id: 1,
      kind: 'provider',
      source: 'findhost-providers',
      title: 'Zerops',
      summary: 'Czech PaaS',
      url: 'https://www.findhost.app/zerops/',
      image_url: 'x.png',
      tags: ['provider', 'paas'],
      data: {
        provider: 'zerops',
        findhostId: 'zerops',
        country: 'CZ',
        greenWebId: null,
        attribution: 'FindHost, findhost.app, CC BY 4.0',
        facets: {
          hqCountry: 'CZ',
          regions: ['CZ'],
          category: ['paas'],
          automation: ['api', 'cli'],
          runtimes: ['node'],
        },
      },
      enrichment: {
        developer: {
          domain: 'zerops.io',
          api_docs: 'https://zerops.io/docs/api',
          status: 'https://status.zerops.io/',
        },
      },
    });
    expect(p).toMatchObject({
      slug: 'zerops',
      name: 'Zerops',
      domain: 'zerops.io',
      url: 'https://zerops.io/',
      country: 'CZ',
      automation: ['api', 'cli'],
      api_docs: 'https://zerops.io/docs/api',
      categories: ['paas'],
    });
  });
  test('a storefront host gets an inferred provider', () => {
    const s = itemToServer({
      ...plan,
      data: {
        ...plan.data,
        provider: 'incognet.io',
        providerName: 'IncogNET LLC',
        platform: 'whmcs',
      },
    });
    const p = providerFromServer(s);
    expect(p).toMatchObject({
      slug: 'incognet.io',
      domain: 'incognet.io',
      url: 'https://incognet.io/',
      name: 'IncogNET LLC',
    });
    expect(p.data.inferred).toBe(true);
  });
  test('a deal', () => {
    expect(
      itemToDeal({
        id: 5,
        title: 'T',
        url: 'u',
        summary: 's',
        source: 'lowendbox',
        published_at: '2026-01-01T00:00:00Z',
        tags: ['deal'],
        data: {},
      }),
    ).toMatchObject({ nichedb_id: 5, title: 'T', source: 'lowendbox' });
  });
});
