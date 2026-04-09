import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';

const supplierParamsSchema = z.object({
  supplierName: z.string().min(1),
});

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get('/api/inventory/latest/suppliers', async () => {
    const result = await pool.query<{
      supplier_name: string;
      sku_count: string;
      skus_with_stock: string;
      sellable_qty: string;
      unsellable_qty: string;
      total_qty: string;
    }>(`
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM inventory_snapshots
      )
      SELECT
        COALESCE(s.name, 'Без поставщика') AS supplier_name,
        COUNT(*)::text AS sku_count,
        COUNT(*) FILTER (WHERE i.sellable_qty > 0)::text AS skus_with_stock,
        COALESCE(SUM(i.sellable_qty), 0)::text AS sellable_qty,
        COALESCE(SUM(i.unsellable_qty), 0)::text AS unsellable_qty,
        COALESCE(SUM(i.sellable_qty + i.unsellable_qty), 0)::text AS total_qty
      FROM inventory_snapshots i
      JOIN latest_snapshot latest ON latest.snapshot_date = i.snapshot_date
      LEFT JOIN skus sk ON sk.sku_code = i.sku_code
      LEFT JOIN LATERAL (
        SELECT supplier_id
        FROM sku_supplier
        WHERE sku_id = sk.id
        ORDER BY is_primary DESC, updated_at DESC, supplier_id ASC
        LIMIT 1
      ) ss ON TRUE
      LEFT JOIN suppliers s ON s.id = ss.supplier_id
      GROUP BY COALESCE(s.name, 'Без поставщика')
      ORDER BY COALESCE(SUM(i.sellable_qty + i.unsellable_qty), 0) DESC, supplier_name ASC
    `);

    return {
      items: result.rows.map((row) => ({
        supplierName: row.supplier_name,
        skuCount: Number(row.sku_count),
        skusWithStock: Number(row.skus_with_stock),
        sellableQty: Number(row.sellable_qty),
        unsellableQty: Number(row.unsellable_qty),
        totalQty: Number(row.total_qty),
      })),
    };
  });

  app.get('/api/inventory/latest/suppliers/:supplierName', async (request) => {
    const { supplierName } = supplierParamsSchema.parse(request.params);

    const result = await pool.query<{
      sku_code: string;
      title: string | null;
      asin: string | null;
      parent_sku: string | null;
      sellable_qty: string;
      unsellable_qty: string;
      total_qty: string;
    }>(`
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM inventory_snapshots
      )
      SELECT
        i.sku_code,
        sk.title,
        i.asin,
        sk.parent_sku,
        i.sellable_qty::text,
        i.unsellable_qty::text,
        (i.sellable_qty + i.unsellable_qty)::text AS total_qty
      FROM inventory_snapshots i
      JOIN latest_snapshot latest ON latest.snapshot_date = i.snapshot_date
      LEFT JOIN skus sk ON sk.sku_code = i.sku_code
      LEFT JOIN LATERAL (
        SELECT supplier_id
        FROM sku_supplier
        WHERE sku_id = sk.id
        ORDER BY is_primary DESC, updated_at DESC, supplier_id ASC
        LIMIT 1
      ) ss ON TRUE
      LEFT JOIN suppliers s ON s.id = ss.supplier_id
      WHERE COALESCE(s.name, 'Без поставщика') = $1
      ORDER BY i.sellable_qty DESC, i.sku_code ASC
    `, [supplierName]);

    return {
      supplierName,
      items: result.rows.map((row) => ({
        skuCode: row.sku_code,
        title: row.title,
        asin: row.asin,
        parentSku: row.parent_sku,
        sellableQty: Number(row.sellable_qty),
        unsellableQty: Number(row.unsellable_qty),
        totalQty: Number(row.total_qty),
      })),
    };
  });
}
