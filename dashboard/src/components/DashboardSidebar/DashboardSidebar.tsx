import { useCallback, useMemo } from 'react';
import { Button, Collapse, DatePicker, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CatalogData, FilterState, SaleRecord } from '../../types';
import { deriveChannel } from '../../utils/analytics';
import SidebarLieferantPanel from './SidebarLieferantPanel';

const { RangePicker } = DatePicker;

interface Props {
  sales: SaleRecord[];
  filteredSales: SaleRecord[];
  catalog: CatalogData;
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
}

export default function DashboardSidebar({
  sales,
  filteredSales,
  catalog,
  filters,
  onFilterChange,
  onResetFilters,
}: Props) {
  const parentSkus = useMemo(() => Object.keys(catalog.parentGroups).sort(), [catalog]);
  const skuOptions = useMemo(
    () => [...new Set(sales.map((sale) => sale.artikelposition).filter(Boolean))] as string[],
    [sales],
  );
  const statuses = useMemo(
    () => [...new Set(sales.map((sale) => sale.status).filter(Boolean))] as string[],
    [sales],
  );
  const groups = useMemo(
    () => [...new Set(sales.map((sale) => sale.kundengruppe).filter(Boolean))] as string[],
    [sales],
  );
  const channelOptions = useMemo(() => {
    const values = sales.map((sale) => deriveChannel(sale));
    return [...new Set(values)].sort();
  }, [sales]);
  const quickYears = useMemo(() => {
    const years = sales
      .map((sale) => sale.bestelldatum?.slice(0, 4))
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const anchorYear = years.length > 0 ? Math.max(...years) : dayjs().year();
    return [anchorYear - 2, anchorYear - 1, anchorYear];
  }, [sales]);
  const handleLieferantToggle = useCallback((lieferant: string) => {
    const nextValues = filters.lieferant.includes(lieferant)
      ? filters.lieferant.filter((value) => value !== lieferant)
      : [...filters.lieferant, lieferant];

    onFilterChange('lieferant', nextValues);
  }, [filters.lieferant, onFilterChange]);
  const isQuickYearActive = useCallback((year: number) => {
    if (!filters.dateRange) {
      return false;
    }

    return (
      filters.dateRange[0] === dayjs().year(year).startOf('year').format('YYYY-MM-DD')
      && filters.dateRange[1] === dayjs().year(year).endOf('year').format('YYYY-MM-DD')
    );
  }, [filters.dateRange]);

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand__eyebrow">Jewelry Sales</span>
        <h1>Аналитика продаж</h1>
      </div>

      <div>
        <div className="sidebar-section-title">Фильтры</div>

        <div className="sidebar-field">
          <div className="sidebar-label">Дата</div>
          <div className="sidebar-year-shortcuts" role="group" aria-label="Быстрый выбор года">
            {quickYears.map((year) => (
              <Button
                key={year}
                size="small"
                type={isQuickYearActive(year) ? 'primary' : 'default'}
                className="sidebar-year-shortcuts__button"
                onClick={() => onFilterChange('dateRange', [
                  dayjs().year(year).startOf('year').format('YYYY-MM-DD'),
                  dayjs().year(year).endOf('year').format('YYYY-MM-DD'),
                ])}
              >
                {String(year).slice(-2)}
              </Button>
            ))}
          </div>
          <RangePicker
            style={{ width: '100%' }}
            value={filters.dateRange ? [dayjs(filters.dateRange[0]), dayjs(filters.dateRange[1])] : null}
            onChange={(dates) => {
              if (dates?.[0] && dates?.[1]) {
                onFilterChange('dateRange', [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                return;
              }
              onFilterChange('dateRange', null);
            }}
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">SKU</div>
          <Select
            showSearch
            allowClear
            value={filters.artikelposition || undefined}
            onChange={(value) => onFilterChange('artikelposition', value || '')}
            options={skuOptions.map((value) => ({ label: value, value }))}
            placeholder="Поиск SKU"
            style={{ width: '100%' }}
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Parent</div>
          <Select
            mode="multiple"
            allowClear
            value={filters.parentSku}
            onChange={(value) => onFilterChange('parentSku', value)}
            options={parentSkus.map((value) => ({
              label: `${value} (${catalog.parentGroups[value]?.length ?? 0})`,
              value,
            }))}
            showSearch
            placeholder="Все Parent SKUs"
            style={{ width: '100%' }}
            maxTagCount="responsive"
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Поставщик</div>
          <Select
            mode="multiple"
            allowClear
            value={filters.lieferant}
            onChange={(value) => onFilterChange('lieferant', value)}
            options={catalog.lieferanten.map((value) => ({ label: value, value }))}
            placeholder="Все поставщики"
            style={{ width: '100%' }}
            maxTagCount="responsive"
          />
        </div>
      </div>

      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'extra',
            label: 'Доп. фильтры',
            children: (
              <>
                <div className="sidebar-field">
                  <div className="sidebar-label">Статус</div>
                  <Select
                    mode="multiple"
                    allowClear
                    value={filters.status}
                    onChange={(value) => onFilterChange('status', value)}
                    options={statuses.map((value) => ({ label: value, value }))}
                    placeholder="Все статусы"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="sidebar-field">
                  <div className="sidebar-label">Канал продаж</div>
                  <Select
                    mode="multiple"
                    allowClear
                    value={filters.channel}
                    onChange={(value) => onFilterChange('channel', value)}
                    options={channelOptions.map((value) => ({ label: value, value }))}
                    placeholder="Все каналы"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="sidebar-field">
                  <div className="sidebar-label">Группа клиентов</div>
                  <Select
                    mode="multiple"
                    allowClear
                    value={filters.kundengruppe}
                    onChange={(value) => onFilterChange('kundengruppe', value)}
                    options={groups.map((value) => ({ label: value, value }))}
                    placeholder="Все группы"
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            ),
          },
        ]}
      />

      <div>
        <div className="sidebar-section-title">Поставщики</div>
        <SidebarLieferantPanel
          sales={filteredSales}
          catalog={catalog}
          dateRange={filters.dateRange}
          activeLieferanten={filters.lieferant}
          onToggleLieferant={handleLieferantToggle}
        />
      </div>

      <Button icon={<ReloadOutlined />} className="sidebar-reset" onClick={onResetFilters}>
        Сбросить фильтры
      </Button>
    </aside>
  );
}
