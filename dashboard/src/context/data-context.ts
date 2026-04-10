import { createContext } from 'react';
import type { CatalogData, FilterOptions, InventoryData, SaleRecord } from '../types';

export interface DataContextType {
  sales: SaleRecord[];
  catalog: CatalogData;
  inventory: InventoryData;
  filterOptions: FilterOptions;
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
  filterOptions: {
    statuses: [],
    customerGroups: [],
    channels: [],
    minDate: null,
    maxDate: null,
  },
  loading: true,
  error: null,
};

export const DataContext = createContext<DataContextType>(emptyData);
