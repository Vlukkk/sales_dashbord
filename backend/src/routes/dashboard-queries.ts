import type { FastifyRequest } from 'fastify';

export interface DashboardFilterParams {
  dateFrom: string | null;
  dateTo: string | null;
  status: string[] | null;
  channel: string[] | null;
  kundengruppe: string[] | null;
  parentSku: string[] | null;
  lieferant: string[] | null;
  artikelposition: string[] | null;
  bestellungNr: string | null;
}

function readQueryValue(request: FastifyRequest, key: string): string | undefined {
  const value = (request.query as Record<string, string | string[] | undefined>)[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseArray(value: string | undefined): string[] | null {
  if (!value) {
    return null;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : null;
}

export function parseFilterParams(request: FastifyRequest): DashboardFilterParams {
  return {
    dateFrom: readQueryValue(request, 'dateFrom') ?? null,
    dateTo: readQueryValue(request, 'dateTo') ?? null,
    status: parseArray(readQueryValue(request, 'status')),
    channel: parseArray(readQueryValue(request, 'channel')),
    kundengruppe: parseArray(readQueryValue(request, 'kundengruppe')),
    parentSku: parseArray(readQueryValue(request, 'parentSku')),
    lieferant: parseArray(readQueryValue(request, 'lieferant')),
    artikelposition: parseArray(readQueryValue(request, 'artikelposition')),
    bestellungNr: readQueryValue(request, 'bestellungNr') ?? null,
  };
}

export interface FilterClause {
  where: string;
  params: unknown[];
}

export const SALES_JOINS = `
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
`;

export const INVENTORY_JOINS = `
  FROM inventory_snapshots i
  JOIN (
    SELECT MAX(snapshot_date) AS snapshot_date
    FROM inventory_snapshots
  ) latest ON latest.snapshot_date = i.snapshot_date
  LEFT JOIN skus sk ON sk.sku_code = i.sku_code
  LEFT JOIN LATERAL (
    SELECT supplier_id
    FROM sku_supplier
    WHERE sku_id = sk.id
    ORDER BY is_primary DESC, updated_at DESC, supplier_id ASC
    LIMIT 1
  ) ss ON TRUE
  LEFT JOIN suppliers sup ON sup.id = ss.supplier_id
`;

export function buildFilterClause(filters: DashboardFilterParams, startIndex = 1): FilterClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = startIndex;

  if (filters.dateFrom) {
    conditions.push(`s.order_date >= $${index}::date`);
    params.push(filters.dateFrom);
    index += 1;
  }

  if (filters.dateTo) {
    conditions.push(`s.order_date < ($${index}::date + interval '1 day')`);
    params.push(filters.dateTo);
    index += 1;
  }

  if (filters.status) {
    conditions.push(`s.order_status = ANY($${index}::text[])`);
    params.push(filters.status);
    index += 1;
  }

  if (filters.channel) {
    conditions.push(`s.channel = ANY($${index}::text[])`);
    params.push(filters.channel);
    index += 1;
  }

  if (filters.kundengruppe) {
    conditions.push(`s.customer_group = ANY($${index}::text[])`);
    params.push(filters.kundengruppe);
    index += 1;
  }

  if (filters.parentSku) {
    conditions.push(`sk.parent_sku = ANY($${index}::text[])`);
    params.push(filters.parentSku);
    index += 1;
  }

  if (filters.lieferant) {
    conditions.push(`sup.name = ANY($${index}::text[])`);
    params.push(filters.lieferant);
    index += 1;
  }

  if (filters.artikelposition) {
    conditions.push(`s.sku_code = ANY($${index}::text[])`);
    params.push(filters.artikelposition);
    index += 1;
  }

  if (filters.bestellungNr) {
    conditions.push(`s.order_number ILIKE '%' || $${index} || '%'`);
    params.push(filters.bestellungNr);
    index += 1;
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export function buildInventoryFilterClause(filters: DashboardFilterParams, startIndex = 1): FilterClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = startIndex;

  if (filters.artikelposition) {
    conditions.push(`i.sku_code = ANY($${index}::text[])`);
    params.push(filters.artikelposition);
    index += 1;
  }

  if (filters.parentSku) {
    conditions.push(`sk.parent_sku = ANY($${index}::text[])`);
    params.push(filters.parentSku);
    index += 1;
  }

  if (filters.lieferant) {
    conditions.push(`sup.name = ANY($${index}::text[])`);
    params.push(filters.lieferant);
    index += 1;
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}
