import { useCallback, useEffect, useRef, useState } from 'react';
import type { FbmMarginDetailRow, FbmMarginRow, FbmMarginSummary, FilterState } from '../types';
import { serializeFilters } from './useServerFilters';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const EMPTY_SUMMARY: FbmMarginSummary = {
  totalMargin: 0,
  avgMarginPercent: 0,
  orderCount: 0,
  totalRevenue: 0,
  totalCost: 0,
  totalCommission: 0,
  totalShipping: 0,
  unmatchedOrders: 0,
};

interface FbmMarginParams {
  filters: FilterState;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'ASC' | 'DESC';
}

interface FbmMarginState {
  rows: FbmMarginRow[];
  detailRows: FbmMarginDetailRow[];
  total: number;
  summary: FbmMarginSummary;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: FbmMarginState = {
  rows: [],
  detailRows: [],
  total: 0,
  summary: EMPTY_SUMMARY,
  loading: true,
  error: null,
};

export function useFbmMarginData(params: FbmMarginParams) {
  const [state, setState] = useState<FbmMarginState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (p: FbmMarginParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const qs = serializeFilters(p.filters);
      qs.set('page', String(p.page));
      qs.set('pageSize', String(p.pageSize));
      qs.set('sortBy', p.sortBy);
      qs.set('sortDir', p.sortDir);

      const url = `${API_BASE}/api/dashboard/fbm-margin?${qs}`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (controller.signal.aborted) return;

      setState({
        rows: data.rows,
        detailRows: data.detailRows ?? [],
        total: data.total,
        summary: data.summary,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;

      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'FBM margin fetch failed',
      }));
    }
  }, []);

  useEffect(() => {
    void fetchData(params);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData, params.filters, params.page, params.pageSize, params.sortBy, params.sortDir]);

  return state;
}
