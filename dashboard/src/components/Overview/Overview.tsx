import { useMemo } from 'react';
import type { EnrichedSale, FilterState } from '../../types';
import type { InventorySummary, MetricSummary } from '../../utils/analytics';
import SalesRefundChart from './SalesRefundChart';

interface Props {
  visibleSales: EnrichedSale[];
  summary: MetricSummary;
  inventorySummary: InventorySummary;
  filters: FilterState;
}

const fmtNum = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);
const fmtMoney = (v: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function Overview({ visibleSales, summary, inventorySummary, filters }: Props) {
  const amazonSales = useMemo(
    () =>
      visibleSales.filter((s) => {
        const g = s.kundengruppe?.toLowerCase() ?? '';
        return g.includes('amazon') || s.channel.toLowerCase().includes('amazon');
      }),
    [visibleSales],
  );

  const retailSales = useMemo(
    () => visibleSales.filter((s) => (s.kundengruppe?.toLowerCase() ?? '').includes('retail')),
    [visibleSales],
  );

  const showSelectionHeadline = filters.parentSku.length > 0 || !!filters.artikelposition;

  const selectionStats = useMemo(() => {
    const skus = new Set(visibleSales.map((s) => s.artikelposition).filter(Boolean) as string[]);
    const refunds = visibleSales.reduce((acc, s) => acc + (s.qtyRefunded ?? 0), 0);
    const revenue = visibleSales.reduce((acc, s) => acc + (s.totalInclTax ?? 0), 0);
    return { skus: skus.size, refunds, revenue };
  }, [visibleSales]);

  const refundRate = summary.units > 0 ? (summary.refundedUnits / summary.units) * 100 : 0;

  return (
    <>
      <div className="bento">
        <div className="bento__item">
          <span className="bento__label">Заказы</span>
          <span className="bento__value">{fmtNum(summary.orders)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Продано, шт</span>
          <span className="bento__value">{fmtNum(summary.units)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Возвраты, шт</span>
          <span className="bento__value">{fmtNum(summary.refundedUnits)}</span>
          <span className="bento__note">{refundRate.toFixed(1)}% от продаж</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Сумма продаж</span>
          <span className="bento__value">{fmtMoney(summary.revenue)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">FBA в продаже</span>
          <span className="bento__value">{fmtNum(inventorySummary.sellable)}</span>
          <span className="bento__note">{inventorySummary.skusWithStock} SKUs</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Низкий остаток</span>
          <span className="bento__value">{fmtNum(inventorySummary.lowStockSkus)}</span>
          <span className="bento__note">SKUs ≤ 3 шт</span>
        </div>
      </div>

      {showSelectionHeadline && (
        <div className="selection-headline">
          <div className="selection-headline__item">
            <span className="selection-headline__label">SKUs в выборке</span>
            <span className="selection-headline__value">{fmtNum(selectionStats.skus)}</span>
          </div>
          <div className="selection-headline__item">
            <span className="selection-headline__label">Возвраты</span>
            <span className="selection-headline__value">{fmtNum(selectionStats.refunds)}</span>
          </div>
          <div className="selection-headline__item">
            <span className="selection-headline__label">Сумма продаж</span>
            <span className="selection-headline__value">{fmtMoney(selectionStats.revenue)}</span>
          </div>
        </div>
      )}

      <div className="chart-grid">
        <SalesRefundChart title="Amazon — продажи и возвраты" sales={amazonSales} />
        <SalesRefundChart title="Retail — продажи и возвраты" sales={retailSales} />
      </div>
    </>
  );
}
