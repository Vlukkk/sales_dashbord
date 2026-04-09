import { useEffect, useState, type ReactNode } from 'react';
import { DataContext, emptyData, type DataContextType } from '../context/data-context';
import { normalizeCatalogData } from '../utils/lieferanten';

async function loadStaticData(): Promise<Pick<DataContextType, 'sales' | 'catalog' | 'inventory'>> {
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
  };
}

async function loadApiData(): Promise<Pick<DataContextType, 'sales' | 'catalog' | 'inventory'>> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const response = await fetch(`${apiBase}/api/dashboard/bootstrap`);

  if (!response.ok) {
    throw new Error('Unable to load dashboard data from API');
  }

  const payload = await response.json();
  return {
    sales: payload.sales ?? [],
    catalog: normalizeCatalogData(payload.catalog ?? emptyData.catalog),
    inventory: payload.inventory ?? emptyData.inventory,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataContextType>(emptyData);

  useEffect(() => {
    const loadData = import.meta.env.VITE_DATA_SOURCE === 'api'
      ? loadApiData
      : loadStaticData;

    loadData()
      .then(({ sales, catalog, inventory }) => {
        setData({ sales, catalog, inventory, loading: false, error: null });
      })
      .catch((error: Error) => {
        setData({ ...emptyData, loading: false, error: error.message });
      });
  }, []);

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
