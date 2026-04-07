import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { CatalogData, SaleRecord } from '../../types';
import { formatMetricValue, type InventorySummary, type MetricSummary } from '../../utils/analytics';

interface Props {
  filteredSales: SaleRecord[];
  catalog: CatalogData;
  summary: MetricSummary;
  inventorySummary: InventorySummary;
  dateWindowLabel: string;
}

interface DailyPoint {
  date: string;
  orders: number;
  units: number;
  refunds: number;
}

function buildDaily(sales: SaleRecord[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const s of sales) {
    if (!s.bestelldatum) continue;
    const key = dayjs(s.bestelldatum).format('YYYY-MM-DD');
    const entry = map.get(key) ?? { date: key, orders: 0, units: 0, refunds: 0 };
    entry.orders += 1;
    entry.units += s.qtyOrdered ?? 0;
    entry.refunds += s.qtyRefunded ?? 0;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function Sparkline({ points }: { points: DailyPoint[] }) {
  const w = 360;
  const h = 80;
  const pad = 6;
  if (points.length === 0) return <div className="mini-chart-empty">No data</div>;

  const max = Math.max(
    ...points.flatMap((p) => [p.orders, p.units, p.refunds]),
    1,
  );
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = (key: 'orders' | 'units' | 'refunds') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${pad + i * step},${y(p[key])}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mini-chart mini-chart--line">
      <path d={`${line('units')} L${pad + (points.length - 1) * step},${h - pad} L${pad},${h - pad} Z`} fill="url(#sparkFill)" opacity="0.35" />
      <path d={line('units')} stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line('orders')} stroke="var(--mint)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line('refunds')} stroke="var(--rose)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#67d9ff" />
          <stop offset="100%" stopColor="#67d9ff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MiniBars({ data }: { data: { label: string; value: number }[] }) {
  const w = 300;
  const h = 80;
  const pad = 6;
  if (data.length === 0) return <div className="mini-chart-empty">No data</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = (w - pad * 2) / data.length;
  const bw = slot - 6;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mini-chart mini-chart--bars">
      {data.map((d, i) => {
        const bh = (d.value / max) * (h - pad * 2);
        const x = pad + i * slot + 3;
        return (
          <g key={d.label}>
            <rect x={x} y={h - pad - bh} width={bw} height={bh} rx={3} fill="url(#barGrad)" />
            <text x={x + bw / 2} y={h - pad - bh - 4} fill="#cfe0ff" fontSize="9" textAnchor="middle">{d.value}</text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#67d9ff" />
          <stop offset="100%" stopColor="#79f1c4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const size = 100;
  const r = 44;
  const inner = 28;
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const segments = slices.map((slice, index) => {
    const start = slices
      .slice(0, index)
      .reduce((sum, item) => sum + (item.value / total) * Math.PI * 2, -Math.PI / 2);
    const angle = (slice.value / total) * Math.PI * 2;

    return { ...slice, start, angle };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mini-chart mini-chart--donut">
      {segments.map((s) => {
        const x1 = cx + r * Math.cos(s.start);
        const y1 = cy + r * Math.sin(s.start);
        const x2 = cx + r * Math.cos(s.start + s.angle);
        const y2 = cy + r * Math.sin(s.start + s.angle);
        const x3 = cx + inner * Math.cos(s.start + s.angle);
        const y3 = cy + inner * Math.sin(s.start + s.angle);
        const x4 = cx + inner * Math.cos(s.start);
        const y4 = cy + inner * Math.sin(s.start);
        const large = s.angle > Math.PI ? 1 : 0;
        const d = [
          `M${x1},${y1}`,
          `A${r},${r} 0 ${large} 1 ${x2},${y2}`,
          `L${x3},${y3}`,
          `A${inner},${inner} 0 ${large} 0 ${x4},${y4}`,
          'Z',
        ].join(' ');
        return <path key={s.label} d={d} fill={s.color} />;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="18" fontFamily="JetBrains Mono, monospace" fill="#eff4ff">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="#9db1d6" letterSpacing="1">ORDERS</text>
    </svg>
  );
}

export default function CompactHero({ filteredSales, catalog, summary, inventorySummary, dateWindowLabel }: Props) {
  const daily = useMemo(() => buildDaily(filteredSales), [filteredSales]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSales) {
      const product = s.artikelposition ? catalog.products[s.artikelposition] : null;
      const key = product?.supplier ?? 'Unknown';
      map.set(key, (map.get(key) ?? 0) + (s.qtyOrdered ?? 0));
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filteredSales, catalog]);

  const statusSlices = useMemo(() => {
    const palette = ['#67d9ff', '#79f1c4', '#ffc76a', '#ff8e9e', '#a78bfa'];
    const map = new Map<string, number>();
    for (const s of filteredSales) {
      const key = s.status ?? 'Unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  }, [filteredSales]);

  const kpis = [
    { label: 'Orders', value: formatMetricValue('orders', summary.orders), note: `${summary.activeSkus} active SKU` },
    { label: 'Units', value: formatMetricValue('units', summary.units), note: `${formatMetricValue('refundRate', summary.refundRate)} returned` },
    { label: 'Refunded', value: formatMetricValue('units', summary.refundedUnits), note: `${summary.refundOrders} orders` },
    { label: 'Sellable FBA', value: formatMetricValue('units', inventorySummary.sellable), note: `${inventorySummary.skusWithStock} stocked` },
    { label: 'Low stock', value: formatMetricValue('units', inventorySummary.lowStockSkus), note: 'under 4 units' },
  ];

  return (
    <section className="compact-hero">
      <div className="compact-hero__top">
        <div className="compact-hero__title">
          <span className="compact-hero__eyebrow">Filter-driven SKU analysis · {dateWindowLabel}</span>
          <h2>Sales pulse</h2>
        </div>
        <div className="compact-hero__charts">
          <div className="compact-chart">
            <span className="compact-chart__label">Daily flow</span>
            <Sparkline points={daily} />
            <div className="compact-chart__legend">
              <span><i style={{ background: 'var(--accent)' }} />Units</span>
              <span><i style={{ background: 'var(--mint)' }} />Orders</span>
              <span><i style={{ background: 'var(--rose)' }} />Refunds</span>
            </div>
          </div>
          <div className="compact-chart">
            <span className="compact-chart__label">Top suppliers</span>
            <MiniBars data={topSuppliers} />
            <div className="compact-chart__legend">
              <span>{topSuppliers.length} suppliers</span>
            </div>
          </div>
          <div className="compact-chart compact-chart--donut">
            <span className="compact-chart__label">Status mix</span>
            <div className="compact-chart__donut-body">
              <Donut slices={statusSlices} />
              <ul className="compact-chart__legend-list">
                {statusSlices.map((s) => {
                  const total = statusSlices.reduce((a, b) => a + b.value, 0) || 1;
                  const pct = Math.round((s.value / total) * 100);
                  return (
                    <li key={s.label}>
                      <i style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <strong>{pct}%</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="compact-hero__kpis">
        {kpis.map((k) => (
          <div key={k.label} className="compact-kpi">
            <span className="compact-kpi__label">{k.label}</span>
            <strong className="compact-kpi__value">{k.value}</strong>
            <span className="compact-kpi__note">{k.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
