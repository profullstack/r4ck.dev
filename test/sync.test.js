import { describe, expect, test } from 'bun:test';

const url = process.env.DATABASE_URL;
if (!url) {
  test.skip('needs DATABASE_URL', () => {});
} else {
  const { migrate } = await import('@r4ck/db/migrate');
  const { sql } = await import('@r4ck/db');
  const cat = await import('@r4ck/db/catalog');
  const { syncTick } = await import('@r4ck/sync');

  const plan = (id, name, price, updated) => ({
    id,
    kind: 'plan',
    source: 'vultr-plans',
    adapter: 'vultr-plans',
    title: name,
    tags: ['plan'],
    updated_at: updated,
    data: {
      provider: 'synctest',
      providerName: 'SyncTest',
      offer: {
        id: name,
        name,
        url: 'https://synctest.example/x',
        kind: 'vps',
        compute: { vcpu: 1, ram_mb: 1024 },
        storage: [],
        network: {},
        price: { amount: price, currency: 'USD', interval: 'month' },
        location: { countries: ['US'] },
      },
    },
  });

  describe('syncTick', () => {
    test('recent rows land, the walk resumes across ticks under a budget, and completes', async () => {
      await migrate({ log: () => {} });
      await sql`delete from servers where nichedb_id between 91000 and 91999`;
      await sql`delete from providers where slug = 'synctest'`;
      await sql`delete from sync_state where key = 'nichedb'`;
      const rows = Array.from({ length: 450 }, (_, i) =>
        plan(91000 + i, `p${i}`, 5 + i, '2026-09-10T00:00:00Z'),
      );
      let clock = 0;
      const now = () => clock;
      const calls = [];
      const client = {
        recent: async () => {
          calls.push('recent');
          return [plan(91900, 'fresh', 1, '2026-09-17T00:00:00Z')];
        },
        page: async ({ before }) => {
          calls.push(`page:${before}`);
          clock += 1000; // each page costs a second
          const slice = rows
            .filter((r) => before === null || r.id < before)
            .sort((a, b) => b.id - a.id)
            .slice(0, 200);
          return slice;
        },
      };
      // Tick 1: recent + two walk pages, then the budget (1.5 s) runs out.
      await syncTick({ log: () => {}, client, budgetMs: 1500, walkEveryMs: 0, now });
      let state = await cat.getSyncState('nichedb');
      expect(state.walk).toBeTruthy();
      expect(state.walk.seen).toBe(400);
      expect(state.watermark).toBe('2026-09-17T00:00:00Z');
      expect(calls.filter((c) => c.startsWith('page')).length).toBe(2);
      // Tick 2: resumes from the cursor and finishes.
      clock = 0;
      await syncTick({ log: () => {}, client, budgetMs: 2500, walkEveryMs: 0, now });
      state = await cat.getSyncState('nichedb');
      expect(state.walk).toBeNull();
      expect(state.walkRows).toBe(450);
      const [{ n }] =
        await sql`select count(*)::int as n from servers where nichedb_id between 91000 and 91999`;
      expect(n).toBe(451);
      // Tick 3: no walk is due for a day, so only the recent page is read.
      const before = calls.length;
      await syncTick({
        log: () => {},
        client,
        budgetMs: 2500,
        walkEveryMs: 86_400_000,
        now: () => Date.now(),
      });
      expect(calls.slice(before)).toEqual(['recent']);
      // A failing recent page never stops the walk from being attempted.
      await sql`delete from sync_state where key = 'nichedb'`;
      const flaky = {
        recent: async () => {
          throw new Error('timeout');
        },
        page: client.page,
      };
      const counts = await syncTick({
        log: () => {},
        client: flaky,
        budgetMs: 60_000,
        walkEveryMs: 0,
        now: () => Date.now(),
      });
      expect(counts.servers).toBe(450);
      await sql`delete from servers where nichedb_id between 91000 and 91999`;
      await sql`delete from providers where slug = 'synctest'`;
      await sql`delete from sync_state where key = 'nichedb'`;
      await sql.end();
    });
  });
}
