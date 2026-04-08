import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import type { LineCustomSvgLayerProps } from '@nivo/line';
import dayjs from 'dayjs';
import type { EnrichedSale } from '../../types';

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
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  refundRevenue: number;
  label?: string;
}

type SeriesId = 'Продажи' | 'Возвраты';

interface ChartSeries {
  id: SeriesId;
  data: ChartDatum[];
}

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
  if (dates.length === 0) {
    return [];
  }

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
  const active = points
    .map((point, index) => ({ point, index, value: getValue(point) }))
    .filter(({ value }) => value > 0);

  const picked = new Set<number>();
  if (active.length === 0) return picked;

  picked.add(active[0].index);
  picked.add(active[active.length - 1].index);

  const peaks = active
    .filter(({ index, value }) => {
      const prev = index > 0 ? getValue(points[index - 1]) : 0;
      const next = index < points.length - 1 ? getValue(points[index + 1]) : 0;
      return value >= prev && value >= next;
    })
    .sort((l, r) => r.value - l.value);

  for (const { index } of peaks) {
    picked.add(index);
    if (picked.size >= budget) break;
  }

  return picked;
}

function pickRefundLabelIndexes(points: DailyPoint[]) {
  const refundDays = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.refunds > 0)
    .sort((l, r) => {
      if (r.point.refunds !== l.point.refunds) return r.point.refunds - l.point.refunds;
      return r.point.refundRate - l.point.refundRate;
    });

  return new Set(
    refundDays.slice(0, points.length > 24 ? 5 : 7).map(({ index }) => index),
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return dayjs(value).format('DD.MM');
}

function buildRevenueSeries(points: DailyPoint[]): ChartSeries[] {
  const budget = points.length > 24 ? 4 : 6;
  const salesLabels = pickPeakIndexes(points, (p) => p.revenue, budget);
  const refundLabels = pickPeakIndexes(points, (p) => p.refundRevenue, budget);

  return [
    {
      id: 'Продажи',
      data: points.map((point, index) => ({
        x: point.date,
        y: point.revenue,
        ...point,
        label: salesLabels.has(index) ? formatMoney(point.revenue) : undefined,
      })),
    },
    {
      id: 'Возвраты',
      data: points.map((point, index) => ({
        x: point.date,
        y: point.refundRevenue,
        ...point,
        label: refundLabels.has(index) ? formatMoney(point.refundRevenue) : undefined,
      })),
    },
  ];
}

function buildUnitsSeries(points: DailyPoint[]): ChartSeries[] {
  const budget = points.length > 24 ? 4 : 6;
  const salesLabels = pickPeakIndexes(points, (p) => p.sales, budget);
  const refundLabels = pickRefundLabelIndexes(points);

  return [
    {
      id: 'Продажи',
      data: points.map((point, index) => ({
        x: point.date,
        y: point.sales,
        ...point,
        label: salesLabels.has(index) ? `${formatNumber(point.sales)} шт` : undefined,
      })),
    },
    {
      id: 'Возвраты',
      data: points.map((point, index) => ({
        x: point.date,
        y: point.refunds,
        ...point,
        label: refundLabels.has(index) ? `${point.refundRate.toFixed(0)}%` : undefined,
      })),
    },
  ];
}

function pickAxisTicks(points: DailyPoint[]) {
  if (points.length <= 8) {
    return points.map((point) => point.date);
  }

  const step = Math.ceil(points.length / 8);
  const ticks = points.filter((_, index) => index % step === 0).map((point) => point.date);
  const last = points[points.length - 1].date;

  return ticks.includes(last) ? ticks : [...ticks, last];
}

function PointLabelLayer({ points }: LineCustomSvgLayerProps<ChartSeries>) {
  return (
    <g>
      {points
        .filter((point) => point.data.label)
        .map((point) => {
          const isRefund = point.seriesId === 'Возвраты';
          const offset = point.y < 24 ? 18 : isRefund ? -18 : -16;

          return (
            <text
              key={point.id}
              x={point.x}
              y={point.y + offset}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={isRefund ? '#dc2626' : '#1d4ed8'}
              stroke="#ffffff"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {point.data.label}
            </text>
          );
        })}
    </g>
  );
}

const COLORS = ['#2563eb', '#ef4444'];

const CHART_THEME = {
  text: { fill: '#64748b', fontSize: 11 },
  axis: {
    ticks: { text: { fill: '#64748b' } },
    domain: { line: { stroke: '#e2e8f0' } },
  },
  grid: { line: { stroke: '#eef2f7' } },
  tooltip: {
    container: {
      background: '#ffffff',
      color: '#0f172a',
      fontSize: 12,
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
    },
  },
};

const LAYERS = [
  'grid',
  'markers',
  'axes',
  'areas',
  'lines',
  'points',
  PointLabelLayer,
  'slices',
  'legends',
] as const;

export default function SalesRefundChart({ title, sales }: Props) {
  const daily = useMemo(() => buildDaily(sales), [sales]);
  const revenueSeries = useMemo(() => buildRevenueSeries(daily), [daily]);
  const unitsSeries = useMemo(() => buildUnitsSeries(daily), [daily]);
  const axisTicks = useMemo(() => pickAxisTicks(daily), [daily]);
  const totalUnits = daily.reduce((sum, point) => sum + point.sales + point.refunds, 0);

  return (
    <div className="chart-card">
      <div className="chart-card__title">
        <h3>{title}</h3>
        <span>{daily.length} дн · {sales.length} записей</span>
      </div>
      <div className="chart-card__body chart-card__body--stacked">
        {totalUnits === 0 ? (
          <div className="chart-empty">Нет данных</div>
        ) : (
          <>
            <div className="chart-card__panel chart-card__panel--top">
              <ResponsiveLine<ChartSeries>
                data={revenueSeries}
                margin={{ top: 30, right: 28, bottom: 8, left: 64 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                curve="monotoneX"
                colors={COLORS}
                lineWidth={3}
                enableArea
                areaOpacity={0.06}
                enablePoints
                pointSize={4}
                pointColor="#ffffff"
                pointBorderWidth={1.5}
                pointBorderColor={{ from: 'seriesColor' }}
                enableGridX={false}
                gridYValues={4}
                axisBottom={null}
                axisLeft={{
                  tickSize: 0,
                  tickPadding: 6,
                  legend: 'Выручка, €',
                  legendOffset: -52,
                  legendPosition: 'middle',
                  format: (value) => formatMoney(Number(value)),
                }}
                enablePointLabel={false}
                enableSlices="x"
                useMesh={false}
                sliceTooltip={({ slice }) => (
                  <div className="chart-tooltip">
                    <strong>{formatDate(String(slice.points[0].data.x))}</strong>
                    {slice.points.map((point) => {
                      const datum = point.data as unknown as ChartDatum;
                      return (
                        <div key={point.id} className="chart-tooltip__row">
                          <span style={{ color: point.seriesColor }}>{point.seriesId}</span>
                          <b>{formatMoney(Number(datum.y))}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
                theme={CHART_THEME}
                layers={[...LAYERS]}
                legends={[
                  {
                    anchor: 'top-right',
                    direction: 'row',
                    translateY: -22,
                    itemWidth: 90,
                    itemHeight: 14,
                    symbolSize: 10,
                    symbolShape: 'square',
                    itemTextColor: '#0f172a',
                  },
                ]}
                animate={false}
              />
            </div>
            <div className="chart-card__panel chart-card__panel--bottom">
              <ResponsiveLine<ChartSeries>
                data={unitsSeries}
                margin={{ top: 14, right: 28, bottom: 48, left: 64 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                curve="monotoneX"
                colors={COLORS}
                lineWidth={3}
                enableArea
                areaOpacity={0.06}
                enablePoints
                pointSize={4}
                pointColor="#ffffff"
                pointBorderWidth={1.5}
                pointBorderColor={{ from: 'seriesColor' }}
                enableGridX={false}
                gridYValues={4}
                axisBottom={{
                  tickValues: axisTicks,
                  tickRotation: -40,
                  format: (value) => formatDate(String(value)),
                }}
                axisLeft={{
                  tickSize: 0,
                  tickPadding: 6,
                  legend: 'Кол-во, шт',
                  legendOffset: -42,
                  legendPosition: 'middle',
                }}
                enablePointLabel={false}
                enableSlices="x"
                useMesh={false}
                sliceTooltip={({ slice }) => (
                  <div className="chart-tooltip">
                    <strong>{formatDate(String(slice.points[0].data.x))}</strong>
                    {slice.points.map((point) => {
                      const datum = point.data as unknown as ChartDatum;
                      return (
                        <div key={point.id} className="chart-tooltip__row">
                          <span style={{ color: point.seriesColor }}>{point.seriesId}</span>
                          <b>
                            {formatNumber(Number(datum.y))} шт
                            {point.seriesId === 'Возвраты'
                              ? ` · ${datum.refundRate.toFixed(1)}%`
                              : ''}
                          </b>
                        </div>
                      );
                    })}
                  </div>
                )}
                theme={CHART_THEME}
                layers={[...LAYERS]}
                animate={false}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
