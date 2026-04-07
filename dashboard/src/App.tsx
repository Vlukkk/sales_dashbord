import { useState } from 'react';
import { Spin, Typography } from 'antd';
import DashboardSidebar from './components/DashboardSidebar/DashboardSidebar';
import SelectionWorkbench from './components/SelectionWorkbench/SelectionWorkbench';
import CompactHero from './components/CompactHero/CompactHero';
import SalesTable from './components/SalesTable/SalesTable';
import SkuInfoCard from './components/SkuInfoCard/SkuInfoCard';
import { YELLOW_COLUMNS } from './constants/columns';
import { useData } from './hooks/useData';
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics';
import { useFilters } from './hooks/useFilters';

export default function App() {
  const { sales, catalog, inventory, loading, error } = useData();
  const { filters, updateFilter, resetFilters, filteredSales } = useFilters(sales, catalog);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(YELLOW_COLUMNS));
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
        <Typography.Text type="danger">Fehler beim Laden: {error}</Typography.Text>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <DashboardSidebar
        sales={sales}
        catalog={catalog}
        filters={filters}
        visibleColumns={visibleColumns}
        onFilterChange={updateFilter}
        onResetFilters={resetFilters}
        onColumnsChange={setVisibleColumns}
      />

      <main className="dashboard-main">
        <CompactHero
          filteredSales={filteredSales}
          catalog={catalog}
          summary={analytics.filteredSummary}
          inventorySummary={analytics.inventorySummary}
          dateWindowLabel={analytics.dateWindowLabel}
        />

        <section id="table" className="table-card">
          <div className="table-card__header">
            <div>
              <span className="table-card__eyebrow">Row-level detail</span>
              <h3>Filtered sales table</h3>
            </div>
            <span className="table-card__meta">Компактная выборка · клик по строке открывает карточку SKU</span>
          </div>

          <SalesTable
            data={filteredSales}
            visibleColumns={visibleColumns}
            onRowClick={setSelectedSku}
          />
        </section>

        <SelectionWorkbench
          focusMode={analytics.focusMode}
          focusTitle={analytics.focusTitle}
          focusDescription={analytics.focusDescription}
          boardTitle={analytics.boardTitle}
          secondaryTitle={analytics.secondaryTitle}
          activeChips={analytics.activeChips}
          summary={analytics.filteredSummary}
          inventorySummary={analytics.inventorySummary}
          primaryRows={analytics.primaryRows}
          parentContextRows={analytics.parentContextRows}
          recentOrders={analytics.recentOrders}
          returnSignals={analytics.returnSignals}
          stockSignals={analytics.stockSignals}
          selectedProduct={analytics.selectedProduct}
          selectedInventory={analytics.selectedInventory}
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
