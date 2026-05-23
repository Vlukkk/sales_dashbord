import dayjs from 'dayjs';
import type { DashboardDailyPoint, EnrichedSale, FilterState } from '../../types';
import { summarizeSales, type InventorySummary, type MetricSummary, splitSalesCurrentAndPrevious } from '../../utils/analytics';
import SalesRefundChart from './SalesRefundChart';

const MIN_COMPARE_DAYS = 14;

function computeWindowDays(dateRange: FilterState['dateRange']): number | null {
  if (!dateRange) return null;
  return dayjs(dateRange[1]).diff(dayjs(dateRange[0]), 'day') + 1;
}

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

interface DeltaBadgeProps {
  current: number;
  previous: number | null;
  mode?: 'relative' | 'points';
  inverted?: boolean;
  windowDays?: number | null;
}

function DeltaBadge({ current, previous, mode = 'relative', inverted = false, windowDays }: DeltaBadgeProps) {
  if (typeof windowDays === 'number' && windowDays < MIN_COMPARE_DAYS) {
    return null;
  }

  if (previous === null || previous === 0) {
    return <span className="bento__delta">база периода н/д</span>;
  }

  const delta = mode === 'points' ? current - previous : ((current - previous) / previous) * 100;

  if (!isFinite(delta)) {
    return <span className="bento__delta">база периода н/д</span>;
  }

  const rounded = Math.round(delta * 10) / 10;
  const positive = rounded > 0;
  const negative = rounded < 0;
  const good = inverted ? negative : positive;
  const bad = inverted ? positive : negative;
  const cls = good ? 'bento__delta bento__delta--up' : bad ? 'bento__delta bento__delta--down' : 'bento__delta';
  const arrow = positive ? '↑' : negative ? '↓' : '·';
  const suffix = mode === 'points' ? ' п.п.' : '%';

  return (
    <span className={cls}>
      {arrow} {Math.abs(rounded).toFixed(1)}{suffix}
    </span>
  );
}

export default function Overview(props: Props) {
  if (props.mode === 'api') {
    const refundRate = props.summary.units > 0 ? (props.summary.refundedUnits / props.summary.units) * 100 : 0;
    const showSelectionHeadline = props.filters.parentSku.length > 0 || props.filters.artikelposition.length > 0;
    const selectionStats = {
      skus: props.summary.activeSkus,
      refunds: props.summary.refundedUnits,
      revenue: props.summary.revenue,
    };
    const windowDays = computeWindowDays(props.filters.dateRange);

    return (
      <>
        <div className="bento">
          <div className="bento__item">
            <span className="bento__label">Заказы</span>
            <span className="bento__value">{fmtNum(props.summary.orders)}</span>
            <DeltaBadge current={props.summary.orders} previous={props.previousSummary?.orders ?? null} windowDays={windowDays} />
          </div>
          <div className="bento__item">
            <span className="bento__label">Продано, шт</span>
            <span className="bento__value">{fmtNum(props.summary.units)}</span>
            <DeltaBadge current={props.summary.units} previous={props.previousSummary?.units ?? null} windowDays={windowDays} />
          </div>
          <div className="bento__item">
            <span className="bento__label">Возвраты, шт</span>
            <span className="bento__value">{fmtNum(props.summary.refundedUnits)}</span>
            <span className="bento__note">{refundRate.toFixed(1)}% от продаж</span>
            <DeltaBadge
              current={refundRate}
              previous={props.previousSummary?.refundRate ?? null}
              mode="points"
              inverted
              windowDays={windowDays}
            />
          </div>
          <div className="bento__item">
            <span className="bento__label">Сумма продаж</span>
            <span className="bento__value">{fmtMoney(props.summary.revenue)}</span>
            <DeltaBadge current={props.summary.revenue} previous={props.previousSummary?.revenue ?? null} windowDays={windowDays} />
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
  const windowDays = computeWindowDays(props.filters.dateRange);
  const hasPrev = periodComparison.previous.length > 0;

  return (
    <>
      <div className="bento">
        <div className="bento__item">
          <span className="bento__label">Заказы</span>
          <span className="bento__value">{fmtNum(props.summary.orders)}</span>
          <DeltaBadge current={props.summary.orders} previous={hasPrev ? previousSummary.orders : null} windowDays={windowDays} />
        </div>
        <div className="bento__item">
          <span className="bento__label">Продано, шт</span>
          <span className="bento__value">{fmtNum(props.summary.units)}</span>
          <DeltaBadge current={props.summary.units} previous={hasPrev ? previousSummary.units : null} windowDays={windowDays} />
        </div>
        <div className="bento__item">
          <span className="bento__label">Возвраты, шт</span>
          <span className="bento__value">{fmtNum(props.summary.refundedUnits)}</span>
          <span className="bento__note">{refundRate.toFixed(1)}% от продаж</span>
          <DeltaBadge
            current={refundRate}
            previous={hasPrev ? previousSummary.refundRate : null}
            mode="points"
            inverted
            windowDays={windowDays}
          />
        </div>
        <div className="bento__item">
          <span className="bento__label">Сумма продаж</span>
          <span className="bento__value">{fmtMoney(props.summary.revenue)}</span>
          <DeltaBadge current={props.summary.revenue} previous={hasPrev ? previousSummary.revenue : null} windowDays={windowDays} />
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
