import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function registerMetaRoutes(app: FastifyInstance) {
  app.get('/api/meta', async () => {
    const [skuCount, supplierCount, salesCount, latestInventory, importCount] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM skus'),
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM suppliers'),
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM sales'),
      pool.query<{
        snapshot_date: string | null;
        sku_count: string;
        sellable_qty: string;
        unsellable_qty: string;
      }>(`
        SELECT
          MAX(snapshot_date)::text AS snapshot_date,
          COUNT(*)::text AS sku_count,
          COALESCE(SUM(sellable_qty), 0)::text AS sellable_qty,
          COALESCE(SUM(unsellable_qty), 0)::text AS unsellable_qty
        FROM inventory_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots)
      `),
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM data_imports'),
    ]);

    const latest = latestInventory.rows[0] ?? {
      snapshot_date: null,
      sku_count: '0',
      sellable_qty: '0',
      unsellable_qty: '0',
    };

    return {
      skus: Number(skuCount.rows[0]?.count ?? 0),
      suppliers: Number(supplierCount.rows[0]?.count ?? 0),
      salesRows: Number(salesCount.rows[0]?.count ?? 0),
      importRuns: Number(importCount.rows[0]?.count ?? 0),
      latestInventorySnapshot: {
        snapshotDate: latest.snapshot_date,
        skuCount: Number(latest.sku_count ?? 0),
        sellableQty: Number(latest.sellable_qty ?? 0),
        unsellableQty: Number(latest.unsellable_qty ?? 0),
      },
    };
  });
}
