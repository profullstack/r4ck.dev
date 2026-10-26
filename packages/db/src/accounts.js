import { jsonb, pgArray, sql, withJson } from './index.js';

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

/**
 * `profile` is the validated signup form (@profullstack/profile fields), held on
 * the token because the account row does not exist until the link is spent.
 * Bound as text and cast via ::text: Bun SQL binds a bare `::jsonb` string as a JSON string scalar.
 */
export async function insertLoginToken({
  tokenHash,
  email,
  expiresAt,
  profile = null,
  inviteCode = null,
}) {
  await sql`
    insert into login_tokens (token_hash, email, expires_at, profile, invite_code)
    values (${tokenHash}, ${email}, ${expiresAt}, ${profile ? JSON.stringify(profile) : null}::text::jsonb, ${inviteCode})
  `;
}

/**
 * The signup fields a just-spent link carried, handed out once and then cleared.
 * Only a consumed token answers, so this can never run ahead of the sign-in.
 */
export async function takeSignupProfile(tokenHash) {
  // RETURNING sees the row after the update, so the old value comes from a
  // subquery: `returning profile` here would always hand back the null.
  const [row] = await sql`
    update login_tokens t set profile = null
    from (
      select token_hash, profile from login_tokens
      where token_hash = ${tokenHash} and consumed_at is not null and profile is not null
      for update
    ) old
    where t.token_hash = old.token_hash
    returning old.profile
  `;
  if (!row) return null;
  return jsonb(row.profile, null);
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

/** Sold passes only: a granted one (a code, an invite bonus) is not a sale. */
export async function crawlSalesSummary() {
  const [row] =
    await sql`select count(*)::int as sales, coalesce(sum(total_cents), 0)::int as cents from crawl_sales where user_id is null`;
  return row;
}

/* ------------------------------------------------------- account passes -- */

/**
 * Add `days` of pass to an account: a $0 crawl_sales row with the account as
 * owner, starting when the account's running pass ends (or now). Idempotent on
 * `ref`: the same grant twice is one term. Serialised per account by an
 * advisory lock, so two grants at once stack instead of overlapping.
 * Resolves to the row written, or null when `ref` was already granted.
 */
export async function grantPassDays({ userId, days, ref, source = 'grant', passMinutes = 1440 }) {
  const d = Math.trunc(Number(days));
  if (!userId) throw new Error('a pass grant needs an account');
  if (!Number.isFinite(d) || d <= 0)
    throw new Error('a pass grant needs a positive number of days');
  if (!ref) throw new Error('a pass grant needs a ref');
  const minutes = d * Math.max(1, Math.trunc(passMinutes));
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('r4ck_pass'), hashtext(${String(userId)}))`;
    const [row] = await tx`
      insert into crawl_sales (payer, ref, days, price_cents, total_cents, currency, user_agent, expires_at, user_id, source)
      select null, ${ref}, ${d}, 0, 0, 'USD', null,
             s.start_at + make_interval(mins => ${minutes}::int),
             ${userId}::uuid, ${source}
      from (
        select greatest(now(), coalesce(max(expires_at), now())) as start_at
        from crawl_sales where user_id = ${userId}::uuid
      ) s
      on conflict (ref) do nothing
      returning id, ref, days, expires_at, source
    `;
    return row ?? null;
  });
}

/** When the account's pass runs out, or null when it holds none that is live. */
export async function accountPassUntil(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) return null;
  const [row] = await sql`
    select max(expires_at) as until from crawl_sales
    where user_id = ${userId}::uuid and expires_at > now()
  `;
  return row?.until ? new Date(row.until) : null;
}

/** The account's pass grants, newest first. */
export async function accountPassGrants(userId) {
  return sql`
    select ref, days, source, expires_at, created_at from crawl_sales
    where user_id = ${userId}::uuid order by created_at desc limit 50
  `;
}

/* -------------------------------------------------------------- invites -- */

/** The invite a sign-in link carries, read when the link is spent. */
export async function loginTokenInvite(tokenHash) {
  const [row] = await sql`select invite_code from login_tokens where token_hash = ${tokenHash}`;
  return row?.invite_code ?? null;
}

export async function recordInviteOrigin({ inviteId, ipHash }) {
  await sql`
    insert into invite_origins (invite_id, ip_hash) values (${inviteId}, ${ipHash ?? null})
    on conflict (invite_id) do nothing
  `;
}

export async function inviteOrigin(inviteId) {
  const [row] = await sql`select ip_hash from invite_origins where invite_id = ${inviteId}`;
  return row?.ip_hash ?? null;
}

/**
 * Record one side's bonus decision. False when that side of that invite was
 * already decided (the primary key), so a caller pays only on true.
 */
export async function decideInviteBonus({ inviteId, side, userId, days, paid, reason = null }) {
  const rows = await sql`
    insert into invite_bonuses (invite_id, side, user_id, days, paid, reason)
    values (${inviteId}, ${side}, ${userId}::uuid, ${Math.trunc(days)}, ${paid}, ${reason})
    on conflict (invite_id, side) do nothing
    returning invite_id
  `;
  return rows.length > 0;
}

/** Inviter bonuses paid to an account in the last `days` days: the monthly cap. */
export async function inviterBonusesSince(userId, days = 30) {
  const [row] = await sql`
    select count(*)::int as n from invite_bonuses
    where user_id = ${userId}::uuid and side = 'inviter' and paid
      and created_at > now() - make_interval(days => ${Math.trunc(days)}::int)
  `;
  return row?.n ?? 0;
}
