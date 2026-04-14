import { useMemo } from 'react';
import dayjs from 'dayjs';
import type {
  CatalogData,
  EnrichedSale,
  FilterState,
  InventoryData,
  InventoryRecord,
  Product,
  SaleRecord,
} from '../types';
import {
  buildScopeRows,
  enrichSales,
  getDateWindowLabel,
  summarizeInventoryForFilters,
  summarizeSales,
} from '../utils/analytics';

type FocusMode = 'sku' | 'parent' | 'lieferant' | 'overview';

interface UseDashboardAnalyticsArgs {
  sales: SaleRecord[];
  filteredSales: SaleRecord[];
  catalog: CatalogData;
  inventory: InventoryData;
  filters: FilterState;
}

interface MatchOptions {
  ignoreDate?: boolean;
  ignoreSku?: boolean;
}

function matchesFilters(sale: EnrichedSale, filters: FilterState, options: MatchOptions = {}) {
  if (filters.bestellungNr) {
    const query = filters.bestellungNr.toLowerCase();
    if (!sale.bestellungNr?.toLowerCase().includes(query)) {
      return false;
    }
  }

  if (filters.status.length > 0 && (!sale.status || !filters.status.includes(sale.status))) {
    return false;
  }

  if (filters.channel.length > 0 && !filters.channel.includes(sale.channel)) {
    return false;
  }

  if (!options.ignoreDate && filters.dateRange) {
    const [from, to] = filters.dateRange;
    if (!sale.bestelldatum) {
      return false;
    }

    const date = dayjs(sale.bestelldatum);
    if (!date.isAfter(dayjs(from).subtract(1, 'day')) || !date.isBefore(dayjs(to).add(1, 'day'))) {
      return false;
    }
  }

  if (!options.ignoreSku && filters.artikelposition.length > 0 && (!sale.artikelposition || !filters.artikelposition.includes(sale.artikelposition))) {
    return false;
  }

  if (filters.kundengruppe.length > 0 && (!sale.kundengruppe || !filters.kundengruppe.includes(sale.kundengruppe))) {
    return false;
  }

  if (filters.parentSku.length > 0 && (!sale.parentSku || !filters.parentSku.includes(sale.parentSku))) {
    return false;
  }

  if (filters.lieferant.length > 0 && (!sale.lieferant || !filters.lieferant.includes(sale.lieferant))) {
    return false;
  }

  return true;
}

function buildActiveChips(filters: FilterState, dateWindowLabel: string) {
  const chips = [`Period: ${dateWindowLabel}`];

  if (filters.status.length > 0) {
    chips.push(`Status: ${filters.status.join(', ')}`);
  }

  if (filters.channel.length > 0) {
    chips.push(`Channel: ${filters.channel.join(', ')}`);
  }

  if (filters.lieferant.length > 0) {
    chips.push(`Lieferant: ${filters.lieferant.join(', ')}`);
  }

  if (filters.parentSku.length > 0) {
    chips.push(`Parent: ${filters.parentSku.join(', ')}`);
  }

  if (filters.artikelposition.length > 0) {
    chips.push(`SKU: ${filters.artikelposition.join(', ')}`);
  }

  return chips;
}

function focusMeta(mode: FocusMode, sku: string | null, parentSku: string | null, lieferant: string | null) {
  if (mode === 'sku') {
    return {
      title: sku ?? 'SKU lens',
      description: 'Сейчас в центре только эта позиция: продажи, возвраты, FBA и недавние заказы.',
      boardTitle: 'Selected SKU',
      secondaryTitle: 'Parent context',
    };
  }

  if (mode === 'parent') {
    return {
      title: parentSku ?? 'Parent lens',
      description: 'Показаны только проданные child SKU внутри этого parent за текущий период.',
      boardTitle: 'Sold child SKU',
      secondaryTitle: 'Return and stock pressure',
    };
  }

  if (mode === 'lieferant') {
    return {
      title: lieferant ?? 'Lieferant',
      description: 'Какие SKU реально купили у выбранного поставщика и появились ли по ним возвраты.',
      boardTitle: 'SKU поставщика',
      secondaryTitle: 'Return and stock pressure',
    };
  }

  return {
    title: 'Current slice',
    description: 'Без общего BI-шумa: текущий срез собран вокруг parent и SKU, чтобы быстрее выйти на проблемные позиции.',
    boardTitle: 'Parent groups in focus',
    secondaryTitle: 'Return and stock pressure',
  };
}

export function useDashboardAnalytics({
  sales,
  filteredSales,
  catalog,
  inventory,
  filters,
}: UseDashboardAnalyticsArgs) {
  const allSales = useMemo(() => enrichSales(sales, catalog), [sales, catalog]);
  const visibleSales = useMemo(() => enrichSales(filteredSales, catalog), [filteredSales, catalog]);
  const comparisonSales = useMemo(
    () => allSales.filter((sale) => matchesFilters(sale, filters, { ignoreDate: true })),
    [allSales, filters],
  );

  const filteredSummary = useMemo(() => summarizeSales(visibleSales), [visibleSales]);
  const inventorySummary = useMemo(
    () => summarizeInventoryForFilters(catalog, inventory, filters),
    [catalog, inventory, filters],
  );
  const dateWindowLabel = useMemo(() => getDateWindowLabel(visibleSales), [visibleSales]);

  const selectedSku = filters.artikelposition.length === 1 ? filters.artikelposition[0] : null;
  const selectedParentSku = filters.parentSku.length === 1 ? filters.parentSku[0] : null;
  const selectedLieferant = filters.lieferant.length === 1 ? filters.lieferant[0] : null;

  const focusMode: FocusMode = selectedSku
    ? 'sku'
    : selectedParentSku
      ? 'parent'
      : selectedLieferant
        ? 'lieferant'
        : 'overview';

  const primaryRows = useMemo(() => {
    switch (focusMode) {
      case 'sku':
        return buildScopeRows(visibleSales, 'artikelposition', inventory, 1);
      case 'parent':
      case 'lieferant':
        return buildScopeRows(visibleSales, 'artikelposition', inventory, 24);
      case 'overview':
        return buildScopeRows(visibleSales, 'parentSku', inventory, 18);
    }
  }, [focusMode, inventory, visibleSales]);

  const skuRows = useMemo(() => buildScopeRows(visibleSales, 'artikelposition', inventory, 80), [inventory, visibleSales]);

  const selectedProduct: Product | null = selectedSku ? catalog.products[selectedSku] ?? null : null;
  const selectedInventory: InventoryRecord | null = selectedSku ? inventory.records[selectedSku] ?? null : null;

  const parentContextRows = useMemo(() => {
    if (!selectedSku || !selectedProduct?.amaz_parent_sku) {
      return [];
    }

    return buildScopeRows(
      allSales.filter((sale) => {
        if (!matchesFilters(sale, filters, { ignoreSku: true })) {
          return false;
        }

        return sale.parentSku === selectedProduct.amaz_parent_sku;
      }),
      'artikelposition',
      inventory,
      24,
    );
  }, [allSales, filters, inventory, selectedProduct, selectedSku]);

  const recentOrders = useMemo(() => {
    return [...visibleSales]
      .sort((left, right) => {
        const leftDate = left.bestelldatum ?? '';
        const rightDate = right.bestelldatum ?? '';
        return rightDate.localeCompare(leftDate);
      })
      .slice(0, 8);
  }, [visibleSales]);

  const returnSignals = useMemo(() => {
    return [...skuRows]
      .filter((row) => row.hasReturns)
      .sort((left, right) => {
        if (right.refundRate !== left.refundRate) {
          return right.refundRate - left.refundRate;
        }

        return right.refundedUnits - left.refundedUnits;
      })
      .slice(0, 6);
  }, [skuRows]);

  const stockSignals = useMemo(() => {
    return [...skuRows]
      .filter((row) => row.units > 0)
      .sort((left, right) => {
        if (left.stockSellable !== right.stockSellable) {
          return left.stockSellable - right.stockSellable;
        }

        return right.units - left.units;
      })
      .slice(0, 6);
  }, [skuRows]);

  const meta = focusMeta(focusMode, selectedSku, selectedParentSku, selectedLieferant);
  const activeChips = useMemo(() => buildActiveChips(filters, dateWindowLabel), [dateWindowLabel, filters]);

  return {
    visibleSales,
    comparisonSales,
    filteredSummary,
    inventorySummary,
    dateWindowLabel,
    focusMode,
    focusTitle: meta.title,
    focusDescription: meta.description,
    boardTitle: meta.boardTitle,
    secondaryTitle: meta.secondaryTitle,
    activeChips,
    primaryRows,
    skuRows,
    parentContextRows,
    recentOrders,
    returnSignals,
    stockSignals,
    selectedProduct,
    selectedInventory,
  };
}
