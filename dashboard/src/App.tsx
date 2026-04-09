import { useState } from 'react';
import { Spin, Typography } from 'antd';
import DashboardSidebar from './components/DashboardSidebar/DashboardSidebar';
import Overview from './components/Overview/Overview';
import AggregatedTables from './components/AggregatedTables/AggregatedTables';
import SkuInfoCard from './components/SkuInfoCard/SkuInfoCard';
import { useData } from './hooks/useData';
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics';
import { useFilters } from './hooks/useFilters';

export default function App() {
  const { sales, catalog, inventory, loading, error } = useData();
  const { filters, updateFilter, resetFilters, filteredSales } = useFilters(sales, catalog);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const analytics = useDashboardAnalytics({
    sales,
    filteredSales,
    catalog,
    inventory,
    filters,
  });

  if (loading) {
    return (
      <div className="app-state">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-state">
        <Typography.Text type="danger">Ошибка загрузки: {error}</Typography.Text>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <DashboardSidebar
        sales={sales}
        filteredSales={filteredSales}
        catalog={catalog}
        filters={filters}
        onFilterChange={updateFilter}
        onResetFilters={resetFilters}
      />

      <main className="dashboard-main">
        <Overview
          visibleSales={analytics.visibleSales}
          comparisonSales={analytics.comparisonSales}
          summary={analytics.filteredSummary}
          inventorySummary={analytics.inventorySummary}
          filters={filters}
        />

        <AggregatedTables
          visibleSales={analytics.visibleSales}
          inventory={inventory}
          catalog={catalog}
          filters={filters}
          onSelectSku={setSelectedSku}
        />
      </main>

      <SkuInfoCard
        sku={selectedSku}
        catalog={catalog}
        inventory={inventory}
        sales={sales}
        onClose={() => setSelectedSku(null)}
      />
    </div>
  );
}
