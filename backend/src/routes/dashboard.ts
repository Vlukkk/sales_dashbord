import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

interface DashboardBootstrapPayload {
  sales: Record<string, unknown>[];
  catalog: {
    products: Record<string, Record<string, unknown>>;
    parentGroups: Record<string, string[]>;
    lieferanten: string[];
  };
  inventory: {
    records: Record<
      string,
      {
        sku: string;
        asin: string | null;
        fulfillmentChannelSku: string | null;
        sellable: number;
        unsellable: number;
        total: number;
      }
    >;
    totals: {
      sellable: number;
      unsellable: number;
      total: number;
      skusWithStock: number;
      trackedSkus: number;
    };
  };
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/bootstrap', async (): Promise<DashboardBootstrapPayload> => {
    const [salesResult, skuResult, inventoryResult] = await Promise.all([
      pool.query<{ raw_record: Record<string, unknown> }>(`
        SELECT raw_record
        FROM sales
        ORDER BY order_date NULLS LAST, id ASC
      `),
      pool.query<{
        sku_code: string;
        parent_sku: string | null;
        raw_attributes: Record<string, unknown> | null;
        supplier_name: string | null;
      }>(`
        SELECT
          sk.sku_code,
          sk.parent_sku,
          sk.raw_attributes,
          s.name AS supplier_name
        FROM skus sk
        LEFT JOIN LATERAL (
          SELECT supplier_id
          FROM sku_supplier
          WHERE sku_id = sk.id
          ORDER BY is_primary DESC, updated_at DESC, supplier_id ASC
          LIMIT 1
        ) ss ON TRUE
        LEFT JOIN suppliers s ON s.id = ss.supplier_id
        ORDER BY sk.sku_code ASC
      `),
      pool.query<{
        sku_code: string;
        asin: string | null;
        fulfillment_channel_sku: string | null;
        sellable_qty: number;
        unsellable_qty: number;
      }>(`
        WITH latest_snapshot AS (
          SELECT MAX(snapshot_date) AS snapshot_date
          FROM inventory_snapshots
        )
        SELECT
          i.sku_code,
          i.asin,
          i.fulfillment_channel_sku,
          i.sellable_qty,
          i.unsellable_qty
        FROM inventory_snapshots i
        JOIN latest_snapshot latest ON latest.snapshot_date = i.snapshot_date
        ORDER BY i.sku_code ASC
      `),
    ]);

    const products: Record<string, Record<string, unknown>> = {};
    const parentGroups: Record<string, string[]> = {};
    const supplierNames = new Set<string>();

    for (const row of skuResult.rows) {
      const product = { ...(row.raw_attributes ?? {}) } as Record<string, unknown>;
      product.sku = String(product.sku ?? row.sku_code);
      product.amaz_parent_sku = row.parent_sku ?? product.amaz_parent_sku ?? null;
      product.lieferant = row.supplier_name ?? product.lieferant ?? null;
      products[row.sku_code] = product;

      if (row.parent_sku) {
        const siblings = parentGroups[row.parent_sku] ?? [];
        siblings.push(row.sku_code);
        parentGroups[row.parent_sku] = siblings;
      }

      if (typeof product.lieferant === 'string' && product.lieferant.trim()) {
        supplierNames.add(product.lieferant.trim());
      }
    }

    const inventoryRecords: DashboardBootstrapPayload['inventory']['records'] = {};
    const inventoryTotals = {
      sellable: 0,
      unsellable: 0,
      total: 0,
      skusWithStock: 0,
      trackedSkus: 0,
    };

    for (const row of inventoryResult.rows) {
      const total = row.sellable_qty + row.unsellable_qty;
      inventoryRecords[row.sku_code] = {
        sku: row.sku_code,
        asin: row.asin,
        fulfillmentChannelSku: row.fulfillment_channel_sku,
        sellable: row.sellable_qty,
        unsellable: row.unsellable_qty,
        total,
      };

      inventoryTotals.sellable += row.sellable_qty;
      inventoryTotals.unsellable += row.unsellable_qty;
      inventoryTotals.total += total;
      inventoryTotals.trackedSkus += 1;
      if (row.sellable_qty > 0) {
        inventoryTotals.skusWithStock += 1;
      }
    }

    return {
      sales: salesResult.rows.map((row) => row.raw_record),
      catalog: {
        products,
        parentGroups,
        lieferanten: Array.from(supplierNames).sort((left, right) => left.localeCompare(right)),
      },
      inventory: {
        records: inventoryRecords,
        totals: inventoryTotals,
      },
    };
  });
}
