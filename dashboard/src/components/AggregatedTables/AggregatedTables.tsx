import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CatalogData, EnrichedSale, FilterState, InventoryData, Product } from '../../types';
import { buildScopeRows, type ScopeRow } from '../../utils/analytics';
import { downloadCsv, downloadExcelWorkbook, type ExportColumn } from '../../utils/tableExport';
import { serializeFilters } from '../../hooks/useServerFilters';

interface Props {
  inventory: InventoryData;
  catalog: CatalogData;
  filters: FilterState;
  visibleSales?: EnrichedSale[];
  skuRows?: ScopeRow[];
  parentRows?: ScopeRow[];
  enabled?: boolean;
  onSelectSku: (sku: string) => void;
}

type ScopeGroupBy = 'artikelposition' | 'parentSku';

interface TableState {
  rows: ScopeRow[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
}

type TableSetter = (value: TableState | ((prev: TableState) => TableState)) => void;

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const INITIAL_TABLE_STATE: TableState = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 10,
  loading: true,
};

const fmtNum = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);
const fmtMoney = (v: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v);

const EXPORT_COLUMNS: ExportColumn<ScopeRow>[] = [
  { key: 'label', header: 'Позиция', type: 'string', width: 120, value: (row) => row.label },
  { key: 'lieferant', header: 'Поставщик', type: 'string', width: 140, value: (row) => row.lieferant ?? 'Без поставщика' },
  { key: 'units', header: 'Продано', type: 'integer', width: 70, value: (row) => row.units },
  { key: 'refundedUnits', header: 'Возвраты', type: 'integer', width: 70, value: (row) => row.refundedUnits },
  { key: 'refundRate', header: '% возвр.', type: 'percent', width: 70, value: (row) => row.refundRate },
  { key: 'revenue', header: 'Сумма продаж', type: 'currency', width: 90, value: (row) => row.revenue },
  { key: 'stockSellable', header: 'FBA остаток', type: 'integer', width: 80, value: (row) => row.stockSellable },
];

function makeColumns(labelTitle: string): ColumnsType<ScopeRow> {
  return [
    { title: labelTitle, dataIndex: 'label', key: 'label', render: (v: string) => <strong>{v}</strong> },
    {
      title: 'Поставщик',
      dataIndex: 'lieferant',
      key: 'lieferant',
      sorter: (a, b) => (a.lieferant ?? '').localeCompare(b.lieferant ?? ''),
      render: (value: string | null) => value ?? 'Без поставщика',
      ellipsis: true,
    },
    {
      title: 'Продано',
      dataIndex: 'units',
      key: 'units',
      align: 'right',
      sorter: (a, b) => a.units - b.units,
      render: (v: number) => <span className="cell-num">{fmtNum(v)}</span>,
    },
    {
      title: 'Возвраты',
      dataIndex: 'refundedUnits',
      key: 'refundedUnits',
      align: 'right',
      sorter: (a, b) => a.refundedUnits - b.refundedUnits,
      render: (v: number) => <span className="cell-num">{fmtNum(v)}</span>,
    },
    {
      title: '% возвр.',
      dataIndex: 'refundRate',
      key: 'refundRate',
      align: 'right',
      sorter: (a, b) => a.refundRate - b.refundRate,
      render: (v: number) => (
        <span className={'cell-num' + (v >= 10 ? ' cell-warn' : '')}>{v.toFixed(1)}%</span>
      ),
    },
    {
      title: 'Сумма продаж',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (v: number) => <span className="cell-num">{fmtMoney(v)}</span>,
    },
    {
      title: 'FBA остаток',
      dataIndex: 'stockSellable',
      key: 'stockSellable',
      align: 'right',
      sorter: (a, b) => a.stockSellable - b.stockSellable,
      render: (v: number) => <span className="cell-num">{fmtNum(v)}</span>,
    },
  ];
}

function buildFilterSummary(filters: FilterState) {
  const parts: string[] = [];

  if (filters.dateRange) {
    parts.push(`Дата: ${filters.dateRange[0]}..${filters.dateRange[1]}`);
  }
  if (filters.artikelposition) {
    parts.push(`SKU: ${filters.artikelposition}`);
  }
  if (filters.parentSku.length > 0) {
    parts.push(`Parent: ${filters.parentSku.join(', ')}`);
  }
  if (filters.lieferant.length > 0) {
    parts.push(`Поставщик: ${filters.lieferant.join(', ')}`);
  }
  if (filters.status.length > 0) {
    parts.push(`Статус: ${filters.status.join(', ')}`);
  }
  if (filters.channel.length > 0) {
    parts.push(`Канал: ${filters.channel.join(', ')}`);
  }
  if (filters.kundengruppe.length > 0) {
    parts.push(`Группа: ${filters.kundengruppe.join(', ')}`);
  }
  if (filters.bestellungNr.trim()) {
    parts.push(`Заказ: ${filters.bestellungNr.trim()}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Без дополнительных фильтров';
}

function hasSaleOnlyFilters(filters: FilterState) {
  return (
    filters.bestellungNr.trim().length > 0 ||
    filters.status.length > 0 ||
    filters.channel.length > 0 ||
    filters.kundengruppe.length > 0
  );
}

function matchesProductFilters(sku: string, product: Product | null, filters: FilterState) {
  if (filters.artikelposition) {
    const query = filters.artikelposition.toLowerCase();
    if (!sku.toLowerCase().includes(query)) {
      return false;
    }
  }

  if (filters.parentSku.length > 0 && !filters.parentSku.includes(product?.amaz_parent_sku ?? '')) {
    return false;
  }

  if (filters.lieferant.length > 0 && !filters.lieferant.includes(product?.lieferant ?? '')) {
    return false;
  }

  return true;
}

function formatLieferantValues(values: Set<string>, fallback: string | null) {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));

  if (sorted.length === 0) {
    return fallback;
  }

  if (sorted.length <= 2) {
    return sorted.join(', ');
  }

  return `${sorted.slice(0, 2).join(', ')} +${sorted.length - 2}`;
}

function sumInventoryForSkus(skus: string[], inventory: InventoryData) {
  return skus.reduce(
    (acc, sku) => {
      const record = inventory.records[sku];
      if (!record) {
        return acc;
      }

      return {
        sellable: acc.sellable + record.sellable,
        total: acc.total + record.total,
      };
    },
    { sellable: 0, total: 0 },
  );
}

function withFullParentInventory(rows: ScopeRow[], catalog: CatalogData, inventory: InventoryData) {
  return rows.map((row) => {
    const parentSkus = catalog.parentGroups[row.key];
    if (!parentSkus) {
      return row;
    }

    const stock = sumInventoryForSkus(parentSkus, inventory);
    return {
      ...row,
      stockSellable: stock.sellable,
      stockTotal: stock.total,
    };
  });
}

function addStaleParentRows(rows: ScopeRow[], catalog: CatalogData, inventory: InventoryData, filters: FilterState) {
  if (hasSaleOnlyFilters(filters)) {
    return rows;
  }

  const known = new Set(rows.map((row) => row.key));
  const staleGroups = new Map<
    string,
    {
      key: string;
      parentSku: string | null;
      lieferant: string | null;
      lieferanten: Set<string>;
      stockSellable: number;
      stockTotal: number;
      skus: Set<string>;
    }
  >();

  for (const [sku, record] of Object.entries(inventory.records)) {
    if (record.sellable <= 0) {
      continue;
    }

    const product = catalog.products[sku] ?? null;
    if (!matchesProductFilters(sku, product, filters)) {
      continue;
    }

    const parentKey = product?.amaz_parent_sku ?? 'Without Parent';
    if (known.has(parentKey)) {
      continue;
    }

    const current = staleGroups.get(parentKey) ?? {
      key: parentKey,
      parentSku: product?.amaz_parent_sku ?? null,
      lieferant: product?.lieferant ?? null,
      lieferanten: new Set<string>(product?.lieferant ? [product.lieferant] : []),
      stockSellable: 0,
      stockTotal: 0,
      skus: new Set<string>(),
    };

    current.stockSellable += record.sellable;
    current.stockTotal += record.total;
    current.skus.add(sku);

    if (!current.lieferant && product?.lieferant) {
      current.lieferant = product.lieferant;
    }

    if (product?.lieferant) {
      current.lieferanten.add(product.lieferant);
    }

    staleGroups.set(parentKey, current);
  }

  const staleRows: ScopeRow[] = [...staleGroups.values()].map((group) => ({
    key: group.key,
    label: group.key,
    revenue: 0,
    profit: 0,
    orders: 0,
    units: 0,
    refunds: 0,
    refundedUnits: 0,
    refundOrders: 0,
    margin: 0,
    avgOrder: 0,
    refundRate: 0,
    activeSkus: group.skus.size,
    rows: 0,
    parentSku: group.parentSku,
    lieferant: formatLieferantValues(group.lieferanten, group.lieferant),
    productName: null,
    stockSellable: group.stockSellable,
    stockTotal: group.stockTotal,
    lastSaleDate: null,
    hasReturns: false,
  }));

  return [...rows, ...staleRows];
}

async function fetchScopeRows(
  filters: FilterState,
  groupBy: ScopeGroupBy,
  page: number,
  pageSize: number,
) {
  const params = serializeFilters(filters);
  params.set('groupBy', groupBy);
  params.set('limit', String(pageSize));
  params.set('offset', String((page - 1) * pageSize));

  const response = await fetch(`${API_BASE}/api/dashboard/scope-rows?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Table API error: ${response.status}`);
  }

  return response.json() as Promise<{ rows: ScopeRow[]; total: number }>;
}

async function fetchAllScopeRows(filters: FilterState, groupBy: ScopeGroupBy) {
  const params = serializeFilters(filters);
  params.set('groupBy', groupBy);
  params.set('limit', '10000');
  params.set('offset', '0');

  const response = await fetch(`${API_BASE}/api/dashboard/scope-rows?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Table export API error: ${response.status}`);
  }

  return response.json() as Promise<{ rows: ScopeRow[] }>;
}

export default function AggregatedTables({
  visibleSales,
  inventory,
  catalog,
  filters,
  skuRows,
  parentRows,
  enabled = true,
  onSelectSku,
}: Props) {
  const isApiMode = import.meta.env.VITE_DATA_SOURCE === 'api';
  const [skuTable, setSkuTable] = useState<TableState>(INITIAL_TABLE_STATE);
  const [parentTable, setParentTable] = useState<TableState>(INITIAL_TABLE_STATE);
  const resolvedSkuRows = useMemo(() => {
    if (skuRows) {
      return skuRows.map((row) => {
        const record = inventory.records[row.key];
        return {
          ...row,
          stockSellable: record?.sellable ?? row.stockSellable,
          stockTotal: record?.total ?? row.stockTotal,
        };
      });
    }

    return buildScopeRows(visibleSales ?? [], 'artikelposition', inventory, 500);
  }, [inventory, skuRows, visibleSales]);
  const resolvedParentRows = useMemo(() => {
    if (parentRows) {
      return withFullParentInventory(parentRows, catalog, inventory);
    }

    return withFullParentInventory(buildScopeRows(visibleSales ?? [], 'parentSku', inventory, 500), catalog, inventory);
  }, [catalog, inventory, parentRows, visibleSales]);
  const parentRowsWithStale = useMemo(
    () => addStaleParentRows(resolvedParentRows, catalog, inventory, filters),
    [resolvedParentRows, catalog, inventory, filters],
  );

  // Add stale-stock rows: SKUs in inventory with stock > 0 but no sales in the current view.
  const skuRowsWithStale = useMemo(() => {
    if (hasSaleOnlyFilters(filters)) {
      return resolvedSkuRows;
    }

    const known = new Set(resolvedSkuRows.map((r) => r.key));
    const stale: ScopeRow[] = [];
    for (const [sku, rec] of Object.entries(inventory.records)) {
      if (known.has(sku)) continue;
      if (rec.sellable <= 0) {
        continue;
      }

      const product = catalog.products[sku] ?? null;
      if (!matchesProductFilters(sku, product, filters)) {
        continue;
      }

      stale.push({
        key: sku,
        label: sku,
        revenue: 0,
        profit: 0,
        orders: 0,
        units: 0,
        refunds: 0,
        refundedUnits: 0,
        refundOrders: 0,
        margin: 0,
        avgOrder: 0,
        refundRate: 0,
        activeSkus: 1,
        rows: 0,
        parentSku: product?.amaz_parent_sku ?? null,
        lieferant: product?.lieferant ?? null,
        productName: product?.amaz_name ?? null,
        stockSellable: rec.sellable,
        stockTotal: rec.total,
        lastSaleDate: null,
        hasReturns: false,
      });
    }
    return [...resolvedSkuRows, ...stale];
  }, [resolvedSkuRows, inventory, catalog, filters]);
  const filterSummary = useMemo(() => buildFilterSummary(filters), [filters]);
  const filterKey = useMemo(() => serializeFilters(filters).toString(), [filters]);

  const loadTable = useCallback(async (
    groupBy: ScopeGroupBy,
    page: number,
    pageSize: number,
    setter: TableSetter,
  ) => {
    try {
      setter((prev) => ({ ...prev, loading: true }));
      const payload = await fetchScopeRows(filters, groupBy, page, pageSize);
      setter({
        rows: payload.rows,
        total: payload.total,
        page,
        pageSize,
        loading: false,
      });
    } catch (error) {
      console.error(`Failed to load ${groupBy} rows:`, error);
      setter((prev) => ({ ...prev, loading: false }));
    }
  }, [filters]);

  useEffect(() => {
    if (!isApiMode || !enabled) {
      return;
    }

    setSkuTable((prev) => ({ ...prev, page: 1 }));
    setParentTable((prev) => ({ ...prev, page: 1 }));
  }, [enabled, filterKey, isApiMode]);

  useEffect(() => {
    if (!isApiMode || !enabled) {
      return;
    }

    void loadTable('artikelposition', skuTable.page, skuTable.pageSize, setSkuTable);
  }, [enabled, isApiMode, loadTable, skuTable.page, skuTable.pageSize, filterKey]);

  useEffect(() => {
    if (!isApiMode || !enabled) {
      return;
    }

    void loadTable('parentSku', parentTable.page, parentTable.pageSize, setParentTable);
  }, [enabled, isApiMode, loadTable, parentTable.page, parentTable.pageSize, filterKey]);

  const exportTable = async (format: 'excel' | 'csv', labelTitle: string, rows: ScopeRow[], groupBy?: ScopeGroupBy) => {
    const filenameBase = `${labelTitle.toLowerCase()}-${dayjs().format('YYYY-MM-DD_HH-mm')}`;
    const title = `${labelTitle} · экспорт таблицы`;
    const exportRows = isApiMode && groupBy ? (await fetchAllScopeRows(filters, groupBy)).rows : rows;

    if (format === 'csv') {
      downloadCsv({
        filename: `${filenameBase}.csv`,
        title,
        worksheetName: labelTitle,
        subtitle: filterSummary,
        columns: [
          { ...EXPORT_COLUMNS[0], header: labelTitle },
          ...EXPORT_COLUMNS.slice(1),
        ],
        rows: exportRows,
      });
      return;
    }

    downloadExcelWorkbook(`${filenameBase}.xls`, [{
      title,
      worksheetName: labelTitle,
      subtitle: filterSummary,
      columns: [
        { ...EXPORT_COLUMNS[0], header: labelTitle },
        ...EXPORT_COLUMNS.slice(1),
      ],
      rows: exportRows,
    }]);
  };

  const displayedSkuRows = isApiMode ? skuTable.rows : skuRowsWithStale;
  const displayedParentRows = isApiMode ? parentTable.rows : parentRowsWithStale;

  return (
    <div className="dashboard-main" style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card__header">
          <h3>SKU</h3>
          <Space size={8} wrap>
            <span className="card__meta">Клик по строке — карточка SKU</span>
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              onClick={() => void exportTable('excel', 'SKU', displayedSkuRows, 'artikelposition')}
            >
              Excel
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => void exportTable('csv', 'SKU', displayedSkuRows, 'artikelposition')}
            >
              CSV
            </Button>
          </Space>
        </div>
        <Table<ScopeRow>
          className="agg-table"
          rowKey="key"
          dataSource={displayedSkuRows}
          columns={makeColumns('SKU')}
          loading={isApiMode ? (!enabled || skuTable.loading) : undefined}
          pagination={isApiMode
            ? {
              current: skuTable.page,
              pageSize: skuTable.pageSize,
              total: skuTable.total,
              showSizeChanger: false,
              showTotal: (t) => `${t} строк`,
              onChange: (page, pageSize) => setSkuTable((prev) => ({
                ...prev,
                page,
                pageSize: pageSize ?? prev.pageSize,
              })),
            }
            : { pageSize: 10, showSizeChanger: false, showTotal: (t) => `${t} строк` }}
          rowClassName={(r) => (r.stockSellable > 0 && r.units === 0 ? 'row--stale-stock' : '')}
          onRow={(r) => ({ onClick: () => onSelectSku(r.key), style: { cursor: 'pointer' } })}
          size="middle"
        />
      </div>

      <div className="card">
        <div className="card__header">
          <h3>Parent</h3>
          <Space size={8} wrap>
            <span className="card__meta">Агрегация по parent SKU</span>
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              onClick={() => void exportTable('excel', 'Parent', displayedParentRows, 'parentSku')}
            >
              Excel
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => void exportTable('csv', 'Parent', displayedParentRows, 'parentSku')}
            >
              CSV
            </Button>
          </Space>
        </div>
        <Table<ScopeRow>
          className="agg-table"
          rowKey="key"
          dataSource={displayedParentRows}
          columns={makeColumns('Parent')}
          loading={isApiMode ? (!enabled || parentTable.loading) : undefined}
          pagination={isApiMode
            ? {
              current: parentTable.page,
              pageSize: parentTable.pageSize,
              total: parentTable.total,
              showSizeChanger: false,
              showTotal: (t) => `${t} строк`,
              onChange: (page, pageSize) => setParentTable((prev) => ({
                ...prev,
                page,
                pageSize: pageSize ?? prev.pageSize,
              })),
            }
            : { pageSize: 10, showSizeChanger: false, showTotal: (t) => `${t} строк` }}
          rowClassName={(r) => (r.stockSellable > 0 && r.units === 0 ? 'row--stale-stock' : '')}
          size="middle"
        />
      </div>
    </div>
  );
}
