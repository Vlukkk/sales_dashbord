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
}

interface ChartDatum {
  x: string;
  y: number;
  date: string;
  sales: number;
  refunds: number;
  refundRate: number;
  revenue: number;
  label?: string;
}

interface ChartSeries {
  id: 'Продажи' | 'Возвраты';
  data: ChartDatum[];
}

function buildDaily(sales: EnrichedSale[]): DailyPoint[] {
  const map = new Map<string, { sales: number; refunds: number; revenue: number }>();

  for (const s of sales) {
    const day = s.bestelldatum?.slice(0, 10);
    if (!day) continue;
    const cur = map.get(day) ?? { sales: 0, refunds: 0, revenue: 0 };
    cur.sales += s.qtyOrdered ?? 0;
    cur.refunds += s.qtyRefunded ?? 0;
    cur.revenue += s.totalInclTax ?? 0;
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
    const current = map.get(date) ?? { sales: 0, refunds: 0, revenue: 0 };
    days.push({
      date,
      sales: current.sales,
      refunds: current.refunds,
      refundRate: current.sales > 0 ? (current.refunds / current.sales) * 100 : 0,
      revenue: current.revenue,
    });
    cursor = cursor.add(1, 'day');
  }

  return days;
}

function pickSalesLabelIndexes(points: DailyPoint[]) {
  const activeIndexes = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.sales > 0);
  const budget = points.length > 24 ? 4 : 6;
  const picked = new Set<number>();

  if (activeIndexes.length === 0) {
    return picked;
  }

  picked.add(activeIndexes[0].index);
  picked.add(activeIndexes[activeIndexes.length - 1].index);

  const peaks = activeIndexes
    .filter(({ point, index }) => {
      const prev = points[index - 1]?.sales ?? 0;
      const next = points[index + 1]?.sales ?? 0;
      return point.sales >= prev && point.sales >= next;
    })
    .sort((left, right) => right.point.sales - left.point.sales);

  for (const { index } of peaks) {
    picked.add(index);
    if (picked.size >= budget) {
      break;
    }
  }

  return picked;
}

function pickRefundLabelIndexes(points: DailyPoint[]) {
  const refundDays = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.refunds > 0)
    .sort((left, right) => {
      if (right.point.refunds !== left.point.refunds) {
        return right.point.refunds - left.point.refunds;
      }

      return right.point.refundRate - left.point.refundRate;
    });

  return new Set(refundDays.slice(0, points.length > 24 ? 5 : 7).map(({ index }) => index));
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

function buildSeries(points: DailyPoint[]): ChartSeries[] {
  const salesLabels = pickSalesLabelIndexes(points);
  const refundLabels = pickRefundLabelIndexes(points);

  return [
    {
      id: 'Продажи',
      data: points.map((point, index) => ({
        x: point.date,
        y: point.sales,
        ...point,
        label: salesLabels.has(index) ? formatMoney(point.revenue) : undefined,
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

export default function SalesRefundChart({ title, sales }: Props) {
  const daily = useMemo(() => buildDaily(sales), [sales]);
  const series = useMemo(() => buildSeries(daily), [daily]);
  const axisTicks = useMemo(() => pickAxisTicks(daily), [daily]);
  const total = daily.reduce((sum, point) => sum + point.sales + point.refunds, 0);

  return (
    <div className="chart-card">
      <div className="chart-card__title">
        <h3>{title}</h3>
        <span>{daily.length} дн · {sales.length} записей</span>
      </div>
      <div className="chart-card__body">
        {total === 0 ? (
          <div className="chart-empty">Нет данных</div>
        ) : (
          <ResponsiveLine<ChartSeries>
            data={series}
            margin={{ top: 36, right: 28, bottom: 48, left: 56 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
            curve="monotoneX"
            colors={['#2563eb', '#ef4444']}
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
                  const datum = point.data;

                  return (
                    <div key={point.id} className="chart-tooltip__row">
                      <span style={{ color: point.seriesColor }}>{point.seriesId}</span>
                      <b>
                        {formatNumber(Number(datum.y))} шт
                        {point.seriesId === 'Возвраты'
                          ? ` · ${datum.refundRate.toFixed(1)}%`
                          : ` · ${formatMoney(datum.revenue)}`}
                      </b>
                    </div>
                  );
                })}
              </div>
            )}
            theme={{
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
            }}
            layers={[
              'grid',
              'markers',
              'axes',
              'areas',
              'lines',
              'points',
              PointLabelLayer,
              'slices',
              'legends',
            ]}
            legends={[
              {
                anchor: 'top-right',
                direction: 'row',
                translateY: -12,
                itemWidth: 90,
                itemHeight: 14,
                symbolSize: 10,
                symbolShape: 'square',
                itemTextColor: '#0f172a',
              },
            ]}
            animate={false}
          />
        )}
      </div>
    </div>
  );
}
