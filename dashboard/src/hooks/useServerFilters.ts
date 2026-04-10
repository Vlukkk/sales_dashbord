import { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { FilterOptions, FilterState } from '../types';

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

function buildDefaultDateRange(filterOptions: FilterOptions): [string, string] | null {
  if (!filterOptions.maxDate) {
    return null;
  }

  const latestDate = dayjs(filterOptions.maxDate);
  if (!latestDate.isValid()) {
    return null;
  }

  const anchorMonthEnd = latestDate.isSame(latestDate.endOf('month'), 'day')
    ? latestDate.endOf('month')
    : latestDate.subtract(1, 'month').endOf('month');
  const from = anchorMonthEnd.subtract(2, 'month').startOf('month');
  const to = anchorMonthEnd.endOf('month');

  return [from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD')];
}

export function useServerFilters(filterOptions: FilterOptions) {
  const defaultFilters = useMemo<FilterState>(() => ({
    ...emptyFilters,
    dateRange: buildDefaultDateRange(filterOptions),
  }), [filterOptions]);

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

  return { filters, updateFilter, resetFilters };
}

export function serializeFilters(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.dateRange) {
    params.set('dateFrom', filters.dateRange[0]);
    params.set('dateTo', filters.dateRange[1]);
  }

  if (filters.status.length > 0) {
    params.set('status', filters.status.join(','));
  }

  if (filters.channel.length > 0) {
    params.set('channel', filters.channel.join(','));
  }

  if (filters.kundengruppe.length > 0) {
    params.set('kundengruppe', filters.kundengruppe.join(','));
  }

  if (filters.parentSku.length > 0) {
    params.set('parentSku', filters.parentSku.join(','));
  }

  if (filters.lieferant.length > 0) {
    params.set('lieferant', filters.lieferant.join(','));
  }

  if (filters.artikelposition) {
    params.set('artikelposition', filters.artikelposition);
  }

  if (filters.bestellungNr) {
    params.set('bestellungNr', filters.bestellungNr);
  }

  return params;
}
