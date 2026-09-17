import { createHash } from 'node:crypto';
import { createApiKeyManager } from '@profullstack/api-key-manager';
import { sql } from '@r4ck/db';

/**
 * API keys through @profullstack/api-key-manager, stored in Postgres. The
 * key value is never stored: a SHA-256 and a display prefix are, so a copy of
 * the database cannot call the API. Keys look like `r4k_<64 hex>`.
 */
export const KEY_PREFIX = 'r4k_';
const hash = (key) => createHash('sha256').update(String(key)).digest();

function toRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: null,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    permissions: row.permissions ?? {},
    isActive: row.is_active && !row.revoked_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
  };
}

export class PostgresAdapter {
  async saveKey(apiKey) {
    await sql`
      insert into api_keys (id, user_id, name, prefix, key_hash, permissions, is_active, expires_at, metadata, created_at)
      values (${apiKey.id}, ${apiKey.userId}::uuid, ${apiKey.name}, ${apiKey.key.slice(0, 12)}, ${hash(apiKey.key)},
        ${JSON.stringify(apiKey.permissions ?? {})}::jsonb, ${apiKey.isActive !== false}, ${apiKey.expiresAt ?? null},
        ${JSON.stringify(apiKey.metadata ?? {})}::jsonb, ${apiKey.createdAt ?? new Date()})
    `;
  }
  async getKeyById(id) {
    const [row] = await sql`select * from api_keys where id = ${String(id)}`;
    return toRecord(row);
  }
  async getKeyByValue(value) {
    if (!value) return null;
    const [row] = await sql`select * from api_keys where key_hash = ${hash(value)}`;
    return toRecord(row);
  }
  async getKeysByUserId(userId) {
    const rows =
      await sql`select * from api_keys where user_id = ${userId}::uuid and is_active order by created_at`;
    return rows.map(toRecord);
  }
  async updateKey(id, updated) {
    const [row] = await sql`
      update api_keys set
        name = coalesce(${updated.name ?? null}, name),
        is_active = coalesce(${updated.isActive ?? null}, is_active),
        revoked_at = case when ${updated.isActive === false} then now() else revoked_at end,
        last_used_at = coalesce(${updated.lastUsedAt ?? null}, last_used_at),
        expires_at = ${updated.expiresAt ?? null},
        permissions = coalesce(${updated.permissions ? JSON.stringify(updated.permissions) : null}::jsonb, permissions),
        metadata = coalesce(${updated.metadata ? JSON.stringify(updated.metadata) : null}::jsonb, metadata)
      where id = ${String(id)} returning *
    `;
    return toRecord(row);
  }
  async deleteKey(id) {
    const rows = await sql`delete from api_keys where id = ${String(id)} returning id`;
    return rows.length > 0;
  }
  /** Rate limiting is done by the API layer per plan; the manager's own check is a no-op. */
  async checkRateLimit() {
    return true;
  }
}

export const keys = createApiKeyManager({
  adapter: new PostgresAdapter(),
  prefix: KEY_PREFIX,
  keyLength: 32,
});

export async function createApiKey({ userId, name }) {
  const created = await keys.createKey({
    userId,
    name: name || 'default',
    permissions: { read: true, write: true },
  });
  return { key: created.key, id: created.id, prefix: created.key.slice(0, 12) };
}

export const listApiKeys = (userId) => keys.getKeys(userId);
export const revokeApiKey = ({ userId, id }) => keys.updateKey(id, userId, { isActive: false });

export async function validateApiKey(value) {
  if (!value || !String(value).startsWith(KEY_PREFIX)) return null;
  return keys.validateKey(String(value));
}
