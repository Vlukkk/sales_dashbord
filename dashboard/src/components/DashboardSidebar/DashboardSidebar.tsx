import { useMemo } from 'react';
import { Button, Collapse, DatePicker, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CatalogData, FilterState, SaleRecord } from '../../types';
import { deriveChannel } from '../../utils/analytics';

const { RangePicker } = DatePicker;

interface Props {
  sales: SaleRecord[];
  catalog: CatalogData;
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
}

export default function DashboardSidebar({
  sales,
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
    const values = sales.map((sale) => {
      const product = sale.artikelposition ? catalog.products[sale.artikelposition] : null;
      return deriveChannel(sale, product);
    });
    return [...new Set(values)].sort();
  }, [sales, catalog]);

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand__eyebrow">Jewelry Sales</span>
        <h1>Аналитика продаж</h1>
        <p>Фильтруйте срез — графики и таблицы обновляются автоматически.</p>
      </div>

      <div>
        <div className="sidebar-section-title">Фильтры</div>

        <div className="sidebar-field">
          <div className="sidebar-label">Дата</div>
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
            value={filters.supplier}
            onChange={(value) => onFilterChange('supplier', value)}
            options={catalog.suppliers.map((value) => ({ label: value, value }))}
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

      <Button icon={<ReloadOutlined />} className="sidebar-reset" onClick={onResetFilters}>
        Сбросить фильтры
      </Button>
    </aside>
  );
}
