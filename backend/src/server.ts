import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appConfig } from './config.js';
import { closePool, pool } from './db.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerHealthRoute } from './routes/health.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerInventoryRoutes } from './routes/inventory.js';
import { registerMetaRoutes } from './routes/meta.js';

async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: appConfig.corsOrigin,
  });

  await registerHealthRoute(app);
  await registerDashboardRoutes(app);
  await registerMetaRoutes(app);
  await registerImportRoutes(app);
  await registerInventoryRoutes(app);

  app.addHook('onClose', async () => {
    await closePool();
  });

  return app;
}

async function main() {
  const app = await buildServer();

  await pool.query('SELECT 1');
  await app.listen({
    host: '0.0.0.0',
    port: appConfig.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
