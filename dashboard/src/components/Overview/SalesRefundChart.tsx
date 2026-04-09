import { useId, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import dayjs from 'dayjs';
import type { EnrichedSale } from '../../types';
import { splitSalesCurrentAndPrevious, summarizeSales } from '../../utils/analytics';

interface Props {
  title: string;
  sales: EnrichedSale[];
  comparisonSales: EnrichedSale[];
}

interface DailyPoint {
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  refundRevenue: number;
}

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaInverted?: boolean;
  deltaMode?: 'relative' | 'points';
  alert?: boolean;
}

interface HoverState {
  point: DailyPoint;
  left: number;
  top: number;
}

type HoverHandler = (point: DailyPoint | null, event?: ReactMouseEvent<SVGRectElement>) => void;

const COLOR_REVENUE = '#2563eb';
const COLOR_SALES_BAR = '#93c5fd';
const COLOR_REFUNDS = '#e11d48';
const REFUND_RATE_ALERT = 10;

function buildDaily(sales: EnrichedSale[]): DailyPoint[] {
  const map = new Map<
    string,
    { sales: number; refunds: number; revenue: number; refundRevenue: number }
  >();

  for (const sale of sales) {
    const day = sale.bestelldatum?.slice(0, 10);
    if (!day) {
      continue;
    }

    const current = map.get(day) ?? { sales: 0, refunds: 0, revenue: 0, refundRevenue: 0 };
    current.sales += sale.qtyOrdered ?? 0;
    current.refunds += sale.qtyRefunded ?? 0;
    current.revenue += sale.totalInclTax ?? 0;
    current.refundRevenue += sale.refundedInclTax ?? 0;
    map.set(day, current);
  }

  const dates = [...map.keys()].sort();
  if (dates.length === 0) {
    return [];
  }

  const points: DailyPoint[] = [];
  let cursor = dayjs(dates[0]);
  const end = dayjs(dates[dates.length - 1]);

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    const current = map.get(date) ?? { sales: 0, refunds: 0, revenue: 0, refundRevenue: 0 };
    points.push({
      date,
      sales: current.sales,
      refunds: current.refunds,
      refundRate: current.sales > 0 ? (current.refunds / current.sales) * 100 : 0,
      revenue: current.revenue,
      refundRevenue: current.refundRevenue,
    });
    cursor = cursor.add(1, 'day');
  }

  return points;
}

function pickPeakIndexes(points: DailyPoint[], getValue: (point: DailyPoint) => number, budget: number) {
  const picked = new Set<number>();
  if (points.length === 0 || budget <= 0) {
    return picked;
  }

  const bucketCount = Math.min(budget, points.length);
  const bucketSize = points.length / bucketCount;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(points.length, Math.floor((bucket + 1) * bucketSize));
    let bestIndex = -1;
    let bestValue = 0;

    for (let index = start; index < end; index += 1) {
      const value = getValue(points[index]);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      picked.add(bestIndex);
    }
  }

  return picked;
}

function pickAxisTicks(points: DailyPoint[]) {
  if (points.length <= 8) {
    return new Set(points.map((point) => point.date));
  }

  const step = Math.ceil(points.length / 8);
  const ticks = points.filter((_, index) => index % step === 0).map((point) => point.date);
  const last = points[points.length - 1]?.date;

  if (last && !ticks.includes(last)) {
    ticks.push(last);
  }

  return new Set(ticks);
}

function formatMoneyFull(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoneyCompact(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(value)} €`;
  }

  return `${Math.round(value)} €`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatDateShort(value: string) {
  return dayjs(value).format('DD.MM');
}

function formatDateLong(value: string) {
  return dayjs(value).format('DD MMMM');
}

function computeRelativeDelta(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function niceMax(value: number, steps = 4) {
  if (value <= 0) {
    return 1;
  }

  const roughStep = value / steps;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  let niceStep = 1;
  if (normalized > 1) niceStep = 2;
  if (normalized > 2) niceStep = 2.5;
  if (normalized > 2.5) niceStep = 5;
  if (normalized > 5) niceStep = 10;

  return Math.ceil(value / (niceStep * magnitude)) * niceStep * magnitude;
}

function nicePercentMax(value: number) {
  if (value <= 0) {
    return 10;
  }

  const rounded = Math.ceil(value / 5) * 5;
  return Math.min(100, Math.max(10, rounded));
}

function xAt(index: number, count: number, left: number, width: number) {
  if (count <= 1) {
    return left + width / 2;
  }

  return left + (index * width) / (count - 1);
}

function linePath(
  points: DailyPoint[],
  getValue: (point: DailyPoint) => number,
  left: number,
  top: number,
  width: number,
  height: number,
  maxValue: number,
) {
  return points
    .map((point, index) => {
      const x = xAt(index, points.length, left, width);
      const y = top + height - (getValue(point) / maxValue) * height;
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function areaPath(
  points: DailyPoint[],
  getValue: (point: DailyPoint) => number,
  left: number,
  top: number,
  width: number,
  height: number,
  maxValue: number,
) {
  if (points.length === 0) {
    return '';
  }

  const line = linePath(points, getValue, left, top, width, height, maxValue);
  const firstX = xAt(0, points.length, left, width);
  const lastX = xAt(points.length - 1, points.length, left, width);
  const baseline = top + height;
  return `${line} L${lastX},${baseline} L${firstX},${baseline} Z`;
}

function Delta({
  value,
  inverted = false,
  mode = 'relative',
}: {
  value: number | null;
  inverted?: boolean;
  mode?: 'relative' | 'points';
}) {
  if (value === null || !isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 10) / 10;
  const up = rounded > 0;
  const down = rounded < 0;
  const positive = inverted ? down : up;
  const negative = inverted ? up : down;
  const cls = positive
    ? 'chart-kpi__delta chart-kpi__delta--up'
    : negative
      ? 'chart-kpi__delta chart-kpi__delta--down'
      : 'chart-kpi__delta';
  const arrow = up ? '↑' : down ? '↓' : '·';
  const suffix = mode === 'points' ? ' п.п.' : '%';

  return (
    <span className={cls}>
      {arrow} {Math.abs(rounded).toFixed(1)}{suffix}
    </span>
  );
}

function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="chart-card__kpis">
      {items.map((item) => (
        <div className="chart-kpi" key={item.label}>
          <div className="chart-kpi__label">{item.label}</div>
          <div className={`chart-kpi__value${item.alert ? ' chart-kpi__value--alert' : ''}`}>
            {item.value}
          </div>
          <Delta value={item.delta} inverted={item.deltaInverted} mode={item.deltaMode} />
        </div>
      ))}
    </div>
  );
}

function PanelHeader({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="chart-panel__header">
      <div className="chart-panel__title">{title}</div>
      <div className="chart-legend chart-legend--panel">
        {items.map((item) => (
          <span key={item.label} className="chart-legend__item">
            <span className="chart-legend__dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tooltip({ state }: { state: HoverState }) {
  const { point, left, top } = state;
  const avgOrder = point.sales > 0 ? point.revenue / point.sales : 0;

  return (
    <div className="chart-tooltip" role="status" aria-live="polite" style={{ left, top }}>
      <strong>{formatDateLong(point.date)}</strong>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-legend__dot" style={{ background: COLOR_REVENUE }} />
          Продажи
        </span>
        <b>
          {formatMoneyFull(point.revenue)} · {formatNumber(point.sales)} шт · Ø {formatMoneyFull(avgOrder)}
        </b>
      </div>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-legend__dot" style={{ background: COLOR_REFUNDS }} />
          Возвраты
        </span>
        <b>
          {formatMoneyFull(point.refundRevenue)} · {formatNumber(point.refunds)} шт · {point.refundRate.toFixed(1)}%
        </b>
      </div>
    </div>
  );
}

function buildHoverState(point: DailyPoint, event: ReactMouseEvent<SVGRectElement>): HoverState {
  const svg = event.currentTarget.ownerSVGElement;
  const bounds = svg?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
  const left = event.clientX - bounds.left;
  const top = event.clientY - bounds.top;

  return { point, left, top };
}

function RevenueRefundChart({
  chartId,
  points,
  onHover,
}: {
  chartId: string;
  points: DailyPoint[];
  onHover: HoverHandler;
}) {
  const width = 920;
  const height = 180;
  const margin = { top: 16, right: 16, bottom: 10, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = niceMax(
    Math.max(
      ...points.flatMap((point) => [point.revenue, point.refundRevenue]),
      0,
    ),
  );
  const revenueLabels = pickPeakIndexes(points, (point) => point.revenue, points.length > 24 ? 4 : 5);
  const refundLabels = pickPeakIndexes(points, (point) => point.refundRevenue, points.length > 24 ? 4 : 5);
  const revenuePath = linePath(points, (point) => point.revenue, margin.left, margin.top, innerWidth, innerHeight, maxValue);
  const refundPath = linePath(points, (point) => point.refundRevenue, margin.left, margin.top, innerWidth, innerHeight, maxValue);
  const revenueArea = areaPath(points, (point) => point.revenue, margin.left, margin.top, innerWidth, innerHeight, maxValue);
  const stepWidth = points.length > 0 ? innerWidth / points.length : innerWidth;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="chart-svg"
      onMouseLeave={() => onHover(null)}
    >
      <defs>
        <linearGradient id={`${chartId}-revenue-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={COLOR_REVENUE} stopOpacity="0.26" />
          <stop offset="100%" stopColor={COLOR_REVENUE} stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {Array.from({ length: 4 }).map((_, index) => {
        const ratio = index / 3;
        const value = maxValue * (1 - ratio);
        const y = margin.top + innerHeight * ratio;

        return (
          <g key={value}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" className="chart-svg__axis-label">
              {formatMoneyCompact(value)}
            </text>
          </g>
        );
      })}

      {points.map((point, index) => {
        const x = margin.left + stepWidth * index;
        return (
          <rect
            key={point.date}
            x={x}
            y={margin.top}
            width={stepWidth}
            height={innerHeight}
            fill="transparent"
            pointerEvents="all"
            style={{ cursor: 'pointer' }}
            onMouseEnter={(event) => onHover(point, event)}
            onMouseMove={(event) => onHover(point, event)}
          />
        );
      })}

      <path d={revenueArea} fill={`url(#${chartId}-revenue-fill)`} />
      <path d={revenuePath} fill="none" stroke={COLOR_REVENUE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={refundPath} fill="none" stroke={COLOR_REFUNDS} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((point, index) => {
        const x = xAt(index, points.length, margin.left, innerWidth);
        const revenueY = margin.top + innerHeight - (point.revenue / maxValue) * innerHeight;
        const refundY = margin.top + innerHeight - (point.refundRevenue / maxValue) * innerHeight;

        return (
          <g key={`${point.date}-labels`}>
            {revenueLabels.has(index) && point.revenue > 0 && (
              <text x={x} y={revenueY - 8} textAnchor="middle" className="chart-svg__label">
                {formatMoneyCompact(point.revenue)}
              </text>
            )}
            {refundLabels.has(index) && point.refundRevenue > 0 && (
              <text x={x} y={refundY + 14} textAnchor="middle" className="chart-svg__label chart-svg__label--refund">
                {formatMoneyCompact(point.refundRevenue)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function UnitsRefundRateChart({
  points,
  onHover,
}: {
  points: DailyPoint[];
  onHover: HoverHandler;
}) {
  const width = 920;
  const height = 208;
  const margin = { top: 14, right: 54, bottom: 42, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const leftMax = niceMax(Math.max(...points.map((point) => point.sales), 0), 4);
  const rightMax = nicePercentMax(Math.max(...points.map((point) => point.refundRate), 0));
  const axisTicks = pickAxisTicks(points);
  const labelBudget = points.length > 24 ? 4 : 5;
  const salesLabels = pickPeakIndexes(points, (point) => point.sales, labelBudget);
  const refundLabels = pickPeakIndexes(points, (point) => point.refundRate, labelBudget);
  const bandWidth = points.length > 0 ? innerWidth / points.length : innerWidth;
  const barWidth = Math.min(28, bandWidth * 0.58);
  const refundPath = linePath(points, (point) => point.refundRate, margin.left, margin.top, innerWidth, innerHeight, rightMax);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="chart-svg"
      onMouseLeave={() => onHover(null)}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const ratio = index / 4;
        const y = margin.top + innerHeight * ratio;
        const leftValue = leftMax * (1 - ratio);
        const rightValue = rightMax * (1 - ratio);

        return (
          <g key={`grid-${index}`}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" className="chart-svg__axis-label">
              {formatNumber(leftValue)}
            </text>
            <text x={width - margin.right + 10} y={y + 4} textAnchor="start" className="chart-svg__axis-label chart-svg__axis-label--refund">
              {rightValue.toFixed(0)}%
            </text>
          </g>
        );
      })}

      {points.map((point, index) => {
        const x = margin.left + bandWidth * index;
        const barHeight = leftMax > 0 ? (point.sales / leftMax) * innerHeight : 0;
        const barX = x + bandWidth / 2 - barWidth / 2;
        const barY = margin.top + innerHeight - barHeight;

        return (
          <g key={point.date}>
            <rect
              x={x}
              y={margin.top}
              width={bandWidth}
              height={innerHeight}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(event) => onHover(point, event)}
              onMouseMove={(event) => onHover(point, event)}
            />

            <rect
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              rx={5}
              fill={COLOR_SALES_BAR}
              opacity="0.9"
            />

            {salesLabels.has(index) && point.sales > 0 && (
              <text x={barX + barWidth / 2} y={barY - 6} textAnchor="middle" className="chart-svg__label">
                {formatNumber(point.sales)}
              </text>
            )}
          </g>
        );
      })}

      <path d={refundPath} fill="none" stroke={COLOR_REFUNDS} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((point, index) => {
        const x = xAt(index, points.length, margin.left, innerWidth);
        const y = margin.top + innerHeight - (point.refundRate / rightMax) * innerHeight;
        const showTick = axisTicks.has(point.date);

        return (
          <g key={`${point.date}-refund`}>
            <circle cx={x} cy={y} r="3.4" fill={COLOR_REFUNDS} />
            {refundLabels.has(index) && point.refundRate > 0 && (
              <text x={x} y={y - 10} textAnchor="middle" className="chart-svg__label chart-svg__label--refund">
                {point.refundRate.toFixed(0)}%
              </text>
            )}
            {showTick && (
              <text x={x} y={height - 12} textAnchor="middle" className="chart-svg__axis-label">
                {formatDateShort(point.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function SalesRefundChart({ title, sales, comparisonSales }: Props) {
  const chartId = useId().replace(/:/g, '');
  const [hoveredRevenuePoint, setHoveredRevenuePoint] = useState<HoverState | null>(null);
  const [hoveredUnitsPoint, setHoveredUnitsPoint] = useState<HoverState | null>(null);
  const periodComparison = splitSalesCurrentAndPrevious(sales, comparisonSales);
  const summaryCurrent = summarizeSales(periodComparison.current);
  const summaryPrevious = summarizeSales(periodComparison.previous);
  const daily = buildDaily(periodComparison.current);
  const hasPrevious = periodComparison.previous.length > 0;
  const totalUnits = summaryCurrent.units + summaryCurrent.refundedUnits;
  const handleRevenueHover: HoverHandler = (point, event) => {
    if (!point || !event) {
      setHoveredRevenuePoint(null);
      return;
    }

    setHoveredRevenuePoint(buildHoverState(point, event));
  };
  const handleUnitsHover: HoverHandler = (point, event) => {
    if (!point || !event) {
      setHoveredUnitsPoint(null);
      return;
    }

    setHoveredUnitsPoint(buildHoverState(point, event));
  };

  const kpis = useMemo<Kpi[]>(() => ([
    {
      label: 'Выручка',
      value: formatMoneyCompact(summaryCurrent.revenue),
      delta: computeRelativeDelta(summaryCurrent.revenue, summaryPrevious.revenue),
    },
    {
      label: 'Продано, шт',
      value: formatNumber(summaryCurrent.units),
      delta: computeRelativeDelta(summaryCurrent.units, summaryPrevious.units),
    },
    {
      label: 'Средний чек',
      value: formatMoneyCompact(summaryCurrent.avgOrder),
      delta: computeRelativeDelta(summaryCurrent.avgOrder, summaryPrevious.avgOrder),
    },
    {
      label: 'Возвраты',
      value: `${summaryCurrent.refundRate.toFixed(1)}%`,
      delta: hasPrevious ? summaryCurrent.refundRate - summaryPrevious.refundRate : null,
      deltaMode: 'points',
      deltaInverted: true,
      alert: summaryCurrent.refundRate > REFUND_RATE_ALERT,
    },
  ]), [hasPrevious, summaryCurrent, summaryPrevious]);

  return (
    <div className="chart-card">
      <div className="chart-card__title">
        <div>
          <h3>{title}</h3>
          {hasPrevious && periodComparison.from && periodComparison.to ? (
            <div className="chart-card__subtitle">
              Сравнение с предыдущим периодом для окна {periodComparison.from}..{periodComparison.to}
            </div>
          ) : (
            <div className="chart-card__subtitle">Добавьте диапазон дат, чтобы видеть сравнение с предыдущим периодом.</div>
          )}
        </div>
        <div className="chart-card__title-right">
          <span>{daily.length} дн · {periodComparison.current.length} записей</span>
        </div>
      </div>

      {totalUnits === 0 ? (
        <div className="chart-card__body chart-card__body--stacked">
          <div className="chart-empty">Нет данных</div>
        </div>
      ) : (
        <>
          <KpiRow items={kpis} />
          <div className="chart-card__body chart-card__body--stacked">
            <div className="chart-card__panel chart-card__panel--top">
              <PanelHeader
                title="Динамика выручки и суммы возвратов, €"
                items={[
                  { label: 'Выручка', color: COLOR_REVENUE },
                  { label: 'Возвраты', color: COLOR_REFUNDS },
                ]}
              />
              <div className="chart-card__plot">
                {hoveredRevenuePoint && <Tooltip state={hoveredRevenuePoint} />}
                <RevenueRefundChart chartId={chartId} points={daily} onHover={handleRevenueHover} />
              </div>
            </div>

            <div className="chart-card__panel chart-card__panel--bottom">
              <PanelHeader
                title="Объем продаж (шт.) и доля возвратов (%)"
                items={[
                  { label: 'Продажи, шт', color: COLOR_SALES_BAR },
                  { label: 'Возвраты, %', color: COLOR_REFUNDS },
                ]}
              />
              <div className="chart-card__plot">
                {hoveredUnitsPoint && <Tooltip state={hoveredUnitsPoint} />}
                <UnitsRefundRateChart points={daily} onHover={handleUnitsHover} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
