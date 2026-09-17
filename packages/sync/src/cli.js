import { close } from '@r4ck/db';
import { migrate } from '@r4ck/db/migrate';
import { refreshRates, seedIfEmpty, snapshotItems, syncOnce } from './index.js';

/** `bun run sync [--full] [--file snapshot.json]` */
const args = process.argv.slice(2);
const full = args.includes('--full');
const fileAt = args.indexOf('--file');
await migrate();
if (args.includes('--rates')) await refreshRates();
let items = null;
if (args.includes('--snapshot')) items = await snapshotItems();
else if (args.includes('--seed-if-empty')) {
  await seedIfEmpty();
  await close();
  process.exit(0);
}
if (fileAt >= 0) {
  const rows = JSON.parse(await Bun.file(args[fileAt + 1]).text());
  items = (async function* () {
    for (let i = 0; i < rows.length; i += 200) yield rows.slice(i, i + 200);
  })();
}
await syncOnce({ full, items });
await close();
process.exit(0);
