import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  buildFilterClause,
  buildInventoryFilterClause,
  parseFilterParams,
  SALES_JOINS,
  INVENTORY_JOINS,
  type DashboardFilterParams,
} from './dashboard-queries.js';

interface DashboardBootstrapPayload {
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
  filterOptions: {
    statuses: string[];
    customerGroups: string[];
    channels: string[];
    minDate: string | null;
    maxDate: string | null;
  };
}

interface MetricSummary {
  revenue: number;
  profit: number;
  orders: number;
  units: number;
  refunds: number;
  refundedUnits: number;
  refundOrders: number;
  margin: number;
  avgOrder: number;
  refundRate: number;
  activeSkus: number;
  rows: number;
}

interface InventorySummary {
  sellable: number;
  unsellable: number;
  total: number;
  skusWithStock: number;
  lowStockSkus: number;
  trackedSkus: number;
}

interface ScopeRow {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  orders: number;
  units: number;
  refunds: number;
  refundedUnits: number;
  refundOrders: number;
  margin: number;
  avgOrder: number;
  refundRate: number;
  activeSkus: number;
  rows: number;
  parentSku: string | null;
  lieferant: string | null;
  productName: string | null;
  stockSellable: number;
  stockTotal: number;
  lastSaleDate: string | null;
  hasReturns: boolean;
}

interface DailyPoint {
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  refundRevenue: number;
}

const SUMMARY_SELECT = `
  COALESCE(NULLIF(COUNT(DISTINCT s.order_number), 0), COUNT(*)) AS orders,
  COALESCE(SUM(s.qty_ordered), 0) AS units,
  COALESCE(SUM(s.qty_refunded), 0) AS refunded_units,
  COALESCE(SUM(s.total_incl_tax), 0) AS revenue,
  COALESCE(SUM(s.total_profit), 0) AS profit,
  COALESCE(SUM(s.refunded_incl_tax), 0) AS refunds,
  COUNT(*) FILTER (WHERE COALESCE(s.qty_refunded, 0) > 0 OR COALESCE(s.refunded_incl_tax, 0) > 0) AS refund_orders,
  COUNT(DISTINCT s.sku_code) AS active_skus,
  COUNT(*) AS row_count
`;

function appendCondition(where: string, condition: string) {
  return where ? `${where} AND ${condition}` : `WHERE ${condition}`;
}

function computePreviousPeriod(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const spanMs = to.getTime() - from.getTime() + 86400000;
  const previousTo = new Date(from.getTime() - 86400000);
  const previousFrom = new Date(previousTo.getTime() - spanMs + 86400000);

  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

function buildMetricSummary(row: Record<string, unknown> | undefined): MetricSummary {
  const revenue = Number(row?.revenue) || 0;
  const profit = Number(row?.profit) || 0;
  const orders = Number(row?.orders) || 0;
  const units = Number(row?.units) || 0;
  const refundedUnits = Number(row?.refunded_units) || 0;
  const refunds = Number(row?.refunds) || 0;
  const refundOrders = Number(row?.refund_orders) || 0;
  const activeSkus = Number(row?.active_skus) || 0;
  const rows = Number(row?.row_count) || 0;

  return {
    revenue,
    profit,
    orders,
    units,
    refunds,
    refundedUnits,
    refundOrders,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    avgOrder: orders > 0 ? revenue / orders : 0,
    refundRate: units > 0 ? (refundedUnits / units) * 100 : 0,
    activeSkus,
    rows,
  };
}

function buildInventorySummary(row: Record<string, unknown> | undefined): InventorySummary {
  const sellable = Number(row?.sellable) || 0;
  const unsellable = Number(row?.unsellable) || 0;

  return {
    sellable,
    unsellable,
    total: sellable + unsellable,
    skusWithStock: Number(row?.skus_with_stock) || 0,
    lowStockSkus: Number(row?.low_stock_skus) || 0,
    trackedSkus: Number(row?.tracked_skus) || 0,
  };
}

function fillDateGaps(points: DailyPoint[], from: string | null, to: string | null): DailyPoint[] {
  const rangeFrom = from ?? points[0]?.date ?? null;
  const rangeTo = to ?? points[points.length - 1]?.date ?? null;

  if (!rangeFrom || !rangeTo) {
    return [];
  }

  const pointMap = new Map(points.map((point) => [point.date, point]));
  const result: DailyPoint[] = [];
  const cursor = new Date(rangeFrom);
  const end = new Date(rangeTo);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    result.push(pointMap.get(date) ?? {
      date,
      sales: 0,
      refunds: 0,
      refundRate: 0,
      revenue: 0,
      refundRevenue: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

async function runSummary(filters: DashboardFilterParams, chartChannel?: string) {
  const clause = buildFilterClause(filters);
  const params = [...clause.params];
  let where = clause.where;

  if (chartChannel) {
    where = appendCondition(where, `s.channel = $${params.length + 1}`);
    params.push(chartChannel);
  }

  const sql = `SELECT ${SUMMARY_SELECT} ${SALES_JOINS} ${where}`;
  const result = await pool.query(sql, params);
  return buildMetricSummary(result.rows[0]);
}

async function runDailySeries(filters: DashboardFilterParams, chartChannel?: string) {
  const clause = buildFilterClause(filters);
  const params = [...clause.params];
  let where = clause.where;

  if (chartChannel) {
    where = appendCondition(where, `s.channel = $${params.length + 1}`);
    params.push(chartChannel);
  }

  const sql = `
    SELECT
      s.order_date::date::text AS day,
      COALESCE(SUM(s.qty_ordered), 0) AS sales,
      COALESCE(SUM(s.qty_refunded), 0) AS refunds,
      COALESCE(SUM(s.total_incl_tax), 0) AS revenue,
      COALESCE(SUM(s.refunded_incl_tax), 0) AS refund_revenue
    ${SALES_JOINS}
    ${where}
    GROUP BY day
    ORDER BY day ASC
  `;

  const result = await pool.query<{
    day: string;
    sales: number;
    refunds: number;
    revenue: number;
    refund_revenue: number;
  }>(sql, params);

  return result.rows.map((row) => ({
    date: row.day,
    sales: Number(row.sales) || 0,
    refunds: Number(row.refunds) || 0,
    refundRate: (Number(row.sales) || 0) > 0 ? ((Number(row.refunds) || 0) / Number(row.sales)) * 100 : 0,
    revenue: Number(row.revenue) || 0,
    refundRevenue: Number(row.refund_revenue) || 0,
  }));
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/bootstrap', async (): Promise<DashboardBootstrapPayload> => {
    const [skuResult, inventoryResult, filterOptionsResult] = await Promise.all([
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
        SELECT
          i.sku_code,
          i.asin,
          i.fulfillment_channel_sku,
          i.sellable_qty,
          i.unsellable_qty
        ${INVENTORY_JOINS}
        ORDER BY i.sku_code ASC
      `),
      pool.query<{
        statuses: string[] | null;
        customer_groups: string[] | null;
        channels: string[] | null;
        min_date: string | null;
        max_date: string | null;
      }>(`
        SELECT
          ARRAY_AGG(DISTINCT order_status) FILTER (WHERE order_status IS NOT NULL) AS statuses,
          ARRAY_AGG(DISTINCT customer_group) FILTER (WHERE customer_group IS NOT NULL) AS customer_groups,
          ARRAY_AGG(DISTINCT channel) FILTER (WHERE channel IS NOT NULL) AS channels,
          MIN(order_date)::date::text AS min_date,
          MAX(order_date)::date::text AS max_date
        FROM sales
      `),
    ]);

    const products: Record<string, Record<string, unknown>> = {};
    const parentGroups: Record<string, string[]> = {};
    const supplierNames = new Set<string>();

    for (const row of skuResult.rows) {
      const raw = row.raw_attributes ?? {};
      const product: Record<string, unknown> = {
        sku: String(raw.sku ?? row.sku_code),
        sku_vender: raw.sku_vender ?? null,
        purchase_price: raw.purchase_price ?? null,
        amaz_parent_sku: row.parent_sku ?? raw.amaz_parent_sku ?? null,
        amaz_name: raw.amaz_name ?? null,
        chain_length: raw.chain_length ?? null,
        product_type: raw.product_type ?? null,
        amaz_metal_stamp: raw.amaz_metal_stamp ?? null,
        lieferant: row.supplier_name ?? raw.lieferant ?? null,
        amaz_price: raw.amaz_price ?? null,
        status: raw.status ?? null,
      };
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

    const filterOptions = filterOptionsResult.rows[0];

    return {
      catalog: {
        products,
        parentGroups,
        lieferanten: Array.from(supplierNames).sort((left, right) => left.localeCompare(right)),
      },
      inventory: {
        records: inventoryRecords,
        totals: inventoryTotals,
      },
      filterOptions: {
        statuses: [...(filterOptions?.statuses ?? [])].sort((left, right) => left.localeCompare(right)),
        customerGroups: [...(filterOptions?.customer_groups ?? [])].sort((left, right) => left.localeCompare(right)),
        channels: [...(filterOptions?.channels ?? [])].sort((left, right) => left.localeCompare(right)),
        minDate: filterOptions?.min_date ?? null,
        maxDate: filterOptions?.max_date ?? null,
      },
    };
  });

  app.get('/api/dashboard/summary', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const withComparison = query.withComparison === 'true' || query.withComparison === '1';

    const [current, inventorySummary] = await Promise.all([
      runSummary(filters),
      (async () => {
        const inventoryClause = buildInventoryFilterClause(filters);
        const inventorySql = `
          SELECT
            COALESCE(SUM(i.sellable_qty), 0) AS sellable,
            COALESCE(SUM(i.unsellable_qty), 0) AS unsellable,
            COUNT(*) FILTER (WHERE i.sellable_qty > 0) AS skus_with_stock,
            COUNT(*) FILTER (WHERE i.sellable_qty > 0 AND i.sellable_qty <= 3) AS low_stock_skus,
            COUNT(*) AS tracked_skus
          ${INVENTORY_JOINS}
          ${inventoryClause.where}
        `;
        const result = await pool.query(inventorySql, inventoryClause.params);
        return buildInventorySummary(result.rows[0]);
      })(),
    ]);

    let previous: MetricSummary | null = null;
    if (withComparison && filters.dateFrom && filters.dateTo) {
      const previousPeriod = computePreviousPeriod(filters.dateFrom, filters.dateTo);
      previous = await runSummary({ ...filters, dateFrom: previousPeriod.from, dateTo: previousPeriod.to });
    }

    return {
      current,
      previous,
      inventorySummary,
    };
  });

  app.get('/api/dashboard/daily-series', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const chartChannel = query.chartChannel;
    const withComparison = query.withComparison === 'true' || query.withComparison === '1';

    const [currentSummary, currentPointsRaw] = await Promise.all([
      runSummary(filters, chartChannel),
      runDailySeries(filters, chartChannel),
    ]);

    let previousSummary: MetricSummary | null = null;
    if (withComparison && filters.dateFrom && filters.dateTo) {
      const previousPeriod = computePreviousPeriod(filters.dateFrom, filters.dateTo);
      previousSummary = await runSummary(
        { ...filters, dateFrom: previousPeriod.from, dateTo: previousPeriod.to },
        chartChannel,
      );
    }

    const rangeFrom = filters.dateFrom ?? currentPointsRaw[0]?.date ?? null;
    const rangeTo = filters.dateTo ?? currentPointsRaw[currentPointsRaw.length - 1]?.date ?? null;

    return {
      points: fillDateGaps(currentPointsRaw, rangeFrom, rangeTo),
      summary: currentSummary,
      previousSummary,
      from: rangeFrom,
      to: rangeTo,
    };
  });

  app.get('/api/dashboard/scope-rows', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const groupBy = query.groupBy === 'parentSku' ? 'parentSku' : 'artikelposition';
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 5000);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const clause = buildFilterClause(filters);
    const limitIndex = clause.params.length + 1;
    const offsetIndex = clause.params.length + 2;

    const sql = groupBy === 'parentSku'
      ? `
        WITH scope AS (
          SELECT
            COALESCE(sk.parent_sku, 'Without Parent') AS key,
            COALESCE(sk.parent_sku, 'Without Parent') AS label,
            MAX(sk.parent_sku) AS parent_sku,
            NULLIF(ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY_AGG(DISTINCT sup.name ORDER BY sup.name), NULL), ', '), '') AS lieferant,
            NULL::text AS product_name,
            MAX(s.order_date)::date::text AS last_sale_date,
            ${SUMMARY_SELECT}
          ${SALES_JOINS}
          ${clause.where}
          GROUP BY COALESCE(sk.parent_sku, 'Without Parent')
        )
        SELECT
          scope.*,
          COALESCE(inv.stock_sellable, 0) AS stock_sellable,
          COALESCE(inv.stock_total, 0) AS stock_total,
          COUNT(*) OVER() AS total_rows
        FROM scope
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(i.sellable_qty), 0) AS stock_sellable,
            COALESCE(SUM(i.sellable_qty + i.unsellable_qty), 0) AS stock_total
          FROM inventory_snapshots i
          JOIN (
            SELECT MAX(snapshot_date) AS snapshot_date
            FROM inventory_snapshots
          ) latest ON latest.snapshot_date = i.snapshot_date
          JOIN skus sk2 ON sk2.sku_code = i.sku_code
          WHERE COALESCE(sk2.parent_sku, 'Without Parent') = scope.key
        ) inv ON TRUE
        ORDER BY scope.units DESC, scope.orders DESC, scope.revenue DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `
      : `
        WITH scope AS (
          SELECT
            s.sku_code AS key,
            s.sku_code AS label,
            MAX(sk.parent_sku) AS parent_sku,
            MAX(sup.name) AS lieferant,
            MAX(COALESCE(sk.title, sk.raw_attributes->>'amaz_name')) AS product_name,
            MAX(s.order_date)::date::text AS last_sale_date,
            ${SUMMARY_SELECT}
          ${SALES_JOINS}
          ${clause.where}
          GROUP BY s.sku_code
        )
        SELECT
          scope.*,
          COALESCE(inv.stock_sellable, 0) AS stock_sellable,
          COALESCE(inv.stock_total, 0) AS stock_total,
          COUNT(*) OVER() AS total_rows
        FROM scope
        LEFT JOIN LATERAL (
          SELECT
            i.sellable_qty AS stock_sellable,
            i.sellable_qty + i.unsellable_qty AS stock_total
          FROM inventory_snapshots i
          JOIN (
            SELECT MAX(snapshot_date) AS snapshot_date
            FROM inventory_snapshots
          ) latest ON latest.snapshot_date = i.snapshot_date
          WHERE i.sku_code = scope.key
          LIMIT 1
        ) inv ON TRUE
        ORDER BY scope.units DESC, scope.orders DESC, scope.revenue DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `;

    const result = await pool.query(sql, [...clause.params, limit, offset]);
    const rows: ScopeRow[] = result.rows.map((row: Record<string, unknown>) => {
      const summary = buildMetricSummary(row);

      return {
        ...summary,
        key: String(row.key ?? ''),
        label: String(row.label ?? ''),
        parentSku: row.parent_sku as string | null,
        lieferant: row.lieferant as string | null,
        productName: row.product_name as string | null,
        stockSellable: Number(row.stock_sellable) || 0,
        stockTotal: Number(row.stock_total) || 0,
        lastSaleDate: row.last_sale_date as string | null,
        hasReturns: summary.refundedUnits > 0 || summary.refunds > 0,
      };
    });

    return {
      rows,
      total: Number(result.rows[0]?.total_rows) || 0,
      limit,
      offset,
    };
  });

  app.get('/api/dashboard/lieferant-series', async (request) => {
    const filters = parseFilterParams(request);
    const clause = buildFilterClause(filters);
    const result = await pool.query<{
      lieferant: string;
      day: string;
      revenue: number;
      units: number;
    }>(`
      SELECT
        COALESCE(sup.name, 'Без поставщика') AS lieferant,
        s.order_date::date::text AS day,
        COALESCE(SUM(s.total_incl_tax), 0) AS revenue,
        COALESCE(SUM(s.qty_ordered), 0) AS units
      ${SALES_JOINS}
      ${clause.where}
      GROUP BY lieferant, day
      ORDER BY lieferant ASC, day ASC
    `, clause.params);

    const minDay = filters.dateFrom ?? result.rows[0]?.day ?? null;
    const maxDay = filters.dateTo ?? result.rows[result.rows.length - 1]?.day ?? null;
    const dateKeys = fillDateGaps([], minDay, maxDay).map((point) => point.date);
    const dayIndex = new Map(dateKeys.map((date, index) => [date, index]));
    const seriesMap = new Map<
      string,
      {
        lieferant: string;
        totalRevenue: number;
        totalUnits: number;
        dailyRevenue: number[];
        dailyUnits: number[];
      }
    >();

    for (const row of result.rows) {
      const index = dayIndex.get(row.day);
      if (index === undefined) {
        continue;
      }

      const current = seriesMap.get(row.lieferant) ?? {
        lieferant: row.lieferant,
        totalRevenue: 0,
        totalUnits: 0,
        dailyRevenue: Array(dateKeys.length).fill(0),
        dailyUnits: Array(dateKeys.length).fill(0),
      };

      const revenue = Number(row.revenue) || 0;
      const units = Number(row.units) || 0;
      current.totalRevenue += revenue;
      current.totalUnits += units;
      current.dailyRevenue[index] += revenue;
      current.dailyUnits[index] += units;
      seriesMap.set(row.lieferant, current);
    }

    return {
      dateKeys,
      series: Array.from(seriesMap.values()),
    };
  });

  app.get('/api/dashboard/sku-summary', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const sku = query.sku?.trim();

    if (!sku) {
      return {
        summary: buildMetricSummary(undefined),
      };
    }

    const result = await pool.query(`
      SELECT ${SUMMARY_SELECT}
      FROM sales s
      WHERE s.sku_code = $1
    `, [sku]);

    return {
      summary: buildMetricSummary(result.rows[0]),
    };
  });
}
