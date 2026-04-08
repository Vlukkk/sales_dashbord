import dayjs from 'dayjs';
import type { EnrichedSale, InventoryRecord, Product } from '../../types';
import { formatMetricValue, type InventorySummary, type MetricSummary, type ScopeRow } from '../../utils/analytics';

type FocusMode = 'sku' | 'parent' | 'lieferant' | 'overview';

interface Props {
  focusMode: FocusMode;
  focusTitle: string;
  focusDescription: string;
  boardTitle: string;
  secondaryTitle: string;
  activeChips: string[];
  summary: MetricSummary;
  inventorySummary: InventorySummary;
  primaryRows: ScopeRow[];
  parentContextRows: ScopeRow[];
  recentOrders: EnrichedSale[];
  returnSignals: ScopeRow[];
  stockSignals: ScopeRow[];
  selectedProduct: Product | null;
  selectedInventory: InventoryRecord | null;
  onSelectSku: (sku: string) => void;
}

function formatDate(value: string | null) {
  return value ? dayjs(value).format('DD MMM · HH:mm') : 'No date';
}

function secondaryMeta(row: ScopeRow) {
  if (row.parentSku && row.parentSku !== row.label) {
    return row.parentSku;
  }

  return row.lieferant ?? row.productName ?? 'No linked meta';
}

function MetricStrip({
  summary,
  inventorySummary,
}: {
  summary: MetricSummary;
  inventorySummary: InventorySummary;
}) {
  const items = [
    { label: 'Orders', value: formatMetricValue('orders', summary.orders), note: `${summary.activeSkus} active SKU` },
    { label: 'Units', value: formatMetricValue('units', summary.units), note: `${formatMetricValue('refundRate', summary.refundRate)} returned` },
    { label: 'Refunded Units', value: formatMetricValue('units', summary.refundedUnits), note: `${summary.refundOrders} orders with returns` },
    { label: 'Sellable FBA', value: formatMetricValue('units', inventorySummary.sellable), note: `${inventorySummary.skusWithStock} stocked SKU` },
    { label: 'Low Stock', value: formatMetricValue('units', inventorySummary.lowStockSkus), note: 'visible positions under 4 units' },
  ];

  return (
    <div className="lens-strip">
      {items.map((item) => (
        <div key={item.label} className="lens-strip__item">
          <span className="lens-strip__label">{item.label}</span>
          <strong className="lens-strip__value">{item.value}</strong>
          <span className="lens-strip__note">{item.note}</span>
        </div>
      ))}
    </div>
  );
}

function ScopeRows({
  rows,
  title,
  onSelectSku,
  clickable,
  highlightKey,
}: {
  rows: ScopeRow[];
  title: string;
  onSelectSku: (sku: string) => void;
  clickable: boolean;
  highlightKey?: string;
}) {
  const maxUnits = Math.max(...rows.map((row) => row.units), 1);

  return (
    <div className="focus-card">
      <div className="focus-card__header">
        <span className="focus-card__title">{title}</span>
        <span className="focus-card__meta">{rows.length} rows</span>
      </div>

      <div className="scope-rows">
        {rows.length === 0 && <div className="scope-empty">Nothing sold in the current slice.</div>}

        {rows.map((row) => {
          const width = `${Math.max((row.units / maxUnits) * 100, row.units > 0 ? 6 : 0)}%`;
          const rowClassName = [
            'scope-row',
            clickable ? 'scope-row--clickable' : '',
            highlightKey === row.key ? 'scope-row--highlight' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={row.key}
              type="button"
              className={rowClassName}
              onClick={() => clickable && onSelectSku(row.key)}
            >
                <div className="scope-row__main">
                  <div className="scope-row__identity">
                    <strong>{row.label}</strong>
                    <span>{secondaryMeta(row)}</span>
                  </div>

                <div className="scope-row__tags">
                  <span className={`scope-tag ${row.hasReturns ? 'scope-tag--rose' : 'scope-tag--mint'}`}>
                    {row.hasReturns ? 'Returns' : 'Clean'}
                  </span>
                  <span className="scope-tag">{row.stockSellable} FBA</span>
                </div>
              </div>

              <div className="scope-row__metrics">
                <div className="scope-metric scope-metric--bar">
                  <span>Units {formatMetricValue('units', row.units)}</span>
                  <div className="scope-bar">
                    <span style={{ width }} />
                  </div>
                </div>
                <div className="scope-metric">
                  <span>Orders</span>
                  <strong>{formatMetricValue('orders', row.orders)}</strong>
                </div>
                <div className="scope-metric">
                  <span>Return %</span>
                  <strong>{formatMetricValue('refundRate', row.refundRate)}</strong>
                </div>
                <div className="scope-metric">
                  <span>Refunded</span>
                  <strong>{formatMetricValue('units', row.refundedUnits)}</strong>
                </div>
                <div className="scope-metric">
                  <span>Last sale</span>
                  <strong>{formatDate(row.lastSaleDate)}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkuDetail({
  summary,
  selectedProduct,
  selectedInventory,
  recentOrders,
}: {
  summary: ScopeRow | null;
  selectedProduct: Product | null;
  selectedInventory: InventoryRecord | null;
  recentOrders: EnrichedSale[];
}) {
  return (
    <div className="focus-card">
      <div className="focus-card__header">
        <span className="focus-card__title">Selected SKU</span>
        <span className="focus-card__meta">{summary?.label ?? 'No SKU'}</span>
      </div>

      <div className="sku-panel">
        <div className="sku-panel__hero">
          <h3>{selectedProduct?.amaz_name ?? summary?.label ?? 'No product selected'}</h3>
          <p>{selectedProduct?.product_type ?? selectedProduct?.chain_type ?? 'Product metadata will appear here.'}</p>
        </div>

        <div className="sku-panel__facts">
          <div>
            <span>Lieferant</span>
            <strong>{selectedProduct?.lieferant ?? 'Unknown'}</strong>
          </div>
          <div>
            <span>Parent</span>
            <strong>{selectedProduct?.amaz_parent_sku ?? 'Without parent'}</strong>
          </div>
          <div>
            <span>Sales</span>
            <strong>{formatMetricValue('orders', summary?.orders ?? 0)}</strong>
          </div>
          <div>
            <span>Units</span>
            <strong>{formatMetricValue('units', summary?.units ?? 0)}</strong>
          </div>
          <div>
            <span>Return %</span>
            <strong>{formatMetricValue('refundRate', summary?.refundRate ?? 0)}</strong>
          </div>
          <div>
            <span>FBA</span>
            <strong>{selectedInventory?.sellable ?? 0} sellable</strong>
          </div>
        </div>

        <div className="sku-orders">
          <div className="focus-card__header focus-card__header--inner">
            <span className="focus-card__title">Recent orders</span>
            <span className="focus-card__meta">{recentOrders.length} rows</span>
          </div>

          <div className="order-list">
            {recentOrders.length === 0 && <div className="scope-empty">No orders in the current slice.</div>}

            {recentOrders.map((order) => (
              <div key={`${order.bestellungNr}-${order.bestelldatum}`} className="order-row">
                <div>
                  <strong>{order.bestellungNr ?? 'Order'}</strong>
                  <span>{formatDate(order.bestelldatum)}</span>
                </div>
                <div>
                  <strong>{formatMetricValue('units', order.qtyOrdered ?? 0)} units</strong>
                  <span>{(order.qtyRefunded ?? 0) > 0 ? `${order.qtyRefunded} refunded` : order.status ?? 'No status'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalList({
  title,
  rows,
  kind,
  onSelectSku,
}: {
  title: string;
  rows: ScopeRow[];
  kind: 'return' | 'stock';
  onSelectSku: (sku: string) => void;
}) {
  return (
    <div className="signal-card">
      <div className="focus-card__header focus-card__header--inner">
        <span className="focus-card__title">{title}</span>
        <span className="focus-card__meta">{rows.length} SKU</span>
      </div>

      <div className="signal-list">
        {rows.length === 0 && <div className="scope-empty">No signals in the current slice.</div>}

        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="signal-row"
            onClick={() => onSelectSku(row.key)}
          >
            <div>
              <strong>{row.label}</strong>
              <span>{secondaryMeta(row)}</span>
            </div>
            <div>
              <strong>
                {kind === 'return'
                  ? formatMetricValue('refundRate', row.refundRate)
                  : `${row.stockSellable} FBA`}
              </strong>
              <span>
                {kind === 'return'
                  ? `${row.refundedUnits} refunded units`
                  : `${formatMetricValue('units', row.units)} sold units`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SelectionWorkbench({
  focusMode,
  focusTitle,
  focusDescription,
  boardTitle,
  secondaryTitle,
  activeChips,
  summary,
  inventorySummary,
  primaryRows,
  parentContextRows,
  recentOrders,
  returnSignals,
  stockSignals,
  selectedProduct,
  selectedInventory,
  onSelectSku,
}: Props) {
  const currentRow = primaryRows[0] ?? null;

  return (
    <section id="overview" className="selection-workbench">
      <div className="selection-head">
        <div>
          <span className="selection-head__eyebrow">Selection lens</span>
          <h2>{focusTitle}</h2>
          <p>{focusDescription}</p>
        </div>

        <div className="selection-chips">
          {activeChips.map((chip) => (
            <span key={chip} className="selection-chip">{chip}</span>
          ))}
        </div>
      </div>

      <MetricStrip summary={summary} inventorySummary={inventorySummary} />

      <div className="selection-layout">
        <div className="selection-main">
          {focusMode === 'sku' ? (
            <>
              <SkuDetail
                summary={currentRow}
                selectedProduct={selectedProduct}
                selectedInventory={selectedInventory}
                recentOrders={recentOrders}
              />
              <ScopeRows
                rows={parentContextRows}
                title={secondaryTitle}
                onSelectSku={onSelectSku}
                clickable
                highlightKey={currentRow?.key}
              />
            </>
          ) : (
            <ScopeRows
              rows={primaryRows}
              title={boardTitle}
              onSelectSku={onSelectSku}
              clickable={focusMode !== 'overview'}
            />
          )}
        </div>

        <div className="selection-side">
          <SignalList
            title={focusMode === 'sku' ? 'Return pressure' : secondaryTitle}
            rows={returnSignals}
            kind="return"
            onSelectSku={onSelectSku}
          />
          <SignalList title="Stock pressure" rows={stockSignals} kind="stock" onSelectSku={onSelectSku} />
        </div>
      </div>
    </section>
  );
}
