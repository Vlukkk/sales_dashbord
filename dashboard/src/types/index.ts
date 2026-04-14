export interface SaleRecord {
  bestellungNr: string | null;
  status: string | null;
  bestelldatum: string | null;
  artikelposition: string | null;
  kundenEmail: string | null;
  kundenname: string | null;
  kundengruppe: string | null;
  land: string | null;
  region: string | null;
  stadt: string | null;
  postleitzahl: string | null;
  adresse: string | null;
  phone: string | null;
  produktbezeichnung: string | null;
  hersteller: string | null;
  qtyOrdered: number;
  qtyInvoiced: number;
  qtyShipped: number;
  qtyRefunded: number;
  preis: number | null;
  originalpreis: number | null;
  zwischensumme: number | null;
  discounts: number | null;
  mwst: number | null;
  gesamt: number | null;
  totalInclTax: number | null;
  inRechnungGestellt: number | null;
  taxInvoiced: number | null;
  invoicedInclTax: number | null;
  rueckerstattet: number | null;
  taxRefunded: number | null;
  refundedInclTax: number | null;
  totalCost: number | null;
  totalRevenueExclTax: number | null;
  totalRevenue: number | null;
  totalProfit: number | null;
  totalMargin: number | null;
}

export type SaleColumnKey = keyof SaleRecord;

export interface Product {
  sku: string | null;
  sku_vender: string | null;
  purchase_price: number | null;
  amaz_parent_sku: string | null;
  amaz_name: string | null;
  chain_length_google: string | null;
  price: number | null;
  amaz_price: number | null;
  status: string | null;
  amaz_chain_type: string | null;
  chain_metal_type: string | null;
  chain_metal_aloy: string | null;
  chain_type: string | null;
  chain_length: string | null;
  chain_width: string | null;
  product_type: string | null;
  amaz_metal_stamp: string | null;
  lieferant: string | null;
  chain_weight: string | null;
  [key: string]: string | number | null | undefined;
}

export interface CatalogData {
  products: Record<string, Product>;
  parentGroups: Record<string, string[]>;
  lieferanten: string[];
}

export interface InventoryRecord {
  sku: string;
  asin: string | null;
  fulfillmentChannelSku: string | null;
  sellable: number;
  unsellable: number;
  total: number;
}

export interface InventoryData {
  records: Record<string, InventoryRecord>;
  totals: {
    sellable: number;
    unsellable: number;
    total: number;
    skusWithStock: number;
    trackedSkus: number;
  };
}

export interface FilterState {
  bestellungNr: string;
  status: string[];
  channel: string[];
  dateRange: [string, string] | null;
  artikelposition: string[];
  kundengruppe: string[];
  parentSku: string[];
  lieferant: string[];
}

export interface FilterOptions {
  statuses: string[];
  customerGroups: string[];
  channels: string[];
  minDate: string | null;
  maxDate: string | null;
  skuOptions?: string[];
  parentSkuOptions?: Array<{
    value: string;
    count: number;
  }>;
}

export type MetricKey =
  | 'revenue'
  | 'profit'
  | 'orders'
  | 'units'
  | 'refunds'
  | 'margin'
  | 'avgOrder';

export type GroupByKey =
  | 'artikelposition'
  | 'parentSku'
  | 'lieferant'
  | 'channel'
  | 'status'
  | 'kundengruppe';

export interface DashboardSettings {
  groupBy: GroupByKey;
  primaryMetric: MetricKey;
  secondaryMetric: MetricKey;
}

export interface MetricOption {
  value: MetricKey;
  label: string;
  shortLabel: string;
  hint: string;
}

export interface GroupOption {
  value: GroupByKey;
  label: string;
  hint: string;
}

export interface EnrichedSale extends SaleRecord {
  channel: string;
  lieferant: string | null;
  parentSku: string | null;
  productName: string | null;
}

export interface ParsedAmazName {
  fullName: string;
  metalType: string | null;
  metalAlloy: string | null;
  length: string | null;
  width: string | null;
  weight: string | null;
  subType: string | null;
}

export interface DashboardDailyPoint {
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  refundRevenue: number;
}

export interface LieferantSeries {
  lieferant: string;
  totalRevenue: number;
  totalUnits: number;
  dailyRevenue: number[];
  dailyUnits: number[];
}

export interface FbmMarginRow {
  orderKey: string;
  orderNumber: string;
  date: string;
  channel: string;
  saleGross: number;
  saleNet: number;
  refundedGross: number;
  costGross: number | null;
  shippingGross: number;
  costNet: number;
  amazonCommission: number;
  fixedCost: number;
  margin: number;
  marginPercent: number;
  hasBinderMatch: boolean;
  skuCount: number;
  salesLineCount: number;
  invoiceCount: number;
  invoiceNumbers: string;
  invoiceTypes: string;
  productCodes: string;
  descriptions: string;
}

export interface FbmMarginDetailRow {
  rowKey: string;
  orderKey: string;
  orderNumber: string;
  date: string;
  status: string | null;
  channel: string;
  sku: string;
  productName: string | null;
  qtyOrdered: number;
  qtyRefunded: number;
  saleGross: number;
  saleNet: number;
  refundedGross: number;
  orderCostGross: number | null;
  orderShippingGross: number;
  allocatedCostGross: number | null;
  allocatedShippingGross: number;
  amazonCommission: number;
  fixedCost: number;
  margin: number;
  marginPercent: number;
  invoiceCount: number;
  invoiceNumbers: string;
  invoiceTypes: string;
  productCodes: string;
  descriptions: string;
  hasBinderMatch: boolean;
}

export interface FbmMarginSummary {
  totalMargin: number;
  avgMarginPercent: number;
  orderCount: number;
  totalRevenue: number;
  totalCost: number;
  totalCommission: number;
  totalShipping: number;
  unmatchedOrders: number;
}
