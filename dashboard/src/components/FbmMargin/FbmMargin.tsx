import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, Segmented, Space, Table, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import { useFbmMarginData } from '../../hooks/useFbmMarginData';
import type { FbmMarginDetailRow, FbmMarginRow, FilterState } from '../../types';
import { downloadCsv, downloadExcelWorkbook, type ExportColumn } from '../../utils/tableExport';

const fmtMoney = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
const fmtPct = (value: number) => `${value.toFixed(1)}%`;
const fmtNum = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);

interface Props {
  filters: FilterState;
}

function buildFilterSummary(filters: FilterState) {
  const parts: string[] = [];

  if (filters.dateRange) {
    parts.push(`Дата: ${filters.dateRange[0]}..${filters.dateRange[1]}`);
  }
  if (filters.artikelposition.length > 0) {
    parts.push(`SKU: ${filters.artikelposition.join(', ')}`);
  }
  if (filters.parentSku.length > 0) {
    parts.push(`Parent: ${filters.parentSku.join(', ')}`);
  }
  if (filters.lieferant.length > 0) {
    parts.push(`Поставщик: ${filters.lieferant.join(', ')}`);
  }
  if (filters.status.length > 0) {
    parts.push(`Статус: ${filters.status.join(', ')}`);
  }
  if (filters.channel.length > 0) {
    parts.push(`Канал: ${filters.channel.join(', ')}`);
  }
  if (filters.kundengruppe.length > 0) {
    parts.push(`Группа: ${filters.kundengruppe.join(', ')}`);
  }
  if (filters.bestellungNr.trim()) {
    parts.push(`Заказ: ${filters.bestellungNr.trim()}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Все заказы B...';
}

const ORDER_EXPORT_COLUMNS: ExportColumn<FbmMarginRow>[] = [
  { key: 'orderNumber', header: 'Заказ', type: 'string', width: 130, value: (row) => row.orderNumber },
  { key: 'date', header: 'Дата', type: 'string', width: 90, value: (row) => row.date ? dayjs(row.date).format('DD.MM.YYYY') : '' },
  { key: 'channel', header: 'Канал', type: 'string', width: 70, value: (row) => row.channel },
  { key: 'saleNet', header: 'Продажа нетто', type: 'currency', width: 95, value: (row) => row.saleNet },
  { key: 'costNet', header: 'Binder нетто', type: 'currency', width: 95, value: (row) => row.costNet },
  { key: 'amazonCommission', header: 'Amazon commission', type: 'currency', width: 95, value: (row) => row.amazonCommission },
  { key: 'fixedCost', header: 'Фикс', type: 'currency', width: 65, value: (row) => row.fixedCost },
  { key: 'margin', header: 'Маржа €', type: 'currency', width: 85, value: (row) => row.margin },
  { key: 'marginPercent', header: 'Маржа %', type: 'percent', width: 70, value: (row) => row.marginPercent },
  { key: 'invoiceNumbers', header: 'Счета Binder', type: 'string', width: 140, value: (row) => row.invoiceNumbers },
];

const DETAIL_EXPORT_COLUMNS: ExportColumn<FbmMarginDetailRow>[] = [
  { key: 'orderNumber', header: 'Заказ', type: 'string', width: 130, value: (row) => row.orderNumber },
  { key: 'date', header: 'Дата', type: 'string', width: 90, value: (row) => row.date ? dayjs(row.date).format('DD.MM.YYYY') : '' },
  { key: 'sku', header: 'SKU', type: 'string', width: 110, value: (row) => row.sku },
  { key: 'productName', header: 'Товар', type: 'string', width: 220, value: (row) => row.productName ?? '' },
  { key: 'saleNet', header: 'Продажа нетто', type: 'currency', width: 95, value: (row) => row.saleNet },
  {
    key: 'allocatedCostGross',
    header: 'Binder нетто',
    type: 'currency',
    width: 95,
    value: (row) => row.hasBinderMatch ? Number(((row.allocatedCostGross ?? 0) / 1.19).toFixed(2)) : 0,
  },
  { key: 'amazonCommission', header: 'Amazon commission', type: 'currency', width: 95, value: (row) => row.amazonCommission },
  { key: 'fixedCost', header: 'Фикс', type: 'currency', width: 65, value: (row) => row.fixedCost },
  { key: 'margin', header: 'Маржа €', type: 'currency', width: 85, value: (row) => row.margin },
  { key: 'marginPercent', header: 'Маржа %', type: 'percent', width: 70, value: (row) => row.marginPercent },
  { key: 'invoiceNumbers', header: 'Счета Binder', type: 'string', width: 130, value: (row) => row.invoiceNumbers },
  { key: 'productCodes', header: 'Binder коды', type: 'string', width: 140, value: (row) => row.productCodes },
  { key: 'descriptions', header: 'Binder описание', type: 'string', width: 220, value: (row) => row.descriptions },
];

const metaTextStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
  color: '#6b7280',
};

function renderOrderMeta(date: string, invoiceNumbers: string) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span>{date ? dayjs(date).format('DD.MM.YYYY') : '-'}</span>
      {invoiceNumbers ? <span style={metaTextStyle}>{invoiceNumbers}</span> : null}
    </div>
  );
}

function renderBinderInfo(invoiceTypes: string, productCodes: string, descriptions: string) {
  const parts = [invoiceTypes, productCodes, descriptions].filter(Boolean);
  if (parts.length === 0) {
    return '-';
  }

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {parts.map((value) => (
        <span key={value} style={metaTextStyle}>
          {value}
        </span>
      ))}
    </div>
  );
}

export default function FbmMargin({ filters }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [viewMode, setViewMode] = useState<'orders' | 'details'>('orders');

  const params = useMemo(
    () => ({
      filters,
      page,
      pageSize,
      sortBy,
      sortDir,
      includeDetails: viewMode === 'details',
    }),
    [filters, page, pageSize, sortBy, sortDir, viewMode],
  );

  const { rows, detailRows, total, summary, loading } = useFbmMarginData(params);
  const filterSummary = useMemo(() => buildFilterSummary(filters), [filters]);

  useEffect(() => {
    setPage(1);
  }, [filterSummary]);

  const matchedOrders = Math.max(0, summary.orderCount - summary.unmatchedOrders);

  const orderColumns: ColumnsType<FbmMarginRow> = [
    {
      title: 'Заказ / Binder',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      sorter: true,
      width: 170,
      render: (value: string, row) => (
        <div style={{ display: 'grid', gap: 2, opacity: row.hasBinderMatch ? 1 : 0.6 }}>
          <span style={{ fontWeight: 600 }}>{value}</span>
          {row.invoiceNumbers ? <span style={metaTextStyle}>{row.invoiceNumbers}</span> : null}
        </div>
      ),
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      sorter: true,
      width: 95,
      render: (value: string) => (value ? dayjs(value).format('DD.MM.YYYY') : '-'),
    },
    {
      title: 'Канал',
      dataIndex: 'channel',
      key: 'channel',
      sorter: true,
      width: 80,
    },
    {
      title: 'Продажа нетто',
      dataIndex: 'saleNet',
      key: 'saleNet',
      sorter: true,
      width: 120,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Binder нетто',
      dataIndex: 'costNet',
      key: 'costNet',
      width: 120,
      align: 'right',
      render: (value: number, row) => (
        <span style={{ color: row.hasBinderMatch ? undefined : '#999' }}>
          {row.hasBinderMatch ? fmtMoney(value) : '-'}
        </span>
      ),
    },
    {
      title: 'Commission',
      dataIndex: 'amazonCommission',
      key: 'amazonCommission',
      sorter: true,
      width: 115,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Фикс',
      dataIndex: 'fixedCost',
      key: 'fixedCost',
      width: 85,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Маржа €',
      dataIndex: 'margin',
      key: 'margin',
      sorter: true,
      width: 110,
      align: 'right',
      render: (value: number, row) => (
        <span style={{ color: row.hasBinderMatch && value >= 0 ? '#16a34a' : '#111827', fontWeight: 600 }}>
          {row.hasBinderMatch ? fmtMoney(value) : '-'}
        </span>
      ),
    },
    {
      title: 'Маржа %',
      dataIndex: 'marginPercent',
      key: 'marginPercent',
      sorter: true,
      width: 85,
      align: 'right',
      render: (value: number, row) => (
        <span style={{ color: row.hasBinderMatch && value >= 0 ? '#16a34a' : '#111827' }}>
          {row.hasBinderMatch ? fmtPct(value) : '-'}
        </span>
      ),
    },
  ];

  const detailColumns: ColumnsType<FbmMarginDetailRow> = [
    {
      title: 'Заказ',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 180,
      render: (value: string, row) => (
        <div style={{ display: 'grid', gap: 2, opacity: row.hasBinderMatch ? 1 : 0.6 }}>
          <span style={{ fontWeight: 600 }}>{value}</span>
          {renderOrderMeta(row.date, row.invoiceNumbers)}
        </div>
      ),
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
    },
    {
      title: 'Товар',
      dataIndex: 'productName',
      key: 'productName',
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: 'Продажа нетто',
      dataIndex: 'saleNet',
      key: 'saleNet',
      width: 115,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Binder нетто',
      dataIndex: 'allocatedCostGross',
      key: 'allocatedCostGross',
      width: 115,
      align: 'right',
      render: (value: number | null, row) => (
        <span style={{ color: row.hasBinderMatch ? undefined : '#999' }}>
          {row.hasBinderMatch ? fmtMoney((value ?? 0) / 1.19) : '-'}
        </span>
      ),
    },
    {
      title: 'Commission',
      dataIndex: 'amazonCommission',
      key: 'amazonCommission',
      width: 110,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Фикс',
      dataIndex: 'fixedCost',
      key: 'fixedCost',
      width: 85,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Маржа €',
      dataIndex: 'margin',
      key: 'margin',
      width: 110,
      align: 'right',
      render: (value: number, row) => (
        <span style={{ color: row.hasBinderMatch && value >= 0 ? '#16a34a' : '#111827', fontWeight: 600 }}>
          {row.hasBinderMatch ? fmtMoney(value) : '-'}
        </span>
      ),
    },
    {
      title: 'Binder',
      key: 'binder',
      width: 240,
      render: (_value, row) => renderBinderInfo(row.invoiceTypes, row.productCodes, row.descriptions),
    },
  ];

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<FbmMarginRow> | SorterResult<FbmMarginRow>[],
  ) => {
    const resolvedSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    if (resolvedSorter.columnKey && resolvedSorter.order) {
      setSortBy(String(resolvedSorter.columnKey));
      setSortDir(resolvedSorter.order === 'ascend' ? 'ASC' : 'DESC');
    }
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 10);
  };

  const exportSubtitle = filterSummary;

  const handleExportExcel = () => {
    const sheets: any[] = [
      {
        title: 'FBM Маржа',
        worksheetName: 'FBM Margin',
        subtitle: exportSubtitle,
        columns: ORDER_EXPORT_COLUMNS,
        rows,
      },
    ];

    if (detailRows.length > 0) {
      sheets.push({
        title: 'FBM Маржа · детали',
        worksheetName: 'FBM Details',
        subtitle: `Детализация по текущей странице: ${exportSubtitle}`,
        columns: DETAIL_EXPORT_COLUMNS,
        rows: detailRows,
      });
    }

    downloadExcelWorkbook<any>('fbm-margin.xls', sheets);
  };

  const handleExportCsv = () => {
    downloadCsv({
      title: 'FBM Маржа',
      worksheetName: 'FBM Margin',
      subtitle: exportSubtitle,
      columns: ORDER_EXPORT_COLUMNS,
      rows,
      filename: 'fbm-margin.csv',
    });
  };

  const metrics = [
    { label: 'С Binder', value: `${fmtNum(matchedOrders)} / ${fmtNum(summary.orderCount)}` },
    { label: 'Выручка нетто', value: fmtMoney(summary.totalRevenue) },
    { label: 'Себестоимость', value: fmtMoney(summary.totalCost) },
    {
      label: 'Маржа',
      value: fmtMoney(summary.totalMargin),
      color: summary.totalMargin >= 0 ? '#16a34a' : '#dc2626',
    },
  ];

  return (
    <div style={{ padding: '0 0 12px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text type="secondary">{filterSummary}</Typography.Text>
        <Space>
          <Button size="small" onClick={handleExportCsv} disabled={rows.length === 0}>
            CSV
          </Button>
          <Button size="small" onClick={handleExportExcel} disabled={rows.length === 0}>
            Excel
          </Button>
        </Space>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="card"
            style={{ padding: '10px 12px', minHeight: 0, display: 'grid', gap: 4 }}
          >
            <span className="bento__label">{metric.label}</span>
            <span className="bento__value" style={{ fontSize: 22, color: metric.color }}>
              {metric.value}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card__header" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>FBM Margin</h3>
            <Typography.Text type="secondary">
              В этой версии маржа считается только для заказов, у которых есть счёт Binder.
            </Typography.Text>
          </div>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(value) => setViewMode(value as 'orders' | 'details')}
            options={[
              { label: 'Заказы', value: 'orders' },
              { label: 'Детали', value: 'details' },
            ]}
          />
        </div>

        {viewMode === 'orders' ? (
          <Table<FbmMarginRow>
            dataSource={rows}
            columns={orderColumns}
            rowKey="orderNumber"
            loading={loading}
            size="small"
            onChange={handleTableChange}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (value) => `${value} заказов`,
            }}
          />
        ) : (
          <Table<FbmMarginDetailRow>
            dataSource={detailRows}
            columns={detailColumns}
            rowKey="rowKey"
            loading={loading}
            size="small"
            pagination={false}
          />
        )}
      </div>
    </div>
  );
}
