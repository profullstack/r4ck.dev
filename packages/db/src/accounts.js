import { pgArray, sql, withJson } from './index.js';

/* ------------------------------------------------------------- accounts -- */

export async function findOrCreateUser(email, { admin = false } = {}) {
  const [{ n }] = await sql`select count(*)::int as n from users`;
  const role = admin || n === 0 ? 'admin' : 'user';
  const [row] = await sql`
    insert into users ${sql({ email, role })}
    on conflict (email) do update
      set last_seen_at = now(),
          role = case when ${admin} then 'admin' else users.role end
    returning *, email::text as email, (xmax = 0) as created
  `;
  return row;
}

export async function getUserById(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const [row] = await sql`select *, email::text as email from users where id = ${id}::uuid`;
  return row ?? null;
}

export async function countUsers() {
  const [{ n }] = await sql`select count(*)::int as n from users`;
  return n;
}

export async function insertLoginToken({ tokenHash, email, expiresAt }) {
  await sql`insert into login_tokens ${sql({ token_hash: tokenHash, email, expires_at: expiresAt })}`;
}

/** Single-use by construction: the update is the consumption. Returns the address. */
export async function consumeLoginToken(tokenHash) {
  const [row] = await sql`
    update login_tokens set consumed_at = now()
    where token_hash = ${tokenHash} and consumed_at is null and expires_at > now()
    returning email::text as email
  `;
  return row?.email ?? null;
}

export async function startSession({ userId, ttlDays, userAgent }) {
  const [row] = await sql`
    insert into sessions ${sql({ user_id: userId, expires_at: new Date(Date.now() + ttlDays * 86_400_000), user_agent: userAgent ?? null })}
    returning id
  `;
  return row.id;
}

export async function getSessionUser(sessionId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(sessionId))) return null;
  const [row] = await sql`
    select u.*, u.email::text as email from sessions s join users u on u.id = s.user_id
    where s.id = ${sessionId}::uuid and s.expires_at > now()
  `;
  return row ?? null;
}

export async function endSession(sessionId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(sessionId))) return;
  await sql`delete from sessions where id = ${sessionId}::uuid`;
}

/* ------------------------------------------------------------- passkeys -- */

export async function insertPasskey({ credentialId, userId, publicKey, counter, transports }) {
  await sql`insert into passkeys ${sql({ credential_id: credentialId, user_id: userId, public_key: publicKey, counter })}`;
  await sql`update passkeys set transports = ${pgArray(transports)}::text[] where credential_id = ${credentialId}`;
}

export async function getPasskey(credentialId) {
  const [row] = await sql`select * from passkeys where credential_id = ${credentialId}`;
  return row ?? null;
}

export async function listPasskeys(userId) {
  return sql`select credential_id, created_at, last_used_at from passkeys where user_id = ${userId} order by created_at`;
}

export async function touchPasskey(credentialId, counter) {
  await sql`update passkeys set counter = ${counter}, last_used_at = now() where credential_id = ${credentialId}`;
}

export async function deletePasskey({ userId, credentialId }) {
  await sql`delete from passkeys where user_id = ${userId} and credential_id = ${credentialId}`;
}

/** Challenges live in Postgres for five minutes, so no Redis is needed. */
export async function stashChallenge(challenge) {
  const id = crypto.randomUUID();
  await sql`insert into passkey_challenges ${sql({ id, challenge, expires_at: new Date(Date.now() + 300_000) })}`;
  return id;
}

export async function takeChallenge(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const [row] = await sql`
    delete from passkey_challenges where id = ${id}::uuid returning challenge, expires_at
  `;
  await sql`delete from passkey_challenges where expires_at < now()`.catch(() => {});
  if (!row || new Date(row.expires_at) < new Date()) return null;
  return row.challenge;
}

/* ------------------------------------------------------------ api usage -- */

/** Fixed hourly window per bucket. Returns the count after this hit. */
export async function countHit(bucket, windowMs = 3600_000) {
  const at = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await sql`
    insert into api_usage (bucket, hour, count) values (${bucket}, ${at}, 1)
    on conflict (bucket, hour) do update set count = api_usage.count + 1
    returning count
  `;
  return { count: row.count, resetAt: new Date(at.getTime() + windowMs) };
}

/* -------------------------------------------------------- saved searches -- */

export async function listSaved(userId) {
  return withJson(
    await sql`select id, name, query, created_at from saved_searches where user_id = ${userId} order by created_at desc`,
    ['query'],
  );
}

export async function saveSearch({ userId, name, query }) {
  const [row] = await sql`
    insert into saved_searches ${sql({ user_id: userId, name, query: JSON.stringify(query ?? {}) })}
    returning id, name, query, created_at
  `;
  return withJson([row], ['query'])[0];
}

export async function deleteSaved({ userId, id }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return false;
  const rows =
    await sql`delete from saved_searches where user_id = ${userId} and id = ${id}::uuid returning id`;
  return rows.length > 0;
}

/* ---------------------------------------------------------- crawl sales -- */

export async function recordCrawlSale(sale) {
  await sql`
    insert into crawl_sales ${sql({
      payer: sale.payer ?? null,
      ref: sale.ref ?? null,
      days: sale.days ?? 1,
      price_cents: sale.priceCents,
      total_cents: sale.totalCents ?? sale.priceCents * (sale.days ?? 1),
      currency: sale.currency ?? 'USD',
      user_agent: sale.userAgent ?? null,
      expires_at: sale.expiresAt ? new Date(sale.expiresAt) : null,
    })}
    on conflict (ref) do nothing
  `;
}

export async function crawlSalesSummary() {
  const [row] =
    await sql`select count(*)::int as sales, coalesce(sum(total_cents), 0)::int as cents from crawl_sales`;
  return row;
}
