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
    skuOptions: string[];
    parentSkuOptions: Array<{
      value: string;
      count: number;
    }>;
  };
}

interface SkuDetailPayload {
  product: Record<string, unknown> | null;
  inventory: {
    sku: string;
    asin: string | null;
    fulfillmentChannelSku: string | null;
    sellable: number;
    unsellable: number;
    total: number;
  } | null;
  summary: MetricSummary;
  siblings: Array<{
    sku: string;
    name: string | null;
    length: string | null;
  }>;
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

interface ChartSeriesPayload {
  points: DailyPoint[];
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  from: string | null;
  to: string | null;
}

interface DashboardOverviewPayload {
  current: MetricSummary;
  previous: MetricSummary | null;
  inventorySummary: InventorySummary;
  amazonSeries: ChartSeriesPayload;
  retailSeries: ChartSeriesPayload;
}

type ScopeGroupBy = 'artikelposition' | 'parentSku';

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

function hasSaleOnlyFilters(filters: DashboardFilterParams) {
  return Boolean(
    filters.bestellungNr
    || (filters.status && filters.status.length > 0)
    || (filters.channel && filters.channel.length > 0)
    || (filters.kundengruppe && filters.kundengruppe.length > 0),
  );
}

function formatLieferantLabel(values: string[]) {
  const sorted = [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length <= 2) {
    return sorted.join(', ');
  }

  return `${sorted.slice(0, 2).join(', ')} +${sorted.length - 2}`;
}

function sortScopeRows(rows: ScopeRow[]) {
  return [...rows].sort((left, right) => {
    if (right.units !== left.units) {
      return right.units - left.units;
    }

    if (right.orders !== left.orders) {
      return right.orders - left.orders;
    }

    return right.revenue - left.revenue;
  });
}

async function fetchInventoryOnlyScopeRows(filters: DashboardFilterParams, groupBy: ScopeGroupBy): Promise<ScopeRow[]> {
  if (hasSaleOnlyFilters(filters)) {
    return [];
  }

  const clause = buildInventoryFilterClause(filters);

  if (groupBy === 'parentSku') {
    const result = await pool.query<{
      key: string;
      parent_sku: string | null;
      lieferanten: string[] | null;
      stock_sellable: number;
      stock_total: number;
      active_skus: number;
    }>(`
      SELECT
        COALESCE(sk.parent_sku, 'Without Parent') AS key,
        MAX(sk.parent_sku) AS parent_sku,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT sup.name ORDER BY sup.name), NULL) AS lieferanten,
        COALESCE(SUM(i.sellable_qty), 0) AS stock_sellable,
        COALESCE(SUM(i.sellable_qty + i.unsellable_qty), 0) AS stock_total,
        COUNT(*) AS active_skus
      ${INVENTORY_JOINS}
      ${clause.where ? `${clause.where} AND i.sellable_qty > 0` : 'WHERE i.sellable_qty > 0'}
      GROUP BY COALESCE(sk.parent_sku, 'Without Parent')
    `, clause.params);

    return result.rows.map((row) => ({
      key: row.key,
      label: row.key,
      revenue: 0,
      profit: 0,
      orders: 0,
      units: 0,
      refunds: 0,
      refundedUnits: 0,
      refundOrders: 0,
      margin: 0,
      avgOrder: 0,
      refundRate: 0,
      activeSkus: Number(row.active_skus) || 0,
      rows: 0,
      parentSku: row.parent_sku,
      lieferant: formatLieferantLabel(row.lieferanten ?? []),
      productName: null,
      stockSellable: Number(row.stock_sellable) || 0,
      stockTotal: Number(row.stock_total) || 0,
      lastSaleDate: null,
      hasReturns: false,
    }));
  }

  const result = await pool.query<{
    key: string;
    parent_sku: string | null;
    lieferant: string | null;
    product_name: string | null;
    stock_sellable: number;
    stock_total: number;
  }>(`
    SELECT
      i.sku_code AS key,
      MAX(sk.parent_sku) AS parent_sku,
      MAX(sup.name) AS lieferant,
      MAX(COALESCE(sk.title, sk.raw_attributes->>'amaz_name')) AS product_name,
      MAX(i.sellable_qty) AS stock_sellable,
      MAX(i.sellable_qty + i.unsellable_qty) AS stock_total
    ${INVENTORY_JOINS}
    ${clause.where ? `${clause.where} AND i.sellable_qty > 0` : 'WHERE i.sellable_qty > 0'}
    GROUP BY i.sku_code
  `, clause.params);

  return result.rows.map((row) => ({
    key: row.key,
    label: row.key,
    revenue: 0,
    profit: 0,
    orders: 0,
    units: 0,
    refunds: 0,
    refundedUnits: 0,
    refundOrders: 0,
    margin: 0,
    avgOrder: 0,
    refundRate: 0,
    activeSkus: 1,
    rows: 0,
    parentSku: row.parent_sku,
    lieferant: row.lieferant,
    productName: row.product_name,
    stockSellable: Number(row.stock_sellable) || 0,
    stockTotal: Number(row.stock_total) || 0,
    lastSaleDate: null,
    hasReturns: false,
  }));
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

async function buildSummaryPayload(filters: DashboardFilterParams, withComparison: boolean) {
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
}

async function buildChartSeriesPayload(
  filters: DashboardFilterParams,
  withComparison: boolean,
  chartChannel?: string,
): Promise<ChartSeriesPayload> {
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
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/bootstrap', async (): Promise<DashboardBootstrapPayload> => {
    const [supplierResult, skuOptionsResult, parentOptionsResult, inventoryTotalsResult, filterOptionsResult] = await Promise.all([
      pool.query<{
        name: string;
      }>(`
        SELECT name
        FROM suppliers
        ORDER BY name ASC
      `),
      pool.query<{
        sku_code: string;
      }>(`
        SELECT
          sk.sku_code
        FROM skus sk
        ORDER BY sk.sku_code ASC
      `),
      pool.query<{
        parent_sku: string;
        sku_count: number;
      }>(`
        SELECT
          sk.parent_sku,
          COUNT(*) AS sku_count
        FROM skus sk
        WHERE sk.parent_sku IS NOT NULL
        GROUP BY sk.parent_sku
        ORDER BY sk.parent_sku ASC
      `),
      pool.query<{
        sellable: number;
        unsellable: number;
        skus_with_stock: number;
        tracked_skus: number;
      }>(`
        SELECT
          COALESCE(SUM(i.sellable_qty), 0) AS sellable,
          COALESCE(SUM(i.unsellable_qty), 0) AS unsellable,
          COUNT(*) FILTER (WHERE i.sellable_qty > 0) AS skus_with_stock,
          COUNT(*) AS tracked_skus
        ${INVENTORY_JOINS}
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

    const filterOptions = filterOptionsResult.rows[0];
    const inventoryTotals = inventoryTotalsResult.rows[0];

    return {
      catalog: {
        products: {},
        parentGroups: {},
        lieferanten: supplierResult.rows.map((row) => row.name),
      },
      inventory: {
        records: {},
        totals: {
          sellable: Number(inventoryTotals?.sellable) || 0,
          unsellable: Number(inventoryTotals?.unsellable) || 0,
          total: (Number(inventoryTotals?.sellable) || 0) + (Number(inventoryTotals?.unsellable) || 0),
          skusWithStock: Number(inventoryTotals?.skus_with_stock) || 0,
          trackedSkus: Number(inventoryTotals?.tracked_skus) || 0,
        },
      },
      filterOptions: {
        statuses: [...(filterOptions?.statuses ?? [])].sort((left, right) => left.localeCompare(right)),
        customerGroups: [...(filterOptions?.customer_groups ?? [])].sort((left, right) => left.localeCompare(right)),
        channels: [...(filterOptions?.channels ?? [])].sort((left, right) => left.localeCompare(right)),
        minDate: filterOptions?.min_date ?? null,
        maxDate: filterOptions?.max_date ?? null,
        skuOptions: skuOptionsResult.rows.map((row) => row.sku_code),
        parentSkuOptions: parentOptionsResult.rows.map((row) => ({
          value: row.parent_sku,
          count: Number(row.sku_count) || 0,
        })),
      },
    };
  });

  app.get('/api/dashboard/sku-detail', async (request): Promise<SkuDetailPayload> => {
    const query = request.query as Record<string, string | undefined>;
    const sku = query.sku?.trim();

    if (!sku) {
      return {
        product: null,
        inventory: null,
        summary: buildMetricSummary(undefined),
        siblings: [],
      };
    }

    const [productResult, inventoryResult, summaryResult] = await Promise.all([
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
        WHERE sk.sku_code = $1
        LIMIT 1
      `, [sku]),
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
        WHERE i.sku_code = $1
        LIMIT 1
      `, [sku]),
      pool.query(`
        SELECT ${SUMMARY_SELECT}
        FROM sales s
        WHERE s.sku_code = $1
      `, [sku]),
    ]);

    const productRow = productResult.rows[0];
    const inventoryRow = inventoryResult.rows[0];
    const raw = productRow?.raw_attributes ?? {};
    const product = productRow
      ? {
        ...raw,
        sku: String(raw.sku ?? productRow.sku_code),
        amaz_parent_sku: productRow.parent_sku ?? raw.amaz_parent_sku ?? null,
        lieferant: productRow.supplier_name ?? raw.lieferant ?? null,
      }
      : null;

    const siblings = productRow?.parent_sku
      ? await pool.query<{
        sku_code: string;
        raw_attributes: Record<string, unknown> | null;
      }>(`
        SELECT
          sk.sku_code,
          sk.raw_attributes
        FROM skus sk
        WHERE sk.parent_sku = $1
          AND sk.sku_code <> $2
        ORDER BY sk.sku_code ASC
      `, [productRow.parent_sku, sku])
      : null;

    return {
      product,
      inventory: inventoryRow
        ? {
          sku: inventoryRow.sku_code,
          asin: inventoryRow.asin,
          fulfillmentChannelSku: inventoryRow.fulfillment_channel_sku,
          sellable: inventoryRow.sellable_qty,
          unsellable: inventoryRow.unsellable_qty,
          total: inventoryRow.sellable_qty + inventoryRow.unsellable_qty,
        }
        : null,
      summary: buildMetricSummary(summaryResult.rows[0]),
      siblings: siblings?.rows.map((row) => ({
        sku: row.sku_code,
        name: String(row.raw_attributes?.amaz_name ?? row.sku_code),
        length: typeof row.raw_attributes?.chain_length === 'string' ? row.raw_attributes.chain_length : null,
      })) ?? [],
    };
  });

  app.get('/api/dashboard/summary', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const withComparison = query.withComparison === 'true' || query.withComparison === '1';
    return buildSummaryPayload(filters, withComparison);
  });

  app.get('/api/dashboard/overview', async (request): Promise<DashboardOverviewPayload> => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const withComparison = query.withComparison === 'true' || query.withComparison === '1';

    const [summary, amazonSeries, retailSeries] = await Promise.all([
      buildSummaryPayload(filters, withComparison),
      buildChartSeriesPayload(filters, withComparison, 'Amazon'),
      buildChartSeriesPayload(filters, withComparison, 'Retail'),
    ]);

    return {
      ...summary,
      amazonSeries,
      retailSeries,
    };
  });

  app.get('/api/dashboard/daily-series', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const chartChannel = query.chartChannel;
    const withComparison = query.withComparison === 'true' || query.withComparison === '1';
    return buildChartSeriesPayload(filters, withComparison, chartChannel);
  });

  app.get('/api/dashboard/scope-rows', async (request) => {
    const filters = parseFilterParams(request);
    const query = request.query as Record<string, string | undefined>;
    const groupBy = query.groupBy === 'parentSku' ? 'parentSku' : 'artikelposition';
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 5000);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const clause = buildFilterClause(filters);
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
          COALESCE(inv.stock_total, 0) AS stock_total
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
          COALESCE(inv.stock_total, 0) AS stock_total
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
      `;

    const [result, inventoryOnlyRows] = await Promise.all([
      pool.query(sql, clause.params),
      fetchInventoryOnlyScopeRows(filters, groupBy),
    ]);

    const salesRows: ScopeRow[] = result.rows.map((row: Record<string, unknown>) => {
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

    const knownKeys = new Set(salesRows.map((row) => row.key));
    const rows = sortScopeRows([
      ...salesRows,
      ...inventoryOnlyRows.filter((row) => !knownKeys.has(row.key)),
    ]);

    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
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
