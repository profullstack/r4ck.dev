import { config } from '@r4ck/config';
import { SQL } from 'bun';

/** One pool per process, Bun's native Postgres client: no native addons. */
export function connect({
  url = config.databaseUrl,
  max = Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeout = 30,
} = {}) {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new SQL({
    url,
    max,
    idleTimeout,
    connectionTimeout: 15,
    tls: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
}

export const sql = connect();

export async function healthcheck() {
  const [row] = await sql`select 1 as ok`;
  return row?.ok === 1;
}

export async function close() {
  await sql.end();
}

/** Postgres array literal from a JS array, for `::text[]` casts. */
export function pgArray(values) {
  const items = (values ?? []).map((v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`);
  return `{${items.join(',')}}`;
}

/** Bun's driver can hand jsonb back as text; read it either way. */
export function jsonb(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

/** Parse the named jsonb columns on every row. */
export const withJson = (rows, cols = ['data']) =>
  rows.map((r) =>
    r
      ? { ...r, ...Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, jsonb(r[c])])) }
      : r,
  );
