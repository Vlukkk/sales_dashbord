import { useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CatalogData, EnrichedSale, FilterState, InventoryData, Product } from '../../types';
import { buildScopeRows, type ScopeRow } from '../../utils/analytics';

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

function makeColumns(labelTitle: string): ColumnsType<ScopeRow> {
  return [
    { title: labelTitle, dataIndex: 'label', key: 'label', render: (v: string) => <strong>{v}</strong> },
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

  return (
    <div className="dashboard-main" style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card__header">
          <h3>SKU</h3>
          <span className="card__meta">Клик по строке — карточка SKU</span>
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
          <span className="card__meta">Агрегация по parent SKU</span>
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
