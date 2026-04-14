import type { DashboardDailyPoint, EnrichedSale, FilterState } from '../../types';
import { summarizeSales, type InventorySummary, type MetricSummary, splitSalesCurrentAndPrevious } from '../../utils/analytics';
import SalesRefundChart from './SalesRefundChart';

interface LegacyProps {
  mode?: 'legacy';
  visibleSales: EnrichedSale[];
  comparisonSales: EnrichedSale[];
  summary: MetricSummary;
  inventorySummary: InventorySummary;
  filters: FilterState;
}

interface ApiChartSeries {
  points: DashboardDailyPoint[];
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  from: string | null;
  to: string | null;
}

interface ApiProps {
  mode: 'api';
  summary: MetricSummary;
  previousSummary: MetricSummary | null;
  inventorySummary: InventorySummary;
  filters: FilterState;
  amazonSeries: ApiChartSeries;
  retailSeries: ApiChartSeries;
}

type Props = LegacyProps | ApiProps;

const fmtNum = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);
const fmtMoney = (v: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

function computeRelativeDelta(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function DeltaBadge({
  value,
  inverted = false,
  suffix = '%',
}: {
  value: number | null;
  inverted?: boolean;
  suffix?: string;
}) {
  if (value === null || !isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 10) / 10;
  const positive = rounded > 0;
  const negative = rounded < 0;
  const good = inverted ? negative : positive;
  const bad = inverted ? positive : negative;
  const cls = good ? 'bento__delta bento__delta--up' : bad ? 'bento__delta bento__delta--down' : 'bento__delta';
  const arrow = positive ? '↑' : negative ? '↓' : '·';

  return (
    <span className={cls}>
      {arrow} {Math.abs(rounded).toFixed(1)}{suffix}
    </span>
  );
}

export default function Overview(props: Props) {
  if (props.mode === 'api') {
    const previousSummary = props.previousSummary ?? {
      ...props.summary,
      orders: 0,
      units: 0,
      refundedUnits: 0,
      revenue: 0,
      refunds: 0,
      profit: 0,
      refundOrders: 0,
      margin: 0,
      avgOrder: 0,
      refundRate: 0,
      activeSkus: 0,
      rows: 0,
    };
    const refundRate = props.summary.units > 0 ? (props.summary.refundedUnits / props.summary.units) * 100 : 0;
    const showSelectionHeadline = props.filters.parentSku.length > 0 || props.filters.artikelposition.length > 0;
    const selectionStats = {
      skus: props.summary.activeSkus,
      refunds: props.summary.refundedUnits,
      revenue: props.summary.revenue,
    };

    return (
      <>
        <div className="bento">
          <div className="bento__item">
            <span className="bento__label">Заказы</span>
            <span className="bento__value">{fmtNum(props.summary.orders)}</span>
            <DeltaBadge value={computeRelativeDelta(props.summary.orders, previousSummary.orders)} />
          </div>
          <div className="bento__item">
            <span className="bento__label">Продано, шт</span>
            <span className="bento__value">{fmtNum(props.summary.units)}</span>
            <DeltaBadge value={computeRelativeDelta(props.summary.units, previousSummary.units)} />
          </div>
          <div className="bento__item">
            <span className="bento__label">Возвраты, шт</span>
            <span className="bento__value">{fmtNum(props.summary.refundedUnits)}</span>
            <span className="bento__note">{refundRate.toFixed(1)}% от продаж</span>
            <DeltaBadge
              value={props.previousSummary ? refundRate - previousSummary.refundRate : null}
              inverted
              suffix=" п.п."
            />
          </div>
          <div className="bento__item">
            <span className="bento__label">Сумма продаж</span>
            <span className="bento__value">{fmtMoney(props.summary.revenue)}</span>
            <DeltaBadge value={computeRelativeDelta(props.summary.revenue, previousSummary.revenue)} />
          </div>
          <div className="bento__item">
            <span className="bento__label">FBA в продаже</span>
            <span className="bento__value">{fmtNum(props.inventorySummary.sellable)}</span>
            <span className="bento__note">{props.inventorySummary.skusWithStock} SKUs</span>
          </div>
          <div className="bento__item">
            <span className="bento__label">Остаток</span>
            <span className="bento__value">{fmtNum(props.inventorySummary.total)}</span>
            <span className="bento__note">{props.inventorySummary.trackedSkus} SKUs</span>
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
          <SalesRefundChart
            mode="api"
            title="Amazon — продажи и возвраты"
            points={props.amazonSeries.points}
            summary={props.amazonSeries.summary}
            previousSummary={props.amazonSeries.previousSummary}
            from={props.amazonSeries.from}
            to={props.amazonSeries.to}
          />
          <SalesRefundChart
            mode="api"
            title="Retail — продажи и возвраты"
            points={props.retailSeries.points}
            summary={props.retailSeries.summary}
            previousSummary={props.retailSeries.previousSummary}
            from={props.retailSeries.from}
            to={props.retailSeries.to}
          />
        </div>
      </>
    );
  }

  const amazonSales = props.visibleSales.filter((sale) => {
    const group = sale.kundengruppe?.toLowerCase() ?? '';
    return group.includes('amazon') || sale.channel.toLowerCase().includes('amazon');
  });
  const amazonComparisonSales = props.comparisonSales.filter((sale) => {
    const group = sale.kundengruppe?.toLowerCase() ?? '';
    return group.includes('amazon') || sale.channel.toLowerCase().includes('amazon');
  });

  const retailSales = props.visibleSales.filter((sale) => (sale.kundengruppe?.toLowerCase() ?? '').includes('retail'));
  const retailComparisonSales = props.comparisonSales.filter((sale) => (sale.kundengruppe?.toLowerCase() ?? '').includes('retail'));

  const showSelectionHeadline = props.filters.parentSku.length > 0 || !!props.filters.artikelposition;
  const periodComparison = splitSalesCurrentAndPrevious(props.visibleSales, props.comparisonSales);
  const previousSummary = summarizeSales(periodComparison.previous);

  const selectionStats = (() => {
    const skus = new Set(props.visibleSales.map((sale) => sale.artikelposition).filter(Boolean) as string[]);
    const refunds = props.visibleSales.reduce((accumulator, sale) => accumulator + (sale.qtyRefunded ?? 0), 0);
    const revenue = props.visibleSales.reduce((accumulator, sale) => accumulator + (sale.totalInclTax ?? 0), 0);
    return { skus: skus.size, refunds, revenue };
  })();

  const refundRate = props.summary.units > 0 ? (props.summary.refundedUnits / props.summary.units) * 100 : 0;

  return (
    <>
      <div className="bento">
        <div className="bento__item">
          <span className="bento__label">Заказы</span>
          <span className="bento__value">{fmtNum(props.summary.orders)}</span>
          <DeltaBadge value={computeRelativeDelta(props.summary.orders, previousSummary.orders)} />
        </div>
        <div className="bento__item">
          <span className="bento__label">Продано, шт</span>
          <span className="bento__value">{fmtNum(props.summary.units)}</span>
          <DeltaBadge value={computeRelativeDelta(props.summary.units, previousSummary.units)} />
        </div>
        <div className="bento__item">
          <span className="bento__label">Возвраты, шт</span>
          <span className="bento__value">{fmtNum(props.summary.refundedUnits)}</span>
          <span className="bento__note">{refundRate.toFixed(1)}% от продаж</span>
          <DeltaBadge
            value={periodComparison.previous.length > 0 ? refundRate - previousSummary.refundRate : null}
            inverted
            suffix=" п.п."
          />
        </div>
        <div className="bento__item">
          <span className="bento__label">Сумма продаж</span>
          <span className="bento__value">{fmtMoney(props.summary.revenue)}</span>
          <DeltaBadge value={computeRelativeDelta(props.summary.revenue, previousSummary.revenue)} />
        </div>
        <div className="bento__item">
          <span className="bento__label">FBA в продаже</span>
          <span className="bento__value">{fmtNum(props.inventorySummary.sellable)}</span>
          <span className="bento__note">{props.inventorySummary.skusWithStock} SKUs</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Остаток</span>
          <span className="bento__value">{fmtNum(props.inventorySummary.total)}</span>
          <span className="bento__note">{props.inventorySummary.trackedSkus} SKUs</span>
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
        <SalesRefundChart
          title="Amazon — продажи и возвраты"
          sales={amazonSales}
          comparisonSales={amazonComparisonSales}
        />
        <SalesRefundChart
          title="Retail — продажи и возвраты"
          sales={retailSales}
          comparisonSales={retailComparisonSales}
        />
      </div>
    </>
  );
}
