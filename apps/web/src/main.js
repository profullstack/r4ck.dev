import { config } from '@r4ck/config';
import { close as closeDb, healthcheck } from '@r4ck/db';
import { migrate } from '@r4ck/db/migrate';
import { startSyncLoop } from '@r4ck/sync';
import { app } from './app.js';

/** One process, one container. ROLES decides what runs: web, worker, or both. */
try {
  await migrate();
} catch (err) {
  console.error(`[boot] cannot migrate: ${err?.message ?? err}. Check DATABASE_URL.`);
  throw err;
}
if (!(await healthcheck())) throw new Error('database healthcheck failed at boot');

let sync = null;
if (config.roles.includes('worker')) sync = startSyncLoop();

let server = null;
if (config.roles.includes('web')) {
  server = Bun.serve({ port: config.port, hostname: '::', fetch: app.fetch, idleTimeout: 120 });
  console.log(
    `[web] ${config.siteName} listening on :${config.port} (${config.roles.join(',')}) at ${config.siteUrl}`,
  );
}

async function shutdown(signal) {
  console.log(`[boot] ${signal}, draining`);
  sync?.stop();
  server?.stop(true);
  await closeDb().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
