import { useMemo, useState } from 'react';
import { Segmented } from 'antd';
import dayjs from 'dayjs';
import type { CatalogData, LieferantSeries, SaleRecord } from '../../types';
import { formatMetricValue } from '../../utils/analytics';

type MetricMode = 'revenue' | 'units';

interface Props {
  sales?: SaleRecord[];
  catalog: CatalogData;
  dateRange: [string, string] | null;
  series?: LieferantSeries[];
  activeLieferanten: string[];
  onToggleLieferant: (lieferant: string) => void;
}

const LIEFERANT_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#14b8a6', '#f97316'];

function buildDateKeys(sales: SaleRecord[], dateRange: [string, string] | null) {
  let from = dateRange?.[0] ?? null;
  let to = dateRange?.[1] ?? null;

  if (!from || !to) {
    const salesDates = sales
      .map((sale) => sale.bestelldatum?.slice(0, 10))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right));

    from = salesDates[0] ?? null;
    to = salesDates[salesDates.length - 1] ?? null;
  }

  if (!from || !to) {
    return [];
  }

  const days: string[] = [];
  let cursor = dayjs(from);
  const end = dayjs(to);

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }

  return days;
}

function buildLieferantSeries(
  sales: SaleRecord[],
  catalog: CatalogData,
  dateRange: [string, string] | null,
) {
  const dateKeys = buildDateKeys(sales, dateRange);
  const dayIndex = new Map(dateKeys.map((date, index) => [date, index]));
  const seriesMap = new Map<string, LieferantSeries>();

  for (const sale of sales) {
    const day = sale.bestelldatum?.slice(0, 10);
    const daySlot = day ? dayIndex.get(day) : undefined;

    if (daySlot === undefined) {
      continue;
    }

    const lieferant = sale.artikelposition
      ? catalog.products[sale.artikelposition]?.lieferant ?? 'Без поставщика'
      : 'Без поставщика';
    const entry = seriesMap.get(lieferant) ?? {
      lieferant,
      totalRevenue: 0,
      totalUnits: 0,
      dailyRevenue: Array(dateKeys.length).fill(0),
      dailyUnits: Array(dateKeys.length).fill(0),
    };

    entry.totalRevenue += sale.totalInclTax ?? 0;
    entry.totalUnits += sale.qtyOrdered ?? 0;
    entry.dailyRevenue[daySlot] += sale.totalInclTax ?? 0;
    entry.dailyUnits[daySlot] += sale.qtyOrdered ?? 0;

    seriesMap.set(lieferant, entry);
  }

  return Array.from(seriesMap.values());
}

function getLieferantColor(lieferant: string) {
  let hash = 0;

  for (const char of lieferant) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return LIEFERANT_COLORS[hash % LIEFERANT_COLORS.length];
}

function formatRevenueShort(value: number) {
  const compact = value >= 1000;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);

  return `${formatted} €`;
}

function formatUnitsShort(value: number) {
  return `${formatMetricValue('units', value, value >= 1000)} шт`;
}

function RowSparkline({ points, color }: { points: number[]; color: string }) {
  const width = 58;
  const height = 18;
  const pad = 1.5;

  if (points.length === 0) {
    return <div className="sidebar-lieferant-row__spark sidebar-lieferant-row__spark--empty" />;
  }

  const max = Math.max(...points, 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const linePoints = points
    .map((value, index) => `${pad + index * step},${y(value)}`)
    .join(' ');
  const areaPoints = `${linePoints} ${pad + (points.length - 1) * step},${height - pad} ${pad},${height - pad}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="sidebar-lieferant-row__spark">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1" />
      <polygon points={areaPoints} fill={color} opacity="0.18" />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SidebarLieferantPanel({
  sales = [],
  catalog,
  dateRange,
  series,
  activeLieferanten,
  onToggleLieferant,
}: Props) {
  const [metricMode, setMetricMode] = useState<MetricMode>('revenue');
  const [showOverflow, setShowOverflow] = useState(false);
  const lieferantSeries = useMemo(
    () => series ?? buildLieferantSeries(sales, catalog, dateRange),
    [catalog, dateRange, sales, series],
  );
  const rows = useMemo(() => {
    return [...lieferantSeries]
      .sort((left, right) => {
        if (metricMode === 'units') {
          return right.totalUnits - left.totalUnits || right.totalRevenue - left.totalRevenue;
        }

        return right.totalRevenue - left.totalRevenue || right.totalUnits - left.totalUnits;
      });
  }, [lieferantSeries, metricMode]);
  const topRows = rows.slice(0, 6);
  const overflowRows = rows.slice(6);
  const overflowContainsActive = overflowRows.some((row) => activeLieferanten.includes(row.lieferant));
  const overflowVisible = showOverflow || overflowContainsActive;

  if (rows.length === 0) {
    return <div className="sidebar-lieferant-empty">Нет данных по поставщикам в текущем срезе.</div>;
  }

  const renderRow = (row: LieferantSeries) => {
    const color = getLieferantColor(row.lieferant);
    const primaryValue = metricMode === 'revenue'
      ? formatRevenueShort(row.totalRevenue)
      : formatUnitsShort(row.totalUnits);
    const secondaryValue = metricMode === 'revenue'
      ? formatUnitsShort(row.totalUnits)
      : formatRevenueShort(row.totalRevenue);
    const isActive = activeLieferanten.includes(row.lieferant);

    return (
      <button
        key={row.lieferant}
        type="button"
        className={`sidebar-lieferant-row${isActive ? ' sidebar-lieferant-row--active' : ''}`}
        onClick={() => onToggleLieferant(row.lieferant)}
        aria-pressed={isActive}
      >
        <span className="sidebar-lieferant-row__meta">
          <i className="sidebar-lieferant-row__dot" style={{ background: color }} />
          <span className="sidebar-lieferant-row__name" title={row.lieferant}>
            {row.lieferant}
          </span>
        </span>

        <RowSparkline
          points={metricMode === 'revenue' ? row.dailyRevenue : row.dailyUnits}
          color={color}
        />

        <span className="sidebar-lieferant-row__values">
          <strong className="sidebar-lieferant-row__value">{primaryValue}</strong>
          <span className="sidebar-lieferant-row__subvalue">{secondaryValue}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="sidebar-lieferant-card">
      <Segmented
        block
        size="small"
        className="sidebar-lieferant-toggle"
        value={metricMode}
        onChange={(value) => setMetricMode(value as MetricMode)}
        options={[
          { label: '€', value: 'revenue' },
          { label: 'шт', value: 'units' },
        ]}
      />

      <div className="sidebar-lieferant-list">
        {topRows.map(renderRow)}
      </div>

      {overflowRows.length > 0 && (
        <div className="sidebar-lieferant-more">
          <button
            type="button"
            className="sidebar-lieferant-more__button"
            onClick={() => setShowOverflow((value) => !value)}
            aria-expanded={overflowVisible}
          >
            {overflowVisible ? 'Скрыть остальных' : `Ещё ${overflowRows.length} поставщиков`}
          </button>

          {overflowVisible && (
            <div className="sidebar-lieferant-list sidebar-lieferant-list--overflow">
              {overflowRows.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
