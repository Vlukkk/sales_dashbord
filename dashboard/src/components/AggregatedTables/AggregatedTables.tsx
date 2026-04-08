import { useMemo } from 'react';
import { Button, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CatalogData, EnrichedSale, FilterState, InventoryData, Product } from '../../types';
import { buildScopeRows, type ScopeRow } from '../../utils/analytics';
import { downloadCsv, downloadExcelWorkbook, type ExportColumn } from '../../utils/tableExport';

interface Props {
  visibleSales: EnrichedSale[];
  inventory: InventoryData;
  catalog: CatalogData;
  filters: FilterState;
  onSelectSku: (sku: string) => void;
}

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
  if (filters.artikelposition && sku !== filters.artikelposition) {
    return false;
  }

  if (filters.parentSku.length > 0 && !filters.parentSku.includes(product?.amaz_parent_sku ?? '')) {
    return false;
  }

  if (filters.lieferant.length > 0 && !filters.lieferant.includes(product?.lieferant ?? '')) {
    return false;
  }

  return true;
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

export default function AggregatedTables({ visibleSales, inventory, catalog, filters, onSelectSku }: Props) {
  const skuRows = useMemo(
    () => buildScopeRows(visibleSales, 'artikelposition', inventory, 500),
    [visibleSales, inventory],
  );
  const parentRows = useMemo(
    () => withFullParentInventory(buildScopeRows(visibleSales, 'parentSku', inventory, 500), catalog, inventory),
    [visibleSales, inventory, catalog],
  );

  // Add stale-stock rows: SKUs in inventory with stock > 0 but no sales in the current view.
  const skuRowsWithStale = useMemo(() => {
    if (hasSaleOnlyFilters(filters)) {
      return skuRows;
    }

    const known = new Set(skuRows.map((r) => r.key));
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
    return [...skuRows, ...stale];
  }, [skuRows, inventory, catalog, filters]);
  const filterSummary = useMemo(() => buildFilterSummary(filters), [filters]);

  const exportTable = (format: 'excel' | 'csv', labelTitle: string, rows: ScopeRow[]) => {
    const filenameBase = `${labelTitle.toLowerCase()}-${dayjs().format('YYYY-MM-DD_HH-mm')}`;
    const title = `${labelTitle} · экспорт таблицы`;

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
        rows,
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
      rows,
    }]);
  };

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
              onClick={() => exportTable('excel', 'SKU', skuRowsWithStale)}
            >
              Excel
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => exportTable('csv', 'SKU', skuRowsWithStale)}
            >
              CSV
            </Button>
          </Space>
        </div>
        <Table<ScopeRow>
          className="agg-table"
          rowKey="key"
          dataSource={skuRowsWithStale}
          columns={makeColumns('SKU')}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `${t} строк` }}
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
              onClick={() => exportTable('excel', 'Parent', parentRows)}
            >
              Excel
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => exportTable('csv', 'Parent', parentRows)}
            >
              CSV
            </Button>
          </Space>
        </div>
        <Table<ScopeRow>
          className="agg-table"
          rowKey="key"
          dataSource={parentRows}
          columns={makeColumns('Parent')}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `${t} строк` }}
          rowClassName={(r) => (r.stockSellable > 0 && r.units === 0 ? 'row--stale-stock' : '')}
          size="middle"
        />
      </div>
    </div>
  );
}
