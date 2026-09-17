import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './index.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Forward-only migrations, keyed by filename, one transaction each. Called on
 * boot by every process; the advisory lock makes that safe when two boot at
 * the same instant.
 */
export async function migrate({ log = console.log, directory = MIGRATIONS_DIR, url } = {}) {
  const sql = connect({ url, max: 1, idleTimeout: 0 });
  try {
    await sql`select pg_advisory_lock(7420001)`;
    try {
      await sql`
        create table if not exists schema_migrations (
          filename   text primary key,
          applied_at timestamptz not null default now()
        )
      `;
      const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort();
      const applied = new Set(
        (await sql`select filename from schema_migrations`).map((r) => r.filename),
      );
      let ran = 0;
      for (const file of files) {
        if (applied.has(file)) continue;
        const body = await readFile(join(directory, file), 'utf8');
        log(`[migrate] applying ${file}`);
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`insert into schema_migrations ${tx({ filename: file })}`;
        });
        ran++;
      }
      log(ran === 0 ? '[migrate] up to date' : `[migrate] applied ${ran} migration(s)`);
      return ran;
    } finally {
      await sql`select pg_advisory_unlock(7420001)`;
    }
  } finally {
    await sql.end();
  }
}
