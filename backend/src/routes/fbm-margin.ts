import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { parseFilterParams, type DashboardFilterParams } from './dashboard-queries.js';

interface FbmMarginQuery {
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDir?: string;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  orderNumber: 'order_number',
  date: 'order_date',
  channel: 'channel',
  saleGross: 'sale_gross',
  costGross: 'cost_gross',
  margin: 'margin',
  marginPercent: 'margin_percent',
  amazonCommission: 'amazon_commission',
};

function buildOrderKeyExpr(column: string) {
  return `COALESCE(NULLIF(UPPER(SUBSTRING(TRIM(${column}) FROM '(B[0-9]+)')), ''), NULLIF(UPPER(TRIM(${column})), ''))`;
}

function buildCommissionExpr(saleGrossExpr: string) {
  return `
    CASE
      WHEN ${saleGrossExpr} <= 250 THEN ${saleGrossExpr} * 0.20
      ELSE 250.0 * 0.20 + (${saleGrossExpr} - 250.0) * 0.05
    END
  `;
}

function buildSalesFilterClause(filters: DashboardFilterParams, startIndex = 1) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = startIndex;

  if (filters.dateFrom) {
    conditions.push(`s.order_date >= $${idx}::date`);
    values.push(filters.dateFrom);
    idx += 1;
  }
  if (filters.dateTo) {
    conditions.push(`s.order_date < ($${idx}::date + interval '1 day')`);
    values.push(filters.dateTo);
    idx += 1;
  }
  if (filters.status) {
    conditions.push(`s.order_status = ANY($${idx}::text[])`);
    values.push(filters.status);
    idx += 1;
  }
  if (filters.channel) {
    conditions.push(`COALESCE(NULLIF(TRIM(s.channel), ''), 'Direct') = ANY($${idx}::text[])`);
    values.push(filters.channel);
    idx += 1;
  }
  if (filters.kundengruppe) {
    conditions.push(`s.customer_group = ANY($${idx}::text[])`);
    values.push(filters.kundengruppe);
    idx += 1;
  }
  if (filters.parentSku) {
    conditions.push(`sk.parent_sku = ANY($${idx}::text[])`);
    values.push(filters.parentSku);
    idx += 1;
  }
  if (filters.lieferant) {
    conditions.push(`sup.name = ANY($${idx}::text[])`);
    values.push(filters.lieferant);
    idx += 1;
  }
  if (filters.artikelposition) {
    conditions.push(`s.sku_code = ANY($${idx}::text[])`);
    values.push(filters.artikelposition);
    idx += 1;
  }
  if (filters.bestellungNr?.trim()) {
    conditions.push(`(
      ${buildOrderKeyExpr('s.order_number')} ILIKE '%' || UPPER($${idx}) || '%'
      OR s.order_number ILIKE '%' || $${idx} || '%'
    )`);
    values.push(filters.bestellungNr.trim());
    idx += 1;
  }

  return {
    where: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
    values,
  };
}

function buildFbmMarginQuery(params: FbmMarginQuery, filters: DashboardFilterParams) {
  const { where: salesWhere, values } = buildSalesFilterClause(filters);

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(params.pageSize ?? '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  const sortCol = ALLOWED_SORT_COLUMNS[params.sortBy ?? ''] ?? 'order_date';
  const sortDir = params.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const salesOrderKeyExpr = buildOrderKeyExpr('s.order_number');
  const binderOrderKeyExpr = buildOrderKeyExpr('bi.order_number');
  const orderCommissionExpr = buildCommissionExpr('os.sale_gross');
  const detailCommissionExpr = buildCommissionExpr('po.sale_gross');

  const baseCTE = `
    WITH sales_base AS (
      SELECT
        s.id,
        ${salesOrderKeyExpr} AS order_key,
        NULLIF(TRIM(s.order_number), '') AS raw_order_number,
        s.order_date::date::text AS order_date,
        COALESCE(NULLIF(TRIM(s.channel), ''), 'Direct') AS channel,
        NULLIF(TRIM(s.order_status), '') AS order_status,
        s.sku_code,
        COALESCE(
          NULLIF(TRIM(sk.title), ''),
          NULLIF(TRIM(sk.raw_attributes->>'amaz_name'), ''),
          NULLIF(TRIM(s.raw_record->>'produktbezeichnung'), ''),
          s.sku_code
        ) AS product_name,
        COALESCE(s.qty_ordered, 0) AS qty_ordered,
        COALESCE(s.qty_refunded, 0) AS qty_refunded,
        COALESCE(s.total_incl_tax, 0)::numeric AS sale_gross,
        COALESCE(s.total_incl_tax, 0)::numeric / 1.19 AS sale_net_raw,
        COALESCE(s.refunded_incl_tax, 0)::numeric AS refunded_gross
      FROM sales s
      LEFT JOIN skus sk ON sk.id = s.sku_id
      LEFT JOIN LATERAL (
        SELECT supplier_id
        FROM sku_supplier
        WHERE sku_id = sk.id
        ORDER BY is_primary DESC, updated_at DESC, supplier_id ASC
        LIMIT 1
      ) ss ON TRUE
      LEFT JOIN suppliers sup ON sup.id = ss.supplier_id
      WHERE ${salesOrderKeyExpr} IS NOT NULL
        AND ${salesOrderKeyExpr} LIKE 'B%'
        ${salesWhere}
    ),
    binder_base AS (
      SELECT
        ${binderOrderKeyExpr} AS order_key,
        NULLIF(TRIM(bi.order_number), '') AS raw_order_number,
        COALESCE(NULLIF(TRIM(bi.invoice_type), ''), 'Unknown') AS invoice_type,
        NULLIF(TRIM(bi.invoice_number), '') AS invoice_number,
        bi.invoice_date::text AS invoice_date,
        NULLIF(TRIM(bi.description), '') AS description,
        NULLIF(TRIM(bi.product_codes), '') AS product_codes,
        COALESCE(bi.total_amount, 0)::numeric AS total_amount,
        COALESCE(bi.shipping_cost, 0)::numeric AS shipping_cost
      FROM binder_invoices bi
      WHERE ${binderOrderKeyExpr} IS NOT NULL
        AND ${binderOrderKeyExpr} LIKE 'B%'
    ),
    binder_agg AS (
      SELECT
        bb.order_key,
        COALESCE(
          MIN(bb.raw_order_number) FILTER (WHERE bb.raw_order_number IS NOT NULL),
          bb.order_key
        ) AS binder_order_number,
        ROUND(SUM(CASE
          WHEN LOWER(bb.invoice_type) = 'gutschrift' THEN -bb.total_amount
          ELSE bb.total_amount
        END), 2) AS cost_gross,
        ROUND(SUM(CASE
          WHEN LOWER(bb.invoice_type) = 'gutschrift' THEN -bb.shipping_cost
          ELSE bb.shipping_cost
        END), 2) AS shipping_gross,
        COUNT(*) AS invoice_count,
        COALESCE(
          ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY_AGG(DISTINCT bb.invoice_number ORDER BY bb.invoice_number), NULL), ', '),
          ''
        ) AS invoice_numbers,
        COALESCE(
          ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY_AGG(DISTINCT bb.invoice_type ORDER BY bb.invoice_type), NULL), ', '),
          ''
        ) AS invoice_types,
        COALESCE(
          ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY_AGG(DISTINCT bb.product_codes ORDER BY bb.product_codes), NULL), ' | '),
          ''
        ) AS product_codes,
        COALESCE(
          ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY_AGG(DISTINCT bb.description ORDER BY bb.description), NULL), ' | '),
          ''
        ) AS descriptions
      FROM binder_base bb
      GROUP BY bb.order_key
    ),
    order_sales AS (
      SELECT
        sb.order_key,
        COALESCE(
          MIN(sb.raw_order_number) FILTER (WHERE sb.raw_order_number IS NOT NULL),
          sb.order_key
        ) AS order_number,
        MIN(sb.order_date) AS order_date,
        COALESCE(MAX(sb.channel) FILTER (WHERE sb.channel IS NOT NULL), 'Direct') AS channel,
        SUM(sb.sale_gross) AS sale_gross,
        SUM(sb.sale_net_raw) AS sale_net_raw,
        SUM(sb.refunded_gross) AS refunded_gross,
        COUNT(*) AS sales_line_count,
        COUNT(DISTINCT sb.sku_code) AS sku_count
      FROM sales_base sb
      GROUP BY sb.order_key
    ),
    margin_rows AS (
      SELECT
        os.order_key,
        COALESCE(os.order_number, ba.binder_order_number, os.order_key) AS order_number,
        os.order_date,
        os.channel,
        ROUND(os.sale_gross, 2) AS sale_gross,
        ROUND(os.sale_net_raw, 2) AS sale_net,
        ROUND(os.refunded_gross, 2) AS refunded_gross,
        CASE WHEN ba.cost_gross IS NOT NULL THEN ROUND(ba.cost_gross, 2) ELSE NULL END AS cost_gross,
        ROUND(COALESCE(ba.shipping_gross, 0), 2) AS shipping_gross,
        ROUND(COALESCE(ba.cost_gross, 0) / 1.19, 2) AS cost_net,
        ROUND(CASE
          WHEN os.channel = 'Amazon' THEN ${orderCommissionExpr}
          ELSE 0
        END, 2) AS amazon_commission,
        10.0 AS fixed_cost,
        ROUND(
          os.sale_net_raw
          - COALESCE(ba.cost_gross, 0) / 1.19
          - CASE
              WHEN os.channel = 'Amazon' THEN ${orderCommissionExpr}
              ELSE 0
            END
          - 10.0
        , 2) AS margin,
        CASE
          WHEN os.sale_net_raw > 0 THEN ROUND(
            (
              os.sale_net_raw
              - COALESCE(ba.cost_gross, 0) / 1.19
              - CASE
                  WHEN os.channel = 'Amazon' THEN ${orderCommissionExpr}
                  ELSE 0
                END
              - 10.0
            ) / os.sale_net_raw * 100
          , 1)
          ELSE 0
        END AS margin_percent,
        ba.cost_gross IS NOT NULL AS has_binder_match,
        os.sku_count,
        os.sales_line_count,
        COALESCE(ba.invoice_count, 0) AS invoice_count,
        COALESCE(ba.invoice_numbers, '') AS invoice_numbers,
        COALESCE(ba.invoice_types, '') AS invoice_types,
        COALESCE(ba.product_codes, '') AS product_codes,
        COALESCE(ba.descriptions, '') AS descriptions
      FROM order_sales os
      LEFT JOIN binder_agg ba ON ba.order_key = os.order_key
    )
  `;

  const orderedRows = `
    SELECT *
    FROM margin_rows
    ORDER BY ${sortCol} ${sortDir} NULLS LAST
  `;

  const dataQuery = `
    ${baseCTE}
    ${orderedRows}
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const detailQuery = `
    ${baseCTE},
    paged_orders AS (
      ${orderedRows}
      LIMIT ${pageSize} OFFSET ${offset}
    )
    SELECT
      sb.id::text AS row_key,
      po.order_key,
      po.order_number,
      sb.order_date,
      sb.order_status,
      sb.channel,
      sb.sku_code,
      sb.product_name,
      sb.qty_ordered,
      sb.qty_refunded,
      ROUND(sb.sale_gross, 2) AS sale_gross,
      ROUND(sb.sale_net_raw, 2) AS sale_net,
      ROUND(sb.refunded_gross, 2) AS refunded_gross,
      po.cost_gross AS order_cost_gross,
      po.shipping_gross AS order_shipping_gross,
      CASE
        WHEN po.sale_gross > 0 AND po.cost_gross IS NOT NULL
          THEN ROUND(po.cost_gross * sb.sale_gross / po.sale_gross, 2)
        ELSE NULL
      END AS allocated_cost_gross,
      CASE
        WHEN po.sale_gross > 0 THEN ROUND(po.shipping_gross * sb.sale_gross / po.sale_gross, 2)
        ELSE 0
      END AS allocated_shipping_gross,
      CASE
        WHEN sb.channel = 'Amazon' AND po.sale_gross > 0
          THEN ROUND((${detailCommissionExpr}) * sb.sale_gross / po.sale_gross, 2)
        ELSE 0
      END AS amazon_commission,
      CASE
        WHEN po.sale_gross > 0 THEN ROUND(10.0 * sb.sale_gross / po.sale_gross, 2)
        ELSE 0
      END AS fixed_cost,
      ROUND(
        sb.sale_net_raw
        - COALESCE(po.cost_gross * sb.sale_gross / NULLIF(po.sale_gross, 0) / 1.19, 0)
        - CASE
            WHEN sb.channel = 'Amazon' AND po.sale_gross > 0
              THEN (${detailCommissionExpr}) * sb.sale_gross / po.sale_gross
            ELSE 0
          END
        - CASE
            WHEN po.sale_gross > 0 THEN 10.0 * sb.sale_gross / po.sale_gross
            ELSE 0
          END
      , 2) AS margin,
      CASE
        WHEN sb.sale_net_raw > 0 THEN ROUND(
          (
            sb.sale_net_raw
            - COALESCE(po.cost_gross * sb.sale_gross / NULLIF(po.sale_gross, 0) / 1.19, 0)
            - CASE
                WHEN sb.channel = 'Amazon' AND po.sale_gross > 0
                  THEN (${detailCommissionExpr}) * sb.sale_gross / po.sale_gross
                ELSE 0
              END
            - CASE
                WHEN po.sale_gross > 0 THEN 10.0 * sb.sale_gross / po.sale_gross
                ELSE 0
              END
          ) / sb.sale_net_raw * 100
        , 1)
        ELSE 0
      END AS margin_percent,
      po.invoice_count,
      po.invoice_numbers,
      po.invoice_types,
      po.product_codes,
      po.descriptions,
      po.has_binder_match
    FROM paged_orders po
    JOIN sales_base sb ON sb.order_key = po.order_key
    ORDER BY sb.order_date DESC NULLS LAST, po.order_number DESC, sb.sku_code ASC, sb.id ASC
  `;

  const summaryQuery = `
    ${baseCTE}
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(margin), 0) AS total_margin,
      CASE WHEN SUM(sale_net) > 0
        THEN ROUND(SUM(margin) / SUM(sale_net) * 100, 1)
        ELSE 0
      END AS avg_margin_percent,
      COALESCE(SUM(sale_net), 0) AS total_revenue,
      COALESCE(SUM(cost_net), 0) AS total_cost,
      COALESCE(SUM(shipping_gross), 0) AS total_shipping,
      COALESCE(SUM(amazon_commission), 0) AS total_commission,
      COUNT(*) FILTER (WHERE NOT has_binder_match) AS unmatched_orders
    FROM margin_rows
  `;

  const countQuery = `
    ${baseCTE}
    SELECT COUNT(*) AS total FROM margin_rows
  `;

  return {
    dataQuery,
    detailQuery,
    summaryQuery,
    countQuery,
    values,
  };
}

export async function registerFbmMarginRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/fbm-margin', async (request: FastifyRequest) => {
    const params = request.query as FbmMarginQuery;
    const filters = parseFilterParams(request);
    const { dataQuery, detailQuery, summaryQuery, countQuery, values } = buildFbmMarginQuery(params, filters);

    const [dataResult, detailResult, summaryResult, countResult] = await Promise.all([
      pool.query(dataQuery, values),
      pool.query(detailQuery, values),
      pool.query(summaryQuery, values),
      pool.query(countQuery, values),
    ]);

    const summary = summaryResult.rows[0];
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    return {
      rows: dataResult.rows.map((row) => ({
        orderKey: row.order_key,
        orderNumber: row.order_key ?? row.order_number,
        date: row.order_date,
        channel: row.channel,
        saleGross: parseFloat(row.sale_gross ?? 0),
        saleNet: parseFloat(row.sale_net ?? 0),
        refundedGross: parseFloat(row.refunded_gross ?? 0),
        costGross: row.cost_gross != null ? parseFloat(row.cost_gross) : null,
        shippingGross: parseFloat(row.shipping_gross ?? 0),
        costNet: parseFloat(row.cost_net ?? 0),
        amazonCommission: parseFloat(row.amazon_commission ?? 0),
        fixedCost: parseFloat(row.fixed_cost ?? 0),
        margin: parseFloat(row.margin ?? 0),
        marginPercent: parseFloat(row.margin_percent ?? 0),
        hasBinderMatch: Boolean(row.has_binder_match),
        skuCount: parseInt(row.sku_count ?? '0', 10),
        salesLineCount: parseInt(row.sales_line_count ?? '0', 10),
        invoiceCount: parseInt(row.invoice_count ?? '0', 10),
        invoiceNumbers: String(row.invoice_numbers ?? ''),
        invoiceTypes: String(row.invoice_types ?? ''),
        productCodes: String(row.product_codes ?? ''),
        descriptions: String(row.descriptions ?? ''),
      })),
      detailRows: detailResult.rows.map((row) => ({
        rowKey: String(row.row_key),
        orderKey: String(row.order_key ?? ''),
        orderNumber: String(row.order_key ?? row.order_number ?? ''),
        date: row.order_date,
        status: row.order_status,
        channel: row.channel,
        sku: row.sku_code,
        productName: row.product_name,
        qtyOrdered: parseInt(row.qty_ordered ?? '0', 10),
        qtyRefunded: parseInt(row.qty_refunded ?? '0', 10),
        saleGross: parseFloat(row.sale_gross ?? 0),
        saleNet: parseFloat(row.sale_net ?? 0),
        refundedGross: parseFloat(row.refunded_gross ?? 0),
        orderCostGross: row.order_cost_gross != null ? parseFloat(row.order_cost_gross) : null,
        orderShippingGross: parseFloat(row.order_shipping_gross ?? 0),
        allocatedCostGross: row.allocated_cost_gross != null ? parseFloat(row.allocated_cost_gross) : null,
        allocatedShippingGross: parseFloat(row.allocated_shipping_gross ?? 0),
        amazonCommission: parseFloat(row.amazon_commission ?? 0),
        fixedCost: parseFloat(row.fixed_cost ?? 0),
        margin: parseFloat(row.margin ?? 0),
        marginPercent: parseFloat(row.margin_percent ?? 0),
        invoiceCount: parseInt(row.invoice_count ?? '0', 10),
        invoiceNumbers: String(row.invoice_numbers ?? ''),
        invoiceTypes: String(row.invoice_types ?? ''),
        productCodes: String(row.product_codes ?? ''),
        descriptions: String(row.descriptions ?? ''),
        hasBinderMatch: Boolean(row.has_binder_match),
      })),
      total,
      summary: {
        totalMargin: parseFloat(summary.total_margin ?? 0),
        avgMarginPercent: parseFloat(summary.avg_margin_percent ?? 0),
        orderCount: parseInt(summary.order_count ?? '0', 10),
        totalRevenue: parseFloat(summary.total_revenue ?? 0),
        totalCost: parseFloat(summary.total_cost ?? 0),
        totalShipping: parseFloat(summary.total_shipping ?? 0),
        totalCommission: parseFloat(summary.total_commission ?? 0),
        unmatchedOrders: parseInt(summary.unmatched_orders ?? '0', 10),
      },
    };
  });
}
