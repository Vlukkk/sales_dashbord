import type { SaleColumnKey } from '../types';

export interface SalesColumnDefinition {
  key: SaleColumnKey;
  title: string;
  isMoney?: boolean;
  isQty?: boolean;
  isPercent?: boolean;
}

export const YELLOW_COLUMNS = [
  'bestellungNr',
  'status',
  'bestelldatum',
  'artikelposition',
  'kundengruppe',
  'totalInclTax',
] as const;

export const ALL_SALES_COLUMNS: SalesColumnDefinition[] = [
  { key: 'bestellungNr', title: 'Bestellung #' },
  { key: 'status', title: 'Status' },
  { key: 'bestelldatum', title: 'Bestelldatum' },
  { key: 'artikelposition', title: 'Artikelposition' },
  { key: 'kundenEmail', title: 'Kunden Email' },
  { key: 'kundenname', title: 'Kundenname' },
  { key: 'kundengruppe', title: 'Kundengruppe' },
  { key: 'land', title: 'Land' },
  { key: 'region', title: 'Region' },
  { key: 'stadt', title: 'Stadt' },
  { key: 'postleitzahl', title: 'PLZ' },
  { key: 'adresse', title: 'Adresse' },
  { key: 'phone', title: 'Phone' },
  { key: 'produktbezeichnung', title: 'Produktbezeichnung' },
  { key: 'hersteller', title: 'Hersteller' },
  { key: 'qtyOrdered', title: 'Qty. Ordered', isQty: true },
  { key: 'qtyInvoiced', title: 'Qty. Invoiced', isQty: true },
  { key: 'qtyShipped', title: 'Qty. Shipped', isQty: true },
  { key: 'qtyRefunded', title: 'Qty. Refunded', isQty: true },
  { key: 'preis', title: 'Preis', isMoney: true },
  { key: 'originalpreis', title: 'Originalpreis', isMoney: true },
  { key: 'zwischensumme', title: 'Zwischensumme', isMoney: true },
  { key: 'discounts', title: 'Discounts', isMoney: true },
  { key: 'mwst', title: 'MwSt.', isMoney: true },
  { key: 'gesamt', title: 'Gesamt', isMoney: true },
  { key: 'totalInclTax', title: 'Total Incl. Tax', isMoney: true },
  { key: 'inRechnungGestellt', title: 'In Rechnung gest.', isMoney: true },
  { key: 'taxInvoiced', title: 'Tax Invoiced', isMoney: true },
  { key: 'invoicedInclTax', title: 'Invoiced Incl. Tax', isMoney: true },
  { key: 'rueckerstattet', title: 'Rückerstattet', isMoney: true },
  { key: 'taxRefunded', title: 'Tax Refunded', isMoney: true },
  { key: 'refundedInclTax', title: 'Refunded Incl. Tax', isMoney: true },
  { key: 'totalCost', title: 'Total Cost', isMoney: true },
  { key: 'totalRevenueExclTax', title: 'Revenue (excl.tax)', isMoney: true },
  { key: 'totalRevenue', title: 'Total Revenue', isMoney: true },
  { key: 'totalProfit', title: 'Total Profit', isMoney: true },
  { key: 'totalMargin', title: 'Total Margin', isPercent: true },
];
