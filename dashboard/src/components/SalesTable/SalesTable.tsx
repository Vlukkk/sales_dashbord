import { useMemo } from 'react';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { SaleRecord } from '../../types';
import { ALL_SALES_COLUMNS, YELLOW_COLUMNS } from '../../constants/columns';

interface Props {
  data: SaleRecord[];
  visibleColumns: Set<string>;
  onRowClick: (sku: string) => void;
}

const fmt = (v: number | null) => (v != null ? `${v.toFixed(2)} €` : '—');
const fmtPct = (v: number | null) => (v != null ? `${v}%` : '—');

export default function SalesTable({ data, visibleColumns, onRowClick }: Props) {
  const columns: ColumnsType<SaleRecord> = useMemo(() => {
    return ALL_SALES_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((col) => {
      const isYellow = (YELLOW_COLUMNS as readonly string[]).includes(col.key);
      const base: ColumnsType<SaleRecord>[number] = {
        title: col.title,
        dataIndex: col.key,
        key: col.key,
        sorter: (a: SaleRecord, b: SaleRecord) => {
          const av = a[col.key];
          const bv = b[col.key];
          if (av == null && bv == null) return 0;
          if (av == null) return -1;
          if (bv == null) return 1;
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          return String(av).localeCompare(String(bv));
        },
        onHeaderCell: () => ({
          style: isYellow ? { background: 'rgba(103, 217, 255, 0.08)', color: '#cfe6ff' } : {},
        }),
        ellipsis: true,
      };

      if (col.key === 'bestelldatum') {
        base.render = (v: string) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—');
        base.width = 150;
      } else if (col.isMoney) {
        base.render = (v: number | null) => fmt(v);
        base.align = 'right';
        base.width = 120;
      } else if (col.isPercent) {
        base.render = (v: number | null) => fmtPct(v);
        base.align = 'right';
        base.width = 90;
      } else if (col.isQty) {
        base.align = 'right';
        base.width = 80;
      }

      return base;
    });
  }, [visibleColumns]);

  const summary = useMemo(() => {
    const totalInclTax = data.reduce((s, r) => s + (r.totalInclTax || 0), 0);
    const totalProfit = data.reduce((s, r) => s + (r.totalProfit || 0), 0);
    const totalRevenue = data.reduce((s, r) => s + (r.totalRevenue || 0), 0);
    return { totalInclTax, totalProfit, totalRevenue, count: data.length };
  }, [data]);

  return (
    <div className="sales-table-shell">
      <div className="sales-table-summary">
        <Typography.Text strong>Bestellungen: {summary.count}</Typography.Text>
        <Typography.Text>Total Incl. Tax: <strong>{fmt(summary.totalInclTax)}</strong></Typography.Text>
        {visibleColumns.has('totalRevenue') && (
          <Typography.Text>Revenue: <strong>{fmt(summary.totalRevenue)}</strong></Typography.Text>
        )}
        {visibleColumns.has('totalProfit') && (
          <Typography.Text>Profit: <strong>{fmt(summary.totalProfit)}</strong></Typography.Text>
        )}
      </div>
      <Table<SaleRecord>
        dataSource={data}
        columns={columns}
        rowKey={(r) => `${r.bestellungNr}-${r.artikelposition}`}
        className="sales-table"
        size="small"
        pagination={{
          pageSize: 10,
          pageSizeOptions: [10, 25, 50, 100],
          showSizeChanger: true,
          showTotal: (t) => `${t} Zeilen`,
        }}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({
          onClick: () => record.artikelposition && onRowClick(record.artikelposition),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}
