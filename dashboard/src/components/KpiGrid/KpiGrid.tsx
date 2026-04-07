import type { InventorySummary, GroupBreakdownItem, MetricSummary } from '../../utils/analytics';
import { formatMetricValue } from '../../utils/analytics';

interface Props {
  summary: MetricSummary;
  inventory: InventorySummary;
  topGroup: GroupBreakdownItem | null;
  filteredShare: number;
  bestDayLabel: string;
}

const KPI_CONFIG = [
  { key: 'revenue', label: 'Revenue', accent: 'cyan' },
  { key: 'profit', label: 'Profit', accent: 'mint' },
  { key: 'orders', label: 'Orders', accent: 'amber' },
  { key: 'avgOrder', label: 'Avg Order', accent: 'ice' },
  { key: 'refundRate', label: 'Refund Rate', accent: 'rose' },
  { key: 'stock', label: 'FBA Stock', accent: 'slate' },
] as const;

export default function KpiGrid({ summary, inventory, topGroup, filteredShare, bestDayLabel }: Props) {
  const values = {
    revenue: formatMetricValue('revenue', summary.revenue, true),
    profit: formatMetricValue('profit', summary.profit, true),
    orders: formatMetricValue('orders', summary.orders),
    avgOrder: formatMetricValue('avgOrder', summary.avgOrder),
    refundRate: formatMetricValue('refundRate', summary.refundRate),
    stock: formatMetricValue('units', inventory.sellable),
  };

  const notes = {
    revenue: topGroup ? `Leader: ${topGroup.label}` : `${filteredShare.toFixed(1)}% of total revenue`,
    profit: `Margin ${formatMetricValue('margin', summary.margin)}`,
    orders: `${formatMetricValue('units', summary.units)} units ordered`,
    avgOrder: `${summary.activeSkus} active SKU in selection`,
    refundRate: `Refunded ${formatMetricValue('refunds', summary.refunds, true)}`,
    stock: `${inventory.skusWithStock} stocked SKU · ${inventory.lowStockSkus} low`,
  };

  return (
    <section id="overview" className="kpi-grid">
      {KPI_CONFIG.map((card) => (
        <article key={card.key} className={`kpi-card kpi-card--${card.accent}`}>
          <span className="kpi-card__label">{card.label}</span>
          <strong className="kpi-card__value">{values[card.key]}</strong>
          <span className="kpi-card__note">
            {card.key === 'avgOrder' ? bestDayLabel : notes[card.key]}
          </span>
        </article>
      ))}
    </section>
  );
}
