import { useEffect, useState, type ReactNode } from 'react';
import { DataContext, emptyData, type DataContextType } from '../context/data-context';

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataContextType>(emptyData);

  useEffect(() => {
    Promise.all([
      fetch('/data/sales.json'),
      fetch('/data/products.json'),
      fetch('/data/inventory.json').catch(() => null),
    ])
      .then(async ([salesResponse, catalogResponse, inventoryResponse]) => {
        if (!salesResponse.ok || !catalogResponse.ok) {
          throw new Error('Unable to load dashboard data');
        }

        const inventory = inventoryResponse && inventoryResponse.ok
          ? await inventoryResponse.json()
          : emptyData.inventory;

        const [sales, catalog] = await Promise.all([salesResponse.json(), catalogResponse.json()]);
        setData({ sales, catalog, inventory, loading: false, error: null });
      })
      .catch((error: Error) => {
        setData({ ...emptyData, loading: false, error: error.message });
      });
  }, []);

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}
