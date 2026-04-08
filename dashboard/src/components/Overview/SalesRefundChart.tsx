import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import type { LineCustomSvgLayerProps } from '@nivo/line';
import dayjs from 'dayjs';
import type { EnrichedSale } from '../../types';
import { summarizeSales } from '../../utils/analytics';

interface Props {
  title: string;
  sales: EnrichedSale[];
}

interface DailyPoint {
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  refundRevenue: number;
}

interface ChartDatum {
  x: string;
  y: number;
  label?: string;
}

type SeriesId = 'Продажи' | 'Возвраты';

interface ChartSeries {
  id: SeriesId;
  data: ChartDatum[];
}

const COLOR_SALES = '#6366f1';
const COLOR_REFUNDS = '#f43f5e';
const COLOR_POSITIVE = '#10b981';
const REFUND_RATE_ALERT = 10;

function buildDaily(sales: EnrichedSale[]): DailyPoint[] {
  const map = new Map<
    string,
    { sales: number; refunds: number; revenue: number; refundRevenue: number }
  >();

  for (const s of sales) {
    const day = s.bestelldatum?.slice(0, 10);
    if (!day) continue;
    const cur = map.get(day) ?? { sales: 0, refunds: 0, revenue: 0, refundRevenue: 0 };
    cur.sales += s.qtyOrdered ?? 0;
    cur.refunds += s.qtyRefunded ?? 0;
    cur.revenue += s.totalInclTax ?? 0;
    cur.refundRevenue += s.refundedInclTax ?? 0;
    map.set(day, cur);
  }

  const dates = [...map.keys()].sort();
  if (dates.length === 0) return [];

  const days: DailyPoint[] = [];
  let cursor = dayjs(dates[0]);
  const end = dayjs(dates[dates.length - 1]);

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const date = cursor.format('YYYY-MM-DD');
    const current =
      map.get(date) ?? { sales: 0, refunds: 0, revenue: 0, refundRevenue: 0 };
    days.push({
      date,
      sales: current.sales,
      refunds: current.refunds,
      refundRate: current.sales > 0 ? (current.refunds / current.sales) * 100 : 0,
      revenue: current.revenue,
      refundRevenue: current.refundRevenue,
    });
    cursor = cursor.add(1, 'day');
  }

  return days;
}

function pickPeakIndexes(
  points: DailyPoint[],
  getValue: (p: DailyPoint) => number,
  budget: number,
) {
  const picked = new Set<number>();
  if (points.length === 0 || budget <= 0) return picked;

  // Разбиваем график на N сегментов равной ширины и в каждом берём локальный максимум.
  // Это даёт равномерное распределение подписей по оси X.
  const bucketCount = Math.min(budget, points.length);
  const bucketSize = points.length / bucketCount;

  for (let b = 0; b < bucketCount; b += 1) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(points.length, Math.floor((b + 1) * bucketSize));
    let bestIdx = -1;
    let bestVal = 0;
    for (let i = start; i < end; i += 1) {
      const v = getValue(points[i]);
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) picked.add(bestIdx);
  }

  return picked;
}

function PointLabelLayer({ points }: LineCustomSvgLayerProps<ChartSeries>) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {points
        .filter((point) => (point.data as ChartDatum).label)
        .map((point) => {
          const isRefund = point.seriesId === 'Возвраты';
          const offset = isRefund ? 12 : -8;
          return (
            <text
              key={point.id}
              x={point.x}
              y={point.y + offset}
              textAnchor="middle"
              fontSize={isRefund ? 9 : 10}
              fontWeight={500}
              fill={isRefund ? '#f87171' : '#64748b'}
              stroke={isRefund ? undefined : '#ffffff'}
              strokeWidth={isRefund ? 0 : 3}
              paintOrder="stroke"
            >
              {(point.data as ChartDatum).label}
            </text>
          );
        })}
    </g>
  );
}

function pickAxisTicks(points: DailyPoint[]) {
  if (points.length <= 8) return points.map((p) => p.date);
  const step = Math.ceil(points.length / 8);
  const ticks = points.filter((_, i) => i % step === 0).map((p) => p.date);
  const last = points[points.length - 1].date;
  return ticks.includes(last) ? ticks : [...ticks, last];
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

function computeDelta(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function splitCurrentAndPrevious(sales: EnrichedSale[]) {
  const dates = sales
    .map((s) => s.bestelldatum?.slice(0, 10))
    .filter((v): v is string => Boolean(v))
    .sort();
  if (dates.length === 0) return { current: sales, previous: [] as EnrichedSale[] };

  const from = dayjs(dates[0]);
  const to = dayjs(dates[dates.length - 1]);
  const spanDays = to.diff(from, 'day') + 1;
  const prevFrom = from.subtract(spanDays, 'day');
  const prevTo = from.subtract(1, 'day');

  const current: EnrichedSale[] = [];
  const previous: EnrichedSale[] = [];
  for (const s of sales) {
    const day = s.bestelldatum?.slice(0, 10);
    if (!day) continue;
    const d = dayjs(day);
    if (d.isSame(from, 'day') || (d.isAfter(from, 'day') && (d.isBefore(to, 'day') || d.isSame(to, 'day')))) {
      current.push(s);
    } else if (
      (d.isSame(prevFrom, 'day') || d.isAfter(prevFrom, 'day')) &&
      (d.isSame(prevTo, 'day') || d.isBefore(prevTo, 'day'))
    ) {
      previous.push(s);
    }
  }
  return { current, previous };
}

const CHART_THEME = {
  text: { fill: '#94a3b8', fontSize: 10 },
  axis: {
    ticks: { text: { fill: '#94a3b8', fontSize: 10 } },
    domain: { line: { stroke: 'transparent' } },
  },
  grid: { line: { stroke: '#f1f5f9', strokeDasharray: '2 4' } },
  crosshair: { line: { stroke: '#cbd5f5', strokeWidth: 1, strokeDasharray: '3 3' } },
};

const GRADIENT_DEFS = [
  {
    id: 'sales-gradient',
    type: 'linearGradient',
    colors: [
      { offset: 0, color: COLOR_SALES, opacity: 0.35 },
      { offset: 100, color: COLOR_SALES, opacity: 0 },
    ],
  },
  {
    id: 'refunds-gradient',
    type: 'linearGradient',
    colors: [
      { offset: 0, color: COLOR_REFUNDS, opacity: 0.28 },
      { offset: 100, color: COLOR_REFUNDS, opacity: 0 },
    ],
  },
];

const GRADIENT_FILL = [
  { match: { id: 'Продажи' as const }, id: 'sales-gradient' },
  { match: { id: 'Возвраты' as const }, id: 'refunds-gradient' },
];

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaInverted?: boolean;
  alert?: boolean;
}

function Delta({ value, inverted = false }: { value: number | null; inverted?: boolean }) {
  if (value === null || !isFinite(value)) return null;
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
  return (
    <span className={cls}>
      {arrow} {Math.abs(rounded).toFixed(1)}%
    </span>
  );
}

function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="chart-card__kpis">
      {items.map((k) => (
        <div className="chart-kpi" key={k.label}>
          <div className="chart-kpi__label">{k.label}</div>
          <div className={`chart-kpi__value${k.alert ? ' chart-kpi__value--alert' : ''}`}>
            {k.value}
          </div>
          <Delta value={k.delta} inverted={k.deltaInverted} />
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="chart-legend">
      <span className="chart-legend__item">
        <span className="chart-legend__dot" style={{ background: COLOR_SALES }} />
        Продажи
      </span>
      <span className="chart-legend__item">
        <span className="chart-legend__dot" style={{ background: COLOR_REFUNDS }} />
        Возвраты
      </span>
    </div>
  );
}

function Tooltip({ point }: { point: DailyPoint }) {
  const aov = point.sales > 0 ? point.revenue / point.sales : 0;
  return (
    <div className="chart-tooltip chart-tooltip--dark">
      <strong>{formatDateLong(point.date)}</strong>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-legend__dot" style={{ background: COLOR_SALES }} />
          Продажи
        </span>
        <b>
          {formatMoneyFull(point.revenue)} · {formatNumber(point.sales)} шт · Ø{' '}
          {formatMoneyFull(aov)}
        </b>
      </div>
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__label">
          <span className="chart-legend__dot" style={{ background: COLOR_REFUNDS }} />
          Возвраты
        </span>
        <b>
          {formatMoneyFull(point.refundRevenue)} · {formatNumber(point.refunds)} шт ·{' '}
          {point.refundRate.toFixed(1)}%
        </b>
      </div>
    </div>
  );
}

export default function SalesRefundChart({ title, sales }: Props) {
  const daily = useMemo(() => buildDaily(sales), [sales]);

  const { current, previous } = useMemo(() => splitCurrentAndPrevious(sales), [sales]);
  const summaryCurrent = useMemo(() => summarizeSales(current), [current]);
  const summaryPrevious = useMemo(() => summarizeSales(previous), [previous]);

  const dailyByDate = useMemo(() => {
    const m = new Map<string, DailyPoint>();
    for (const p of daily) m.set(p.date, p);
    return m;
  }, [daily]);

  const revenueSeries = useMemo<ChartSeries[]>(() => {
    const budget = daily.length > 24 ? 4 : 5;
    const salesPeaks = pickPeakIndexes(daily, (p) => p.revenue, budget);
    const refundPeaks = pickPeakIndexes(daily, (p) => p.refundRevenue, budget);
    return [
      {
        id: 'Продажи',
        data: daily.map((p, i) => ({
          x: p.date,
          y: p.revenue,
          label: salesPeaks.has(i) ? formatMoneyCompact(p.revenue) : undefined,
        })),
      },
      {
        id: 'Возвраты',
        data: daily.map((p, i) => ({
          x: p.date,
          y: p.refundRevenue,
          label: refundPeaks.has(i) ? formatMoneyCompact(p.refundRevenue) : undefined,
        })),
      },
    ];
  }, [daily]);

  const unitsSeries = useMemo<ChartSeries[]>(() => {
    const budget = daily.length > 24 ? 4 : 5;
    const salesPeaks = pickPeakIndexes(daily, (p) => p.sales, budget);
    const refundPeaks = pickPeakIndexes(daily, (p) => p.refunds, budget);
    return [
      {
        id: 'Продажи',
        data: daily.map((p, i) => ({
          x: p.date,
          y: p.sales,
          label: salesPeaks.has(i) ? `${formatNumber(p.sales)} шт` : undefined,
        })),
      },
      {
        id: 'Возвраты',
        data: daily.map((p, i) => ({
          x: p.date,
          y: p.refunds,
          label: refundPeaks.has(i) ? `${p.refundRate.toFixed(0)}%` : undefined,
        })),
      },
    ];
  }, [daily]);

  const axisTicks = useMemo(() => pickAxisTicks(daily), [daily]);
  const totalUnits = summaryCurrent.units + summaryCurrent.refundedUnits;

  const kpis = useMemo<Kpi[]>(() => {
    return [
      {
        label: 'Выручка',
        value: formatMoneyCompact(summaryCurrent.revenue),
        delta: computeDelta(summaryCurrent.revenue, summaryPrevious.revenue),
      },
      {
        label: 'Продано, шт',
        value: formatNumber(summaryCurrent.units),
        delta: computeDelta(summaryCurrent.units, summaryPrevious.units),
      },
      {
        label: 'Ø чек',
        value: formatMoneyCompact(summaryCurrent.avgOrder),
        delta: computeDelta(summaryCurrent.avgOrder, summaryPrevious.avgOrder),
      },
      {
        label: 'Возвраты',
        value: `${summaryCurrent.refundRate.toFixed(1)}%`,
        delta: computeDelta(summaryCurrent.refundRate, summaryPrevious.refundRate),
        deltaInverted: true,
        alert: summaryCurrent.refundRate > REFUND_RATE_ALERT,
      },
    ];
  }, [summaryCurrent, summaryPrevious]);

  const renderTooltip = ({ slice }: { slice: { points: { data: { x: string | number } }[] } }) => {
    const x = String(slice.points[0].data.x);
    const point = dailyByDate.get(x);
    if (!point) return null;
    return <Tooltip point={point} />;
  };

  return (
    <div className="chart-card">
      <div className="chart-card__title">
        <h3>{title}</h3>
        <div className="chart-card__title-right">
          <Legend />
          <span>{daily.length} дн · {sales.length} записей</span>
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
              <ResponsiveLine<ChartSeries>
                data={revenueSeries}
                margin={{ top: 22, right: 24, bottom: 6, left: 56 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                curve="monotoneX"
                colors={[COLOR_SALES, COLOR_REFUNDS]}
                lineWidth={2}
                enableArea
                areaOpacity={1}
                defs={GRADIENT_DEFS}
                fill={GRADIENT_FILL}
                enablePoints={false}
                enableGridX={false}
                gridYValues={3}
                axisBottom={null}
                axisLeft={{
                  tickSize: 0,
                  tickPadding: 8,
                  format: (v) => formatMoneyCompact(Number(v)),
                }}
                enableSlices="x"
                useMesh={false}
                sliceTooltip={renderTooltip}
                theme={CHART_THEME}
                legends={[]}
                layers={['grid', 'markers', 'axes', 'areas', 'lines', 'points', PointLabelLayer, 'slices', 'legends']}
                animate={false}
              />
            </div>
            <div className="chart-card__panel chart-card__panel--bottom">
              <ResponsiveLine<ChartSeries>
                data={unitsSeries}
                margin={{ top: 18, right: 24, bottom: 42, left: 56 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                curve="monotoneX"
                colors={[COLOR_SALES, COLOR_REFUNDS]}
                lineWidth={2}
                enableArea
                areaOpacity={1}
                defs={GRADIENT_DEFS}
                fill={GRADIENT_FILL}
                enablePoints={false}
                enableGridX={false}
                gridYValues={3}
                axisBottom={{
                  tickValues: axisTicks,
                  tickRotation: -30,
                  tickPadding: 8,
                  format: (v) => formatDateShort(String(v)),
                }}
                axisLeft={{
                  tickSize: 0,
                  tickPadding: 8,
                  format: (v) => `${Number(v)}`,
                }}
                enableSlices="x"
                useMesh={false}
                sliceTooltip={renderTooltip}
                theme={CHART_THEME}
                legends={[]}
                layers={['grid', 'markers', 'axes', 'areas', 'lines', 'points', PointLabelLayer, 'slices', 'legends']}
                animate={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
