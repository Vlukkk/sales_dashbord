import { useState, useMemo, useCallback } from 'react';
import type { FilterState, SaleRecord, CatalogData } from '../types';
import dayjs from 'dayjs';
import { deriveChannel } from '../utils/analytics';

const emptyFilters: FilterState = {
  bestellungNr: '',
  status: [],
  channel: [],
  dateRange: null,
  artikelposition: '',
  kundengruppe: [],
  parentSku: [],
  lieferant: [],
};

function isEmptyFilters(filters: FilterState) {
  return (
    filters.bestellungNr === ''
    && filters.status.length === 0
    && filters.channel.length === 0
    && filters.dateRange === null
    && filters.artikelposition === ''
    && filters.kundengruppe.length === 0
    && filters.parentSku.length === 0
    && filters.lieferant.length === 0
  );
}

function buildDefaultDateRange(sales: SaleRecord[]): [string, string] | null {
  const dates = sales
    .map((sale) => sale.bestelldatum)
    .filter(Boolean)
    .map((date) => dayjs(date))
    .filter((date) => date.isValid());

  if (dates.length === 0) {
    return null;
  }

  const latestDate = dates.reduce((latest, current) => (
    current.isAfter(latest) ? current : latest
  ));
  const anchorMonthEnd = latestDate.isSame(latestDate.endOf('month'), 'day')
    ? latestDate.endOf('month')
    : latestDate.subtract(1, 'month').endOf('month');
  const from = anchorMonthEnd.subtract(2, 'month').startOf('month');
  const to = anchorMonthEnd.endOf('month');

  return [from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD')];
}

function buildInitialFilters(sales: SaleRecord[]): FilterState {
  return {
    ...emptyFilters,
    dateRange: buildDefaultDateRange(sales),
  };
}

export function useFilters(sales: SaleRecord[], catalog: CatalogData) {
  const defaultFilters = useMemo(() => buildInitialFilters(sales), [sales]);
  const [state, setState] = useState<{ filters: FilterState; initialized: boolean }>({
    filters: emptyFilters,
    initialized: false,
  });
  const filters = state.initialized || !isEmptyFilters(state.filters)
    ? state.filters
    : defaultFilters;

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setState((prev) => {
      const baseFilters = prev.initialized || !isEmptyFilters(prev.filters)
        ? prev.filters
        : defaultFilters;

      return {
        initialized: true,
        filters: { ...baseFilters, [key]: value },
      };
    });
  }, [defaultFilters]);

  const resetFilters = useCallback(() => {
    setState({ initialized: true, filters: defaultFilters });
  }, [defaultFilters]);

  const filteredSales = useMemo(() => {
    let result = sales;

    if (filters.bestellungNr) {
      const q = filters.bestellungNr.toLowerCase();
      result = result.filter((s) => s.bestellungNr?.toLowerCase().includes(q));
    }

    if (filters.status.length > 0) {
      result = result.filter((s) => s.status && filters.status.includes(s.status));
    }

    if (filters.channel.length > 0) {
      result = result.filter((sale) => {
        const channel = deriveChannel(sale);
        return filters.channel.includes(channel);
      });
    }

    if (filters.dateRange) {
      const [from, to] = filters.dateRange;
      result = result.filter((s) => {
        if (!s.bestelldatum) return false;
        const d = dayjs(s.bestelldatum);
        return d.isAfter(dayjs(from).subtract(1, 'day')) && d.isBefore(dayjs(to).add(1, 'day'));
      });
    }

    if (filters.artikelposition) {
      const q = filters.artikelposition.toLowerCase();
      result = result.filter((s) => s.artikelposition?.toLowerCase().includes(q));
    }

    if (filters.kundengruppe.length > 0) {
      result = result.filter((s) => s.kundengruppe && filters.kundengruppe.includes(s.kundengruppe));
    }

    if (filters.parentSku.length > 0) {
      const childSkus = new Set<string>();
      for (const parent of filters.parentSku) {
        const children = catalog.parentGroups[parent] || [];
        children.forEach((c) => childSkus.add(c));
      }
      result = result.filter((s) => s.artikelposition && childSkus.has(s.artikelposition));
    }

    if (filters.lieferant.length > 0) {
      const lieferantSkus = new Set<string>();
      for (const [sku, product] of Object.entries(catalog.products)) {
        if (product.lieferant && filters.lieferant.includes(product.lieferant)) {
          lieferantSkus.add(sku);
        }
      }
      result = result.filter((s) => s.artikelposition && lieferantSkus.has(s.artikelposition));
    }

    return result;
  }, [sales, catalog, filters]);

  return { filters, updateFilter, resetFilters, filteredSales };
}
