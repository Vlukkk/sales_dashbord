import { useState } from 'react';
import { Spin, Typography } from 'antd';
import DashboardSidebar from './components/DashboardSidebar/DashboardSidebar';
import Overview from './components/Overview/Overview';
import AggregatedTables from './components/AggregatedTables/AggregatedTables';
import SkuInfoCard from './components/SkuInfoCard/SkuInfoCard';
import { useData } from './hooks/useData';
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics';
import { useFilters } from './hooks/useFilters';
import { useServerFilters } from './hooks/useServerFilters';
import { useDashboardData } from './hooks/useDashboardData';

function StaticDashboardApp() {
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

function ApiDashboardApp() {
  const { catalog, inventory, filterOptions, loading, error } = useData();
  const { filters, updateFilter, resetFilters } = useServerFilters(filterOptions);
  const dashboard = useDashboardData(filters);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="app-state">
        <Spin size="large" />
      </div>
    );
  }

  if (error || dashboard.error) {
    return (
      <div className="app-state">
        <Typography.Text type="danger">Ошибка загрузки: {error ?? dashboard.error}</Typography.Text>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <DashboardSidebar
        catalog={catalog}
        filters={filters}
        filterOptions={filterOptions}
        lieferantSeries={dashboard.lieferantSeries}
        onFilterChange={updateFilter}
        onResetFilters={resetFilters}
      />

      <main className="dashboard-main">
        {dashboard.loading && !dashboard.initialized && (
          <div className="card">
            <div className="app-state" style={{ minHeight: 120 }}>
              <Spin size="large" />
            </div>
          </div>
        )}

        <Overview
          mode="api"
          summary={dashboard.summary}
          previousSummary={dashboard.previousSummary}
          inventorySummary={dashboard.inventorySummary}
          filters={filters}
          amazonSeries={dashboard.amazonSeries}
          retailSeries={dashboard.retailSeries}
        />

        <AggregatedTables
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
        onClose={() => setSelectedSku(null)}
      />
    </div>
  );
}

export default function App() {
  return import.meta.env.VITE_DATA_SOURCE === 'api'
    ? <ApiDashboardApp />
    : <StaticDashboardApp />;
}
