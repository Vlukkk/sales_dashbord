import { useMemo } from 'react';
import { Button, Checkbox, Collapse, DatePicker, Input, Select } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CatalogData, FilterState, SaleRecord } from '../../types';
import { ALL_SALES_COLUMNS, YELLOW_COLUMNS } from '../../constants/columns';
import { NAV_ITEMS } from '../../constants/dashboard';
import { deriveChannel } from '../../utils/analytics';

const { RangePicker } = DatePicker;

interface Props {
  sales: SaleRecord[];
  catalog: CatalogData;
  filters: FilterState;
  visibleColumns: Set<string>;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
  onColumnsChange: (columns: Set<string>) => void;
}

export default function DashboardSidebar({
  sales,
  catalog,
  filters,
  visibleColumns,
  onFilterChange,
  onResetFilters,
  onColumnsChange,
}: Props) {
  const statuses = useMemo(() => [...new Set(sales.map((sale) => sale.status).filter(Boolean))] as string[], [sales]);
  const groups = useMemo(
    () => [...new Set(sales.map((sale) => sale.kundengruppe).filter(Boolean))] as string[],
    [sales],
  );
  const parentSkus = useMemo(() => Object.keys(catalog.parentGroups).sort(), [catalog]);
  const skuOptions = useMemo(
    () => [...new Set(sales.map((sale) => sale.artikelposition).filter(Boolean))] as string[],
    [sales],
  );
  const channelOptions = useMemo(() => {
    const values = sales.map((sale) => {
      const product = sale.artikelposition ? catalog.products[sale.artikelposition] : null;
      return deriveChannel(sale, product);
    });

    return [...new Set(values)].sort();
  }, [sales, catalog]);

  const extraColumns = ALL_SALES_COLUMNS.filter(
    (column) => !(YELLOW_COLUMNS as readonly string[]).includes(column.key),
  );

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand__eyebrow">Reactive sales cockpit</span>
        <h1>Sales Analytics · Nivo</h1>
        <p>Фильтруете таблицу и сразу видите, как меняется поведение `SKU`, `parent` и поставщиков.</p>
      </div>

      <div className="sidebar-panel">
        <div className="sidebar-section-title">Navigate</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="sidebar-nav__item">
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="sidebar-panel">
        <div className="sidebar-section-title">Filters</div>

        <div className="sidebar-field">
          <div className="sidebar-label">Date Range</div>
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
          <div className="sidebar-label">Status</div>
          <Select
            mode="multiple"
            value={filters.status}
            onChange={(value) => onFilterChange('status', value)}
            options={statuses.map((value) => ({ label: value, value }))}
            placeholder="All statuses"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Sales Channel</div>
          <Select
            mode="multiple"
            value={filters.channel}
            onChange={(value) => onFilterChange('channel', value)}
            options={channelOptions.map((value) => ({ label: value, value }))}
            placeholder="All channels"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Supplier</div>
          <Select
            mode="multiple"
            value={filters.supplier}
            onChange={(value) => onFilterChange('supplier', value)}
            options={catalog.suppliers.map((value) => ({ label: value, value }))}
            placeholder="All suppliers"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Parent SKU</div>
          <Select
            mode="multiple"
            value={filters.parentSku}
            onChange={(value) => onFilterChange('parentSku', value)}
            options={parentSkus.map((value) => ({
              label: `${value} (${catalog.parentGroups[value]?.length ?? 0})`,
              value,
            }))}
            showSearch
            placeholder="All parent groups"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Customer Group</div>
          <Select
            mode="multiple"
            value={filters.kundengruppe}
            onChange={(value) => onFilterChange('kundengruppe', value)}
            options={groups.map((value) => ({ label: value, value }))}
            placeholder="All customer groups"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">SKU Search</div>
          <Select
            showSearch
            value={filters.artikelposition || undefined}
            onChange={(value) => onFilterChange('artikelposition', value || '')}
            options={skuOptions.map((value) => ({ label: value, value }))}
            placeholder="Type seller SKU"
            allowClear
          />
        </div>

        <div className="sidebar-field">
          <div className="sidebar-label">Order Search</div>
          <Input
            value={filters.bestellungNr}
            onChange={(event) => onFilterChange('bestellungNr', event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Order number"
            allowClear
          />
        </div>
      </div>

      <div className="sidebar-panel">
        <div className="sidebar-section-title">Table View</div>
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'cols',
              label: `Extra columns (${Math.max(visibleColumns.size - YELLOW_COLUMNS.length, 0)})`,
              children: (
                <Checkbox.Group
                  value={extraColumns.filter((column) => visibleColumns.has(column.key)).map((column) => column.key)}
                  onChange={(checked) => {
                    const next = new Set<string>(YELLOW_COLUMNS);
                    (checked as string[]).forEach((key) => next.add(key));
                    onColumnsChange(next);
                  }}
                  options={extraColumns.map((column) => ({ label: column.title, value: column.key }))}
                  className="sidebar-column-list"
                />
              ),
            },
          ]}
        />
      </div>

      <Button
        type="default"
        icon={<ReloadOutlined />}
        className="sidebar-reset"
        onClick={onResetFilters}
      >
        Reset Filters
      </Button>
    </aside>
  );
}
