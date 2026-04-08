import { createContext } from 'react';
import type { CatalogData, InventoryData, SaleRecord } from '../types';

export interface DataContextType {
  sales: SaleRecord[];
  catalog: CatalogData;
  inventory: InventoryData;
  loading: boolean;
  error: string | null;
}

export const emptyData: DataContextType = {
  sales: [],
  catalog: { products: {}, parentGroups: {}, lieferanten: [] },
  inventory: {
    records: {},
    totals: { sellable: 0, unsellable: 0, total: 0, skusWithStock: 0, trackedSkus: 0 },
  },
  loading: true,
  error: null,
};

export const DataContext = createContext<DataContextType>(emptyData);
