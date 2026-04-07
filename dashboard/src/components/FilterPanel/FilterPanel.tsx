import { useMemo } from 'react';
import { Select, DatePicker, Input, Button, Collapse, Checkbox } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FilterState, SaleRecord, CatalogData } from '../../types';
import { ALL_SALES_COLUMNS, YELLOW_COLUMNS } from '../../constants/columns';

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

export default function FilterPanel({
  sales,
  catalog,
  filters,
  visibleColumns,
  onFilterChange,
  onResetFilters,
  onColumnsChange,
}: Props) {
  const statuses = useMemo(() => [...new Set(sales.map((s) => s.status).filter(Boolean))] as string[], [sales]);
  const groups = useMemo(() => [...new Set(sales.map((s) => s.kundengruppe).filter(Boolean))] as string[], [sales]);
  const parentSkus = useMemo(() => Object.keys(catalog.parentGroups).sort(), [catalog]);
  const skuOptions = useMemo(
    () => [...new Set(sales.map((s) => s.artikelposition).filter(Boolean))] as string[],
    [sales],
  );

  const extraColumns = ALL_SALES_COLUMNS.filter(
    (c) => !(YELLOW_COLUMNS as readonly string[]).includes(c.key),
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Status</div>
        <Select
          mode="multiple"
          placeholder="Alle Statuswerte"
          style={{ width: '100%' }}
          value={filters.status}
          onChange={(v) => onFilterChange('status', v)}
          options={statuses.map((s) => ({ label: s, value: s }))}
          allowClear
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Zeitraum</div>
        <RangePicker
          style={{ width: '100%' }}
          value={filters.dateRange ? [dayjs(filters.dateRange[0]), dayjs(filters.dateRange[1])] : null}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              onFilterChange('dateRange', [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
            } else {
              onFilterChange('dateRange', null);
            }
          }}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Kundengruppe</div>
        <Select
          mode="multiple"
          placeholder="Alle Gruppen"
          style={{ width: '100%' }}
          value={filters.kundengruppe}
          onChange={(v) => onFilterChange('kundengruppe', v)}
          options={groups.map((g) => ({ label: g, value: g }))}
          allowClear
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Parent SKU</div>
        <Select
          mode="multiple"
          placeholder="Alle Parent SKUs"
          style={{ width: '100%' }}
          value={filters.parentSku}
          onChange={(v) => onFilterChange('parentSku', v)}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
          options={parentSkus.map((p) => ({
            label: `${p} (${catalog.parentGroups[p]?.length || 0})`,
            value: p,
          }))}
          allowClear
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Lieferant</div>
        <Select
          mode="multiple"
          placeholder="Alle Lieferanten"
          style={{ width: '100%' }}
          value={filters.supplier}
          onChange={(v) => onFilterChange('supplier', v)}
          options={catalog.suppliers.map((s) => ({ label: s, value: s }))}
          allowClear
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>SKU Suche</div>
        <Select
          showSearch
          placeholder="SKU eingeben..."
          style={{ width: '100%' }}
          value={filters.artikelposition || undefined}
          onChange={(v) => onFilterChange('artikelposition', v || '')}
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }
          options={skuOptions.map((s) => ({ label: s, value: s }))}
          allowClear
        />
      </div>

      <div>
        <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Bestellung #</div>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Bestellung suchen..."
          value={filters.bestellungNr}
          onChange={(e) => onFilterChange('bestellungNr', e.target.value)}
          allowClear
        />
      </div>

      <Collapse
        size="small"
        items={[
          {
            key: 'cols',
            label: `Spalten (${visibleColumns.size - YELLOW_COLUMNS.length} extra)`,
            children: (
              <Checkbox.Group
                value={extraColumns.filter((c) => visibleColumns.has(c.key)).map((c) => c.key)}
                onChange={(checked) => {
                  const next = new Set<string>(YELLOW_COLUMNS);
                  (checked as string[]).forEach((k) => next.add(k));
                  onColumnsChange(next);
                }}
                options={extraColumns.map((c) => ({ label: c.title, value: c.key }))}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              />
            ),
          },
        ]}
      />

      <Button icon={<ReloadOutlined />} onClick={onResetFilters}>
        Filter zurücksetzen
      </Button>
    </div>
  );
}
