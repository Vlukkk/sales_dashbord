import { useEffect, useState, type ReactNode } from 'react';
import { DataContext, emptyData, type DataContextType } from '../context/data-context';
import type { SaleRecord } from '../types';
import { normalizeCatalogData } from '../utils/lieferanten';

function buildFilterOptionsFromSales(sales: SaleRecord[]): DataContextType['filterOptions'] {
  const statuses = new Set<string>();
  const customerGroups = new Set<string>();
  const channels = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const sale of sales) {
    if (sale.status) {
      statuses.add(sale.status);
    }

    if (sale.kundengruppe) {
      customerGroups.add(sale.kundengruppe);
    }

    const rawChannel = sale.kundengruppe?.toLowerCase() ?? '';
    const email = sale.kundenEmail?.toLowerCase() ?? '';
    const channel = rawChannel.includes('retail')
      ? 'Retail'
      : rawChannel.includes('amazon') || email.includes('amazon.')
        ? 'Amazon'
        : 'Direct';
    channels.add(channel);

    const orderDate = sale.bestelldatum?.slice(0, 10) ?? null;
    if (!orderDate) {
      continue;
    }

    if (!minDate || orderDate < minDate) {
      minDate = orderDate;
    }

    if (!maxDate || orderDate > maxDate) {
      maxDate = orderDate;
    }
  }

  return {
    statuses: Array.from(statuses).sort((left, right) => left.localeCompare(right)),
    customerGroups: Array.from(customerGroups).sort((left, right) => left.localeCompare(right)),
    channels: Array.from(channels).sort((left, right) => left.localeCompare(right)),
    minDate,
    maxDate,
  };
}

async function loadStaticData(): Promise<Pick<DataContextType, 'sales' | 'catalog' | 'inventory' | 'filterOptions'>> {
  const [salesResponse, catalogResponse, inventoryResponse] = await Promise.all([
    fetch('/data/sales.json'),
    fetch('/data/products.json'),
    fetch('/data/inventory.json').catch(() => null),
  ]);

  if (!salesResponse.ok || !catalogResponse.ok) {
    throw new Error('Unable to load dashboard data');
  }

  const inventory = inventoryResponse && inventoryResponse.ok
    ? await inventoryResponse.json()
    : emptyData.inventory;

  const [sales, rawCatalog] = await Promise.all([salesResponse.json(), catalogResponse.json()]);
  return {
    sales,
    catalog: normalizeCatalogData(rawCatalog),
    inventory,
    filterOptions: buildFilterOptionsFromSales(sales),
  };
}

async function loadApiData(): Promise<Pick<DataContextType, 'sales' | 'catalog' | 'inventory' | 'filterOptions'>> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const response = await fetch(`${apiBase}/api/dashboard/bootstrap`);

  if (!response.ok) {
    throw new Error('Unable to load dashboard data from API');
  }

  const payload = await response.json();
  return {
    sales: [],
    catalog: normalizeCatalogData(payload.catalog ?? emptyData.catalog),
    inventory: payload.inventory ?? emptyData.inventory,
    filterOptions: payload.filterOptions ?? emptyData.filterOptions,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataContextType>(emptyData);

  useEffect(() => {
    const loadData = import.meta.env.VITE_DATA_SOURCE === 'api'
      ? loadApiData
      : loadStaticData;

    loadData()
      .then(({ sales, catalog, inventory, filterOptions }) => {
        setData({ sales, catalog, inventory, filterOptions, loading: false, error: null });
      })
      .catch((error: Error) => {
        setData({ ...emptyData, loading: false, error: error.message });
      });
  }, []);

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
