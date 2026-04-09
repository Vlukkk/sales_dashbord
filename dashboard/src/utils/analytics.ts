import dayjs from 'dayjs';
import type {
  CatalogData,
  EnrichedSale,
  FilterState,
  GroupByKey,
  InventoryData,
  MetricKey,
  Product,
  SaleRecord,
} from '../types';

interface SummaryAccumulator {
  revenue: number;
  profit: number;
  units: number;
  refunds: number;
  refundedUnits: number;
  refundOrders: number;
  rows: number;
  orderIds: Set<string>;
  skuIds: Set<string>;
}

export interface MetricSummary {
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

export interface InventorySummary {
  sellable: number;
  unsellable: number;
  total: number;
  skusWithStock: number;
  lowStockSkus: number;
  trackedSkus: number;
}

export interface GroupBreakdownItem extends MetricSummary {
  key: string;
  label: string;
}

export interface ScopeRow extends MetricSummary {
  key: string;
  label: string;
  parentSku: string | null;
  lieferant: string | null;
  productName: string | null;
  stockSellable: number;
  stockTotal: number;
  lastSaleDate: string | null;
  hasReturns: boolean;
}

export interface DailyTrendSeries {
  from: string;
  to: string;
  series: Array<{
    id: string;
    data: Array<{ x: string; y: number }>;
  }>;
}

function createAccumulator(): SummaryAccumulator {
  return {
    revenue: 0,
    profit: 0,
    units: 0,
    refunds: 0,
    refundedUnits: 0,
    refundOrders: 0,
    rows: 0,
    orderIds: new Set<string>(),
    skuIds: new Set<string>(),
  };
}

export interface PeriodComparison {
  current: EnrichedSale[];
  previous: EnrichedSale[];
  from: string | null;
  to: string | null;
}

function applySale(accumulator: SummaryAccumulator, sale: EnrichedSale) {
  accumulator.revenue += sale.totalInclTax ?? 0;
  accumulator.profit += sale.totalProfit ?? 0;
  accumulator.units += sale.qtyOrdered ?? 0;
  accumulator.refunds += sale.refundedInclTax ?? 0;
  accumulator.refundedUnits += sale.qtyRefunded ?? 0;
  accumulator.rows += 1;

  if ((sale.qtyRefunded ?? 0) > 0 || (sale.refundedInclTax ?? 0) > 0) {
    accumulator.refundOrders += 1;
  }

  if (sale.bestellungNr) {
    accumulator.orderIds.add(sale.bestellungNr);
  }

  if (sale.artikelposition) {
    accumulator.skuIds.add(sale.artikelposition);
  }
}

function finalizeAccumulator(accumulator: SummaryAccumulator): MetricSummary {
  const orders = accumulator.orderIds.size || accumulator.rows;
  const margin = accumulator.revenue > 0 ? (accumulator.profit / accumulator.revenue) * 100 : 0;
  const avgOrder = orders > 0 ? accumulator.revenue / orders : 0;
  const refundRate = accumulator.units > 0 ? (accumulator.refundedUnits / accumulator.units) * 100 : 0;

  return {
    revenue: accumulator.revenue,
    profit: accumulator.profit,
    orders,
    units: accumulator.units,
    refunds: accumulator.refunds,
    refundedUnits: accumulator.refundedUnits,
    refundOrders: accumulator.refundOrders,
    margin,
    avgOrder,
    refundRate,
    activeSkus: accumulator.skuIds.size,
    rows: accumulator.rows,
  };
}

function startAndEndDays(sales: EnrichedSale[]) {
  const dates = sales
    .map((sale) => sale.bestelldatum?.slice(0, 10))
    .filter((value): value is string => Boolean(value))
    .sort();

  const fallback = dayjs().format('YYYY-MM-DD');

  return {
    from: dates[0] ?? fallback,
    to: dates[dates.length - 1] ?? fallback,
  };
}

export function splitSalesCurrentAndPrevious(
  currentSales: EnrichedSale[],
  comparisonSales: EnrichedSale[],
): PeriodComparison {
  const dates = currentSales
    .map((sale) => sale.bestelldatum?.slice(0, 10))
    .filter((value): value is string => Boolean(value))
    .sort();

  if (dates.length === 0) {
    return { current: currentSales, previous: [], from: null, to: null };
  }

  const from = dayjs(dates[0]);
  const to = dayjs(dates[dates.length - 1]);
  const spanDays = to.diff(from, 'day') + 1;
  const previousFrom = from.subtract(spanDays, 'day');
  const previousTo = from.subtract(1, 'day');

  const current: EnrichedSale[] = [];
  const previous: EnrichedSale[] = [];

  for (const sale of comparisonSales) {
    const day = sale.bestelldatum?.slice(0, 10);
    if (!day) {
      continue;
    }

    const date = dayjs(day);
    if (
      (date.isSame(from, 'day') || date.isAfter(from, 'day')) &&
      (date.isSame(to, 'day') || date.isBefore(to, 'day'))
    ) {
      current.push(sale);
      continue;
    }

    if (
      (date.isSame(previousFrom, 'day') || date.isAfter(previousFrom, 'day')) &&
      (date.isSame(previousTo, 'day') || date.isBefore(previousTo, 'day'))
    ) {
      previous.push(sale);
    }
  }

  return {
    current,
    previous,
    from: from.format('YYYY-MM-DD'),
    to: to.format('YYYY-MM-DD'),
  };
}

function ensureDateRange(from: string, to: string) {
  const days: string[] = [];
  let cursor = dayjs(from);
  const end = dayjs(to);

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }

  return days;
}

function productForSale(sale: SaleRecord, catalog: CatalogData): Product | null {
  if (!sale.artikelposition) {
    return null;
  }

  return catalog.products[sale.artikelposition] ?? null;
}

export function deriveChannel(sale: SaleRecord): string {
  const group = sale.kundengruppe?.toLowerCase() ?? '';
  const email = sale.kundenEmail?.toLowerCase() ?? '';

  if (group.includes('retail')) {
    return 'Retail';
  }

  if (group.includes('amazon') || email.includes('amazon.')) {
    return 'Amazon';
  }

  return 'Direct';
}

export function enrichSales(sales: SaleRecord[], catalog: CatalogData): EnrichedSale[] {
  return sales.map((sale) => {
    const product = productForSale(sale, catalog);

    return {
      ...sale,
      channel: deriveChannel(sale),
      lieferant: product?.lieferant ?? null,
      parentSku: product?.amaz_parent_sku ?? null,
      productName: product?.amaz_name ?? sale.produktbezeichnung ?? null,
    };
  });
}

export function summarizeSales(sales: EnrichedSale[]): MetricSummary {
  const accumulator = createAccumulator();

  for (const sale of sales) {
    applySale(accumulator, sale);
  }

  return finalizeAccumulator(accumulator);
}

export function summarizeInventory(sales: EnrichedSale[], inventory: InventoryData): InventorySummary {
  const skus = new Set(
    sales
      .map((sale) => sale.artikelposition)
      .filter((value): value is string => Boolean(value)),
  );

  let sellable = 0;
  let unsellable = 0;
  let lowStockSkus = 0;
  let skusWithStock = 0;

  for (const sku of skus) {
    const record = inventory.records[sku];
    if (!record) {
      continue;
    }

    sellable += record.sellable;
    unsellable += record.unsellable;

    if (record.sellable > 0) {
      skusWithStock += 1;
    }

    if (record.sellable > 0 && record.sellable <= 3) {
      lowStockSkus += 1;
    }
  }

  return {
    sellable,
    unsellable,
    total: sellable + unsellable,
    skusWithStock,
    lowStockSkus,
    trackedSkus: skus.size,
  };
}

function matchesInventoryProductFilters(sku: string, product: Product | null, filters: FilterState) {
  if (filters.artikelposition) {
    const query = filters.artikelposition.toLowerCase();
    if (!sku.toLowerCase().includes(query)) {
      return false;
    }
  }

  if (filters.parentSku.length > 0 && !filters.parentSku.includes(product?.amaz_parent_sku ?? '')) {
    return false;
  }

  if (filters.lieferant.length > 0 && !filters.lieferant.includes(product?.lieferant ?? '')) {
    return false;
  }

  return true;
}

export function summarizeInventoryForFilters(
  catalog: CatalogData,
  inventory: InventoryData,
  filters: FilterState,
): InventorySummary {
  let sellable = 0;
  let unsellable = 0;
  let lowStockSkus = 0;
  let skusWithStock = 0;
  let trackedSkus = 0;

  for (const [sku, record] of Object.entries(inventory.records)) {
    const product = catalog.products[sku] ?? null;
    if (!matchesInventoryProductFilters(sku, product, filters)) {
      continue;
    }

    trackedSkus += 1;
    sellable += record.sellable;
    unsellable += record.unsellable;

    if (record.sellable > 0) {
      skusWithStock += 1;
    }

    if (record.sellable > 0 && record.sellable <= 3) {
      lowStockSkus += 1;
    }
  }

  return {
    sellable,
    unsellable,
    total: sellable + unsellable,
    skusWithStock,
    lowStockSkus,
    trackedSkus,
  };
}

export function getMetricValue(summary: MetricSummary, metric: MetricKey): number {
  switch (metric) {
    case 'revenue':
      return summary.revenue;
    case 'profit':
      return summary.profit;
    case 'orders':
      return summary.orders;
    case 'units':
      return summary.units;
    case 'refunds':
      return summary.refunds;
    case 'margin':
      return summary.margin;
    case 'avgOrder':
      return summary.avgOrder;
  }
}

export function getGroupValue(sale: EnrichedSale, groupBy: GroupByKey): string {
  switch (groupBy) {
    case 'artikelposition':
      return sale.artikelposition ?? 'Unknown SKU';
    case 'parentSku':
      return sale.parentSku ?? 'Without Parent';
    case 'lieferant':
      return sale.lieferant ?? 'Без поставщика';
    case 'channel':
      return sale.channel;
    case 'status':
      return sale.status ?? 'Unknown Status';
    case 'kundengruppe':
      return sale.kundengruppe ?? 'Unknown Group';
  }
}

export function buildGroupBreakdown(
  sales: EnrichedSale[],
  groupBy: GroupByKey,
  metric: MetricKey,
  limit = 8,
): GroupBreakdownItem[] {
  const groups = new Map<string, SummaryAccumulator>();

  for (const sale of sales) {
    const key = getGroupValue(sale, groupBy);
    const accumulator = groups.get(key) ?? createAccumulator();
    applySale(accumulator, sale);
    groups.set(key, accumulator);
  }

  return [...groups.entries()]
    .map(([key, accumulator]) => ({
      key,
      label: key,
      ...finalizeAccumulator(accumulator),
    }))
    .sort((left, right) => getMetricValue(right, metric) - getMetricValue(left, metric))
    .slice(0, limit);
}

function sumInventoryForSkus(skus: Set<string>, inventory: InventoryData) {
  let sellable = 0;
  let total = 0;

  for (const sku of skus) {
    const record = inventory.records[sku];
    if (!record) {
      continue;
    }

    sellable += record.sellable;
    total += record.total;
  }

  return { sellable, total };
}

function formatLieferantLabel(values: Set<string>, fallback: string | null) {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));

  if (sorted.length === 0) {
    return fallback;
  }

  if (sorted.length <= 2) {
    return sorted.join(', ');
  }

  return `${sorted.slice(0, 2).join(', ')} +${sorted.length - 2}`;
}

export function buildScopeRows(
  sales: EnrichedSale[],
  groupBy: GroupByKey,
  inventory: InventoryData,
  limit = 12,
): ScopeRow[] {
  const groups = new Map<
    string,
    SummaryAccumulator & {
      parentSku: string | null;
      lieferant: string | null;
      lieferanten: Set<string>;
      productName: string | null;
      lastSaleDate: string | null;
    }
  >();

  for (const sale of sales) {
    const key = getGroupValue(sale, groupBy);
    const existing = groups.get(key) ?? {
      ...createAccumulator(),
      parentSku: sale.parentSku,
      lieferant: sale.lieferant,
      lieferanten: new Set(sale.lieferant ? [sale.lieferant] : []),
      productName: sale.productName,
      lastSaleDate: sale.bestelldatum,
    };

    applySale(existing, sale);

    if (!existing.parentSku && sale.parentSku) {
      existing.parentSku = sale.parentSku;
    }

    if (!existing.lieferant && sale.lieferant) {
      existing.lieferant = sale.lieferant;
    }

    if (sale.lieferant) {
      existing.lieferanten.add(sale.lieferant);
    }

    if (!existing.productName && sale.productName) {
      existing.productName = sale.productName;
    }

    if (!existing.lastSaleDate || (sale.bestelldatum && sale.bestelldatum > existing.lastSaleDate)) {
      existing.lastSaleDate = sale.bestelldatum ?? existing.lastSaleDate;
    }

    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([key, accumulator]) => {
      const summary = finalizeAccumulator(accumulator);
      const stock = sumInventoryForSkus(accumulator.skuIds, inventory);

      return {
        key,
        label: key,
        parentSku: accumulator.parentSku,
        lieferant: formatLieferantLabel(accumulator.lieferanten, accumulator.lieferant),
        productName: accumulator.productName,
        stockSellable: stock.sellable,
        stockTotal: stock.total,
        lastSaleDate: accumulator.lastSaleDate,
        hasReturns: summary.refundedUnits > 0 || summary.refunds > 0,
        ...summary,
      };
    })
    .sort((left, right) => {
      if (right.units !== left.units) {
        return right.units - left.units;
      }

      if (right.orders !== left.orders) {
        return right.orders - left.orders;
      }

      return right.revenue - left.revenue;
    })
    .slice(0, limit);
}

export function buildDailyMetricSeries(sales: EnrichedSale[], metric: MetricKey): DailyTrendSeries {
  const { from, to } = startAndEndDays(sales);
  const days = ensureDateRange(from, to);
  const perDay = new Map<string, SummaryAccumulator>();

  for (const sale of sales) {
    const day = sale.bestelldatum?.slice(0, 10);
    if (!day) {
      continue;
    }

    const accumulator = perDay.get(day) ?? createAccumulator();
    applySale(accumulator, sale);
    perDay.set(day, accumulator);
  }

  const rawValues = days.map((day) => {
    const summary = finalizeAccumulator(perDay.get(day) ?? createAccumulator());
    return { x: dayjs(day).format('DD MMM'), y: getMetricValue(summary, metric) };
  });

  const rollingValues = rawValues.map((point, index) => {
    const window = rawValues.slice(Math.max(0, index - 4), index + 1);
    const avg = window.reduce((sum, item) => sum + item.y, 0) / window.length;
    return { x: point.x, y: avg };
  });

  return {
    from,
    to,
    series: [
      { id: 'Daily', data: rawValues },
      { id: 'Rolling 5D', data: rollingValues },
    ],
  };
}

export function buildPieData(
  sales: EnrichedSale[],
  groupBy: GroupByKey,
  metric: MetricKey,
  limit = 6,
) {
  const pieMetric = metric === 'margin' || metric === 'avgOrder' ? 'revenue' : metric;
  const items = buildGroupBreakdown(sales, groupBy, pieMetric, limit);

  return items.map((item) => ({
    id: item.label,
    label: item.label,
    value: getMetricValue(item, pieMetric),
  }));
}

export function buildScatterData(
  sales: EnrichedSale[],
  groupBy: GroupByKey,
  primaryMetric: MetricKey,
  secondaryMetric: MetricKey,
  limit = 10,
) {
  return buildGroupBreakdown(sales, groupBy, primaryMetric, limit).map((item) => ({
    id: item.label,
    data: [
      {
        x: getMetricValue(item, primaryMetric),
        y: getMetricValue(item, secondaryMetric),
        group: item.label,
        orders: item.orders,
        revenue: item.revenue,
        profit: item.profit,
        units: item.units,
      },
    ],
  }));
}

export function buildCalendarData(sales: EnrichedSale[]) {
  const { from, to } = startAndEndDays(sales);
  const days = ensureDateRange(from, to);
  const perDay = new Map<string, SummaryAccumulator>();

  for (const sale of sales) {
    const day = sale.bestelldatum?.slice(0, 10);
    if (!day) {
      continue;
    }

    const accumulator = perDay.get(day) ?? createAccumulator();
    applySale(accumulator, sale);
    perDay.set(day, accumulator);
  }

  return {
    from,
    to,
    data: days.map((day) => ({
      day,
      value: finalizeAccumulator(perDay.get(day) ?? createAccumulator()).revenue,
    })),
  };
}

export function getDateWindowLabel(sales: EnrichedSale[]) {
  const dates = sales
    .map((sale) => sale.bestelldatum)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (dates.length === 0) {
    return 'No visible dates';
  }

  const from = dayjs(dates[0]).format('DD MMM YYYY');
  const to = dayjs(dates[dates.length - 1]).format('DD MMM YYYY');

  return from === to ? from : `${from} - ${to}`;
}

export function getBestDayLabel(calendarData: Array<{ day: string; value: number }>) {
  const bestDay = [...calendarData].sort((left, right) => right.value - left.value)[0];

  if (!bestDay) {
    return 'No sales';
  }

  return `${dayjs(bestDay.day).format('DD MMM')} · ${formatMetricValue('revenue', bestDay.value)}`;
}

export function formatMetricValue(metric: MetricKey | 'refundRate', value: number, compact = false) {
  if (metric === 'revenue' || metric === 'profit' || metric === 'refunds' || metric === 'avgOrder') {
    if (compact) {
      return `€${Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1,
        notation: 'compact',
      }).format(value)}`;
    }

    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (metric === 'margin' || metric === 'refundRate') {
    return `${value.toFixed(1)}%`;
  }

  return Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatAxisValue(metric: MetricKey, value: number) {
  if (metric === 'margin') {
    return `${value.toFixed(0)}%`;
  }

  if (metric === 'revenue' || metric === 'profit' || metric === 'refunds' || metric === 'avgOrder') {
    return `€${Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
      notation: 'compact',
    }).format(value)}`;
  }

  return Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value);
}
