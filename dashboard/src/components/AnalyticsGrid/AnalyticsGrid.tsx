import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveCalendar } from '@nivo/calendar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import type { GroupByKey, MetricKey } from '../../types';
import { GROUP_OPTIONS, METRIC_OPTIONS } from '../../constants/dashboard';
import {
  type DailyTrendSeries,
  type GroupBreakdownItem,
  type InventorySummary,
  formatAxisValue,
  formatMetricValue,
} from '../../utils/analytics';

interface ScatterNodeDatum {
  x: number;
  y: number;
  group: string;
  orders: number;
  revenue: number;
  profit: number;
  units: number;
}

interface Props {
  trend: DailyTrendSeries;
  breakdown: GroupBreakdownItem[];
  pieData: Array<{ id: string; label: string; value: number }>;
  scatterData: Array<{ id: string; data: ScatterNodeDatum[] }>;
  calendar: {
    from: string;
    to: string;
    data: Array<{ day: string; value: number }>;
  };
  groupBy: GroupByKey;
  primaryMetric: MetricKey;
  secondaryMetric: MetricKey;
  inventorySummary: InventorySummary;
  bestDayLabel: string;
}

const palette = ['#67d9ff', '#79f1c4', '#ffc76a', '#98aef8', '#ff8e9e', '#c9d6ff'];

const nivoTheme = {
  text: {
    fill: '#dce8ff',
    fontSize: 12,
  },
  axis: {
    domain: {
      line: {
        stroke: 'rgba(255,255,255,0.08)',
      },
    },
    ticks: {
      line: {
        stroke: 'rgba(255,255,255,0.08)',
      },
      text: {
        fill: '#8fa4cb',
        fontSize: 11,
      },
    },
    legend: {
      text: {
        fill: '#b4c3df',
        fontSize: 12,
      },
    },
  },
  grid: {
    line: {
      stroke: 'rgba(255,255,255,0.07)',
      strokeDasharray: '4 4',
    },
  },
  legends: {
    text: {
      fill: '#dce8ff',
    },
  },
  tooltip: {
    container: {
      background: '#11182f',
      color: '#eff4ff',
      borderRadius: '14px',
      boxShadow: '0 18px 45px rgba(0, 0, 0, 0.35)',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '10px 12px',
    },
  },
} as const;

function EmptyCard({ message }: { message: string }) {
  return <div className="chart-empty">{message}</div>;
}

function chartTitle(groupBy: GroupByKey) {
  return GROUP_OPTIONS.find((option) => option.value === groupBy)?.label ?? groupBy;
}

function metricTitle(metric: MetricKey) {
  return METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric;
}

function truncateLabel(label: string, max = 18) {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

export default function AnalyticsGrid({
  trend,
  breakdown,
  pieData,
  scatterData,
  calendar,
  groupBy,
  primaryMetric,
  secondaryMetric,
  inventorySummary,
  bestDayLabel,
}: Props) {
  const primaryLabel = metricTitle(primaryMetric);
  const secondaryLabel = metricTitle(secondaryMetric);
  const groupLabel = chartTitle(groupBy);

  return (
    <section className="analytics-grid">
      <article id="signals" className="chart-card chart-card--wide">
        <div className="chart-card__header">
          <div>
            <span className="chart-card__eyebrow">Daily signal</span>
            <h3>{primaryLabel} with rolling average</h3>
          </div>
          <span className="chart-card__meta">Best day: {bestDayLabel}</span>
        </div>
        <div className="chart-card__body chart-card__body--line">
          {trend.series[0]?.data.length > 0 ? (
            <ResponsiveLine
              data={trend.series}
              theme={nivoTheme}
              margin={{ top: 16, right: 24, bottom: 54, left: 68 }}
              colors={['#67d9ff', '#79f1c4']}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', min: 0, max: 'auto' }}
              curve="catmullRom"
              enableArea
              areaOpacity={0.08}
              lineWidth={3}
              pointSize={6}
              pointColor="#0b1020"
              pointBorderWidth={2}
              pointBorderColor={{ from: 'serieColor' }}
              enableGridX={false}
              enableSlices="x"
              axisBottom={{ tickSize: 0, tickPadding: 12 }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 10,
                format: (value) => formatAxisValue(primaryMetric, Number(value)),
              }}
              useMesh
              tooltip={({ point }) => (
                <div className="chart-tooltip">
                  <strong>{point.seriesId}</strong>
                  <span>{String(point.data.x)}</span>
                  <span>{formatMetricValue(primaryMetric, Number(point.data.y))}</span>
                </div>
              )}
            />
          ) : (
            <EmptyCard message="No visible data for the current filters." />
          )}
        </div>
      </article>

      <article className="chart-card">
        <div className="chart-card__header">
          <div>
            <span className="chart-card__eyebrow">Breakdown</span>
            <h3>{primaryLabel} by {groupLabel}</h3>
          </div>
          <span className="chart-card__meta">FBA sellable: {inventorySummary.sellable}</span>
        </div>
        <div className="chart-card__body">
          {breakdown.length > 0 ? (
            <ResponsiveBar
              data={breakdown.map((item) => ({
                group: truncateLabel(item.label, 24),
                fullLabel: item.label,
                value: item[primaryMetric],
              }))}
              theme={nivoTheme}
              keys={['value']}
              indexBy="group"
              layout="horizontal"
              margin={{ top: 16, right: 16, bottom: 32, left: 124 }}
              padding={0.3}
              borderRadius={10}
              colors={palette}
              enableLabel={false}
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 0,
                tickPadding: 10,
                format: (value) => formatAxisValue(primaryMetric, Number(value)),
              }}
              axisLeft={{ tickSize: 0, tickPadding: 12 }}
              tooltip={({ data }) => (
                <div className="chart-tooltip">
                  <strong>{String(data.fullLabel)}</strong>
                  <span>{primaryLabel}</span>
                  <span>{formatMetricValue(primaryMetric, Number(data.value))}</span>
                </div>
              )}
            />
          ) : (
            <EmptyCard message="No groups available for this selection." />
          )}
        </div>
      </article>

      <article className="chart-card">
        <div className="chart-card__header">
          <div>
            <span className="chart-card__eyebrow">Distribution</span>
            <h3>{groupLabel} share</h3>
          </div>
          <span className="chart-card__meta">Low stock SKU: {inventorySummary.lowStockSkus}</span>
        </div>
        <div className="chart-card__body">
          {pieData.length > 0 ? (
            <ResponsivePie
              data={pieData}
              theme={nivoTheme}
              margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
              innerRadius={0.62}
              padAngle={1.5}
              cornerRadius={5}
              activeOuterRadiusOffset={10}
              colors={palette}
              borderWidth={1}
              borderColor="rgba(255,255,255,0.1)"
              enableArcLinkLabels={false}
              arcLabelsSkipAngle={9}
              arcLabelsTextColor="#09111f"
              tooltip={({ datum }) => (
                <div className="chart-tooltip">
                  <strong>{String(datum.id)}</strong>
                  <span>{primaryLabel}</span>
                  <span>{formatMetricValue(primaryMetric, Number(datum.value))}</span>
                </div>
              )}
            />
          ) : (
            <EmptyCard message="Nothing to distribute after filtering." />
          )}
        </div>
      </article>

      <article id="matrix" className="chart-card">
        <div className="chart-card__header">
          <div>
            <span className="chart-card__eyebrow">Metric matrix</span>
            <h3>{primaryLabel} vs {secondaryLabel}</h3>
          </div>
          <span className="chart-card__meta">{groupLabel} points</span>
        </div>
        <div className="chart-card__body">
          {scatterData.length > 0 ? (
            <ResponsiveScatterPlot
              data={scatterData}
              theme={nivoTheme}
              margin={{ top: 20, right: 20, bottom: 70, left: 78 }}
              xScale={{ type: 'linear', min: 0, max: 'auto' }}
              yScale={{ type: 'linear', min: 0, max: 'auto' }}
              colors={palette}
              blendMode="multiply"
              axisBottom={{
                tickSize: 0,
                tickPadding: 10,
                legend: primaryLabel,
                legendPosition: 'middle',
                legendOffset: 48,
                format: (value) => formatAxisValue(primaryMetric, Number(value)),
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 10,
                legend: secondaryLabel,
                legendPosition: 'middle',
                legendOffset: -56,
                format: (value) => formatAxisValue(secondaryMetric, Number(value)),
              }}
              nodeSize={12}
              useMesh
              tooltip={({ node }) => {
                const datum = node.data as unknown as ScatterNodeDatum;

                return (
                  <div className="chart-tooltip">
                    <strong>{datum.group}</strong>
                    <span>{primaryLabel}: {formatMetricValue(primaryMetric, datum.x)}</span>
                    <span>{secondaryLabel}: {formatMetricValue(secondaryMetric, datum.y)}</span>
                    <span>Orders: {formatMetricValue('orders', datum.orders)}</span>
                  </div>
                );
              }}
            />
          ) : (
            <EmptyCard message="No groups to compare on the current metric matrix." />
          )}
        </div>
      </article>

      <article id="calendar" className="chart-card">
        <div className="chart-card__header">
          <div>
            <span className="chart-card__eyebrow">Calendar heatmap</span>
            <h3>Daily revenue intensity</h3>
          </div>
          <span className="chart-card__meta">{calendar.from} → {calendar.to}</span>
        </div>
        <div className="chart-card__body">
          {calendar.data.length > 0 ? (
            <ResponsiveCalendar
              data={calendar.data}
              theme={nivoTheme}
              from={calendar.from}
              to={calendar.to}
              emptyColor="rgba(255,255,255,0.03)"
              colors={['#13253b', '#184b63', '#2f92b2', '#79f1c4']}
              margin={{ top: 32, right: 20, bottom: 18, left: 20 }}
              yearSpacing={30}
              monthBorderColor="rgba(255,255,255,0.08)"
              dayBorderWidth={2}
              dayBorderColor="#0b1020"
              tooltip={({ day, value }) => (
                <div className="chart-tooltip">
                  <strong>{day}</strong>
                  <span>Revenue</span>
                  <span>{formatMetricValue('revenue', Number(value ?? 0))}</span>
                </div>
              )}
            />
          ) : (
            <EmptyCard message="Calendar is empty for the current slice." />
          )}
        </div>
      </article>
    </section>
  );
}
