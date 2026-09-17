import { describe, expect, test } from 'bun:test';
import { COMMANDS, makeClient, parseArgs, queryFrom, run, table } from '@profullstack/r4ck';

describe('cli parsing', () => {
  test('flags and positionals', () => {
    const { flags, positional } = parseArgs([
      'search',
      'h100',
      'gpu',
      '--min-ram',
      '64',
      '--json',
      '--kind=gpu,vps',
      '--no-gpu',
    ]);
    expect(positional).toEqual(['search', 'h100', 'gpu']);
    expect(flags).toEqual({ minRam: '64', json: true, kind: 'gpu,vps', gpu: false });
  });
  test('flags become the same parameters the API takes', () => {
    const q = queryFrom(
      { minRam: '64', kind: 'gpu, vps', sort: 'price', json: true, facets: true },
      'h100 gpu',
    );
    expect(q.toString()).toBe('q=h100+gpu&min_ram=64&kind=gpu%2Cvps&sort=price');
  });
  test('every command has usage and help', () => {
    for (const c of COMMANDS) expect(c.usage.startsWith(c.name)).toBe(true);
    expect(COMMANDS.map((c) => c.name)).toContain('mcp');
  });
  test('table pads columns', () => {
    const out = table(
      [{ a: 'x', b: 12 }],
      [
        { label: 'a', get: (r) => r.a },
        { label: 'bb', get: (r) => r.b, right: true },
      ],
    );
    expect(out.split('\n')[0]).toBe('a  bb');
    expect(out.split('\n')[2]).toBe('x  12');
  });
});

describe('cli run', () => {
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    expect(init.headers.accept).toBe('application/json');
    if (u.pathname === '/api/v1/search')
      return new Response(
        JSON.stringify({
          total: 1,
          offset: 0,
          limit: 25,
          understood: ['h100'],
          chips: [{ label: 'GPU h100' }],
          servers: [
            {
              id: 7,
              name: 'gpu-1',
              kind: 'gpu',
              provider: { name: 'X' },
              compute: { vcpu: 8, ram_gb: 32, gpu: { model: 'H100' } },
              storage: { disk_gb: 500 },
              location: { countries: [{ code: 'US' }] },
              price: { monthly_usd: 1200, amount: 1200, currency: 'USD', interval: 'month' },
            },
          ],
          agent: { url: 'http://x/api/v1/search?q=h100' },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    if (u.pathname === '/api/v1/stats') return new Response(JSON.stringify({ servers: 5 }));
    return new Response(JSON.stringify({ error: 'nope' }), { status: 404 });
  };
  const capture = () => {
    let text = '';
    return {
      stream: {
        write: (s) => {
          text += s;
          return true;
        },
      },
      text: () => text,
    };
  };
  test('search prints a table, --json prints the reply', async () => {
    const out = capture();
    const code = await run(['search', 'h100', '--api', 'http://x'], {
      stdout: out.stream,
      stderr: out.stream,
      fetchImpl,
    });
    expect(code ?? 0).toBe(0);
    expect(out.text()).toContain('gpu-1');
    expect(out.text()).toContain('$1,200');
    const j = capture();
    await run(['stats', '--json', '--api', 'http://x'], {
      stdout: j.stream,
      stderr: j.stream,
      fetchImpl,
    });
    expect(JSON.parse(j.text())).toEqual({ servers: 5 });
  });
  test('errors carry the API message', async () => {
    const out = capture();
    await expect(
      run(['get', '999', '--api', 'http://x'], {
        stdout: out.stream,
        stderr: out.stream,
        fetchImpl,
      }),
    ).rejects.toThrow('nope');
  });
  test('client sends the key', async () => {
    let auth = null;
    const c = makeClient({
      api: 'http://x',
      key: 'r4k_abc',
      fetchImpl: async (_u, init) => {
        auth = init.headers.authorization;
        return new Response('{}');
      },
    });
    await c.get('/api/v1/me');
    expect(auth).toBe('Bearer r4k_abc');
  });
});
