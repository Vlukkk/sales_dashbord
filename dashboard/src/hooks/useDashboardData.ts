import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardDailyPoint, FilterState, LieferantSeries } from '../types';
import type { InventorySummary, MetricSummary } from '../utils/analytics';
import { serializeFilters } from './useServerFilters';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const EMPTY_SUMMARY: MetricSummary = {
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
  activeSkus: 0,
  rows: 0,
};

const EMPTY_INVENTORY_SUMMARY: InventorySummary = {
  sellable: 0,
  unsellable: 0,
  total: 0,
  skusWithStock: 0,
  lowStockSkus: 0,
  trackedSkus: 0,
};

interface ChartSeriesData {
  points: DashboardDailyPoint[];
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  from: string | null;
  to: string | null;
}

interface DashboardOverviewResponse {
  current: MetricSummary;
  previous: MetricSummary | null;
  inventorySummary: InventorySummary;
  amazonSeries: ChartSeriesData;
  retailSeries: ChartSeriesData;
}

interface DashboardDataState {
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  inventorySummary: InventorySummary;
  amazonSeries: ChartSeriesData;
  retailSeries: ChartSeriesData;
  lieferantSeries: LieferantSeries[];
  lieferantDateKeys: string[];
  loading: boolean;
  lieferantLoading: boolean;
  initialized: boolean;
  error: string | null;
}

const EMPTY_CHART_SERIES: ChartSeriesData = {
  points: [],
  summary: EMPTY_SUMMARY,
  previousSummary: null,
  from: null,
  to: null,
};

const EMPTY_STATE: DashboardDataState = {
  summary: EMPTY_SUMMARY,
  previousSummary: null,
  inventorySummary: EMPTY_INVENTORY_SUMMARY,
  amazonSeries: EMPTY_CHART_SERIES,
  retailSeries: EMPTY_CHART_SERIES,
  lieferantSeries: [],
  lieferantDateKeys: [],
  loading: true,
  lieferantLoading: true,
  initialized: false,
  error: null,
};

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export function useDashboardData(filters: FilterState) {
  const [state, setState] = useState<DashboardDataState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async (currentFilters: FilterState) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, lieferantLoading: true, error: null }));

    try {
      const params = serializeFilters(currentFilters);
      const queryString = params.toString();
      const prefix = queryString ? `?${queryString}&` : '?';
      const base = `${API_BASE}/api/dashboard`;

      const lieferantPromise = fetchJson<{ series: LieferantSeries[]; dateKeys: string[] }>(
        `${base}/lieferant-series${queryString ? `?${queryString}` : ''}`,
        controller.signal,
      )
        .then((lieferantRes) => {
          if (controller.signal.aborted) {
            return;
          }

          setState((prev) => ({
            ...prev,
            lieferantSeries: lieferantRes.series,
            lieferantDateKeys: lieferantRes.dateKeys,
            lieferantLoading: false,
          }));
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }

          console.error('Lieferant series fetch failed:', error);
          setState((prev) => ({
            ...prev,
            lieferantSeries: [],
            lieferantDateKeys: [],
            lieferantLoading: false,
          }));
        });

      const overviewRes = await fetchJson<DashboardOverviewResponse>(
        `${base}/overview${prefix}withComparison=true`,
        controller.signal,
      );

      if (controller.signal.aborted) {
        return;
      }

      setState((prev) => ({
        ...prev,
        summary: overviewRes.current,
        previousSummary: overviewRes.previous,
        inventorySummary: overviewRes.inventorySummary,
        amazonSeries: overviewRes.amazonSeries,
        retailSeries: overviewRes.retailSeries,
        loading: false,
        initialized: true,
        error: null,
      }));

      void lieferantPromise;
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        lieferantLoading: false,
        initialized: prev.initialized,
        error: error instanceof Error ? error.message : 'Dashboard data fetch failed',
      }));
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const hasTextFilter = Boolean(filters.bestellungNr);
    timerRef.current = setTimeout(() => {
      void fetchAll(filters);
    }, hasTextFilter ? 300 : 50);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [fetchAll, filters]);

  return state;
}
