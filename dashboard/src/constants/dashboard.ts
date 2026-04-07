import type { DashboardSettings, GroupOption, MetricOption } from '../types';

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  groupBy: 'supplier',
  primaryMetric: 'revenue',
  secondaryMetric: 'profit',
};

export const METRIC_OPTIONS: MetricOption[] = [
  {
    value: 'revenue',
    label: 'Revenue',
    shortLabel: 'Revenue',
    hint: 'Total Incl. Tax across the current selection',
  },
  {
    value: 'profit',
    label: 'Profit',
    shortLabel: 'Profit',
    hint: 'Total Profit from visible rows',
  },
  {
    value: 'orders',
    label: 'Orders',
    shortLabel: 'Orders',
    hint: 'Unique order count',
  },
  {
    value: 'units',
    label: 'Units',
    shortLabel: 'Units',
    hint: 'Qty. Ordered aggregated by group',
  },
  {
    value: 'refunds',
    label: 'Refunds',
    shortLabel: 'Refunds',
    hint: 'Refunded Incl. Tax total',
  },
  {
    value: 'margin',
    label: 'Margin',
    shortLabel: 'Margin',
    hint: 'Profit share of revenue',
  },
  {
    value: 'avgOrder',
    label: 'Average Order',
    shortLabel: 'AOV',
    hint: 'Revenue divided by visible orders',
  },
];

export const GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'supplier',
    label: 'Supplier',
    hint: 'Aggregate by supplier mapping from the catalog',
  },
  {
    value: 'artikelposition',
    label: 'SKU',
    hint: 'Break down by child SKU',
  },
  {
    value: 'parentSku',
    label: 'Parent SKU',
    hint: 'Roll child variants into their parent group',
  },
  {
    value: 'channel',
    label: 'Sales Channel',
    hint: 'Derived from customer group, email, and supplier context',
  },
  {
    value: 'status',
    label: 'Order Status',
    hint: 'Closed vs Complete and other sale states',
  },
  {
    value: 'kundengruppe',
    label: 'Customer Group',
    hint: 'Amazon Customer, Retailer, and other buyer clusters',
  },
];

export const NAV_ITEMS = [
  { id: 'overview', label: 'Selection lens' },
  { id: 'table', label: 'Sales table' },
] as const;
