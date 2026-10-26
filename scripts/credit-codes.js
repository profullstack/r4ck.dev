#!/usr/bin/env bun
/**
 * Mint and list r4ck credit codes (days of the x402 pass) straight against the
 * database, for an admin on the box. The same as /settings (admin) and
 * POST /api/v1/admin/credits.
 *
 *   bun scripts/credit-codes.js mint --days 30 --label "for Sam" [--max 1] [--expires-days 90]
 *   bun scripts/credit-codes.js list
 *   bun scripts/credit-codes.js revoke <code id>
 *
 * Needs DATABASE_URL (on dev2: `docker exec r4ckdev-app-1 bun scripts/credit-codes.js …`).
 */
import { parseArgs } from 'node:util';
import { codeOut, mintPassCode, services } from '../apps/web/src/lib/credits.js';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    days: { type: 'string' },
    label: { type: 'string', default: '' },
    max: { type: 'string', default: '1' },
    'expires-days': { type: 'string' },
  },
});

const [cmd, arg] = positionals;
if (cmd === 'mint') {
  const made = await mintPassCode({
    days: values.days,
    label: values.label,
    maxRedemptions: values.max,
    expiresInDays: values['expires-days'] ?? null,
    createdBy: 'script',
  });
  console.log(JSON.stringify(made, null, 2));
} else if (cmd === 'list') {
  for (const c of (await services().credits.list()).map((x) => codeOut(x)))
    console.log(
      `${c.id}  ${c.days}d  ${c.redemptions}/${c.max_redemptions}${c.revoked_at ? '  revoked' : ''}  ${c.label}`,
    );
} else if (cmd === 'revoke' && arg) {
  await services().credits.revoke(arg);
  console.log('revoked');
} else {
  console.error(
    'usage: credit-codes.js mint --days N [--label L] [--max N] [--expires-days N] | list | revoke <id>',
  );
  process.exit(2);
}
process.exit(0);
