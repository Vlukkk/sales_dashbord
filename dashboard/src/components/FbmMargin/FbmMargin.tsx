import { useEffect, useMemo, useState } from 'react';
import { Button, Space, Table, Typography } from 'antd';
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
  { key: 'date', header: 'Дата', type: 'string', width: 100, value: (row) => row.date ? dayjs(row.date).format('DD.MM.YYYY') : '' },
  { key: 'channel', header: 'Канал', type: 'string', width: 80, value: (row) => row.channel },
  { key: 'skuCount', header: 'SKU', type: 'integer', width: 50, value: (row) => row.skuCount },
  { key: 'salesLineCount', header: 'Строки', type: 'integer', width: 55, value: (row) => row.salesLineCount },
  { key: 'invoiceCount', header: 'Счета', type: 'integer', width: 55, value: (row) => row.invoiceCount },
  { key: 'saleGross', header: 'Продажа брутто', type: 'currency', width: 95, value: (row) => row.saleGross },
  { key: 'saleNet', header: 'Продажа нетто', type: 'currency', width: 95, value: (row) => row.saleNet },
  { key: 'refundedGross', header: 'Возврат брутто', type: 'currency', width: 95, value: (row) => row.refundedGross },
  { key: 'costNet', header: 'Себестоимость нетто', type: 'currency', width: 95, value: (row) => row.costNet },
  { key: 'amazonCommission', header: 'Amazon commission', type: 'currency', width: 95, value: (row) => row.amazonCommission },
  { key: 'fixedCost', header: 'Фикс. 10€', type: 'currency', width: 80, value: (row) => row.fixedCost },
  { key: 'margin', header: 'Маржа €', type: 'currency', width: 90, value: (row) => row.margin },
  { key: 'marginPercent', header: 'Маржа %', type: 'percent', width: 75, value: (row) => row.marginPercent },
];

const DETAIL_EXPORT_COLUMNS: ExportColumn<FbmMarginDetailRow>[] = [
  { key: 'orderNumber', header: 'Заказ', type: 'string', width: 130, value: (row) => row.orderNumber },
  { key: 'date', header: 'Дата', type: 'string', width: 100, value: (row) => row.date ? dayjs(row.date).format('DD.MM.YYYY') : '' },
  { key: 'status', header: 'Статус', type: 'string', width: 90, value: (row) => row.status ?? '' },
  { key: 'channel', header: 'Канал', type: 'string', width: 80, value: (row) => row.channel },
  { key: 'sku', header: 'SKU', type: 'string', width: 110, value: (row) => row.sku },
  { key: 'productName', header: 'Товар', type: 'string', width: 220, value: (row) => row.productName ?? '' },
  { key: 'qtyOrdered', header: 'Qty', type: 'integer', width: 45, value: (row) => row.qtyOrdered },
  { key: 'qtyRefunded', header: 'Qty ref', type: 'integer', width: 55, value: (row) => row.qtyRefunded },
  { key: 'saleGross', header: 'Продажа брутто', type: 'currency', width: 95, value: (row) => row.saleGross },
  { key: 'saleNet', header: 'Продажа нетто', type: 'currency', width: 95, value: (row) => row.saleNet },
  { key: 'refundedGross', header: 'Возврат брутто', type: 'currency', width: 95, value: (row) => row.refundedGross },
  { key: 'allocatedCostGross', header: 'Binder брутто', type: 'currency', width: 95, value: (row) => row.allocatedCostGross ?? 0 },
  { key: 'amazonCommission', header: 'Amazon commission', type: 'currency', width: 95, value: (row) => row.amazonCommission },
  { key: 'fixedCost', header: 'Фикс. 10€', type: 'currency', width: 80, value: (row) => row.fixedCost },
  { key: 'margin', header: 'Маржа €', type: 'currency', width: 90, value: (row) => row.margin },
  { key: 'marginPercent', header: 'Маржа %', type: 'percent', width: 75, value: (row) => row.marginPercent },
  { key: 'invoiceNumbers', header: 'Счета', type: 'string', width: 130, value: (row) => row.invoiceNumbers },
  { key: 'invoiceTypes', header: 'Типы счетов', type: 'string', width: 110, value: (row) => row.invoiceTypes },
  { key: 'productCodes', header: 'Binder коды', type: 'string', width: 140, value: (row) => row.productCodes },
  { key: 'descriptions', header: 'Binder описание', type: 'string', width: 220, value: (row) => row.descriptions },
];

export default function FbmMargin({ filters }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');

  const params = useMemo(
    () => ({
      filters,
      page,
      pageSize,
      sortBy,
      sortDir,
    }),
    [filters, page, pageSize, sortBy, sortDir],
  );

  const { rows, detailRows, total, summary, loading } = useFbmMarginData(params);
  const filterSummary = useMemo(() => buildFilterSummary(filters), [filters]);

  useEffect(() => {
    setPage(1);
  }, [filterSummary]);

  const orderColumns: ColumnsType<FbmMarginRow> = [
    {
      title: 'Заказ',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 140,
      sorter: true,
      render: (value: string, row) => <span style={{ opacity: row.hasBinderMatch ? 1 : 0.5 }}>{value}</span>,
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      sorter: true,
      render: (value: string) => (value ? dayjs(value).format('DD.MM.YYYY') : '-'),
    },
    {
      title: 'Канал',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      sorter: true,
    },
    {
      title: 'SKU',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 65,
      align: 'right',
      render: (value: number) => fmtNum(value),
    },
    {
      title: 'Строк',
      dataIndex: 'salesLineCount',
      key: 'salesLineCount',
      width: 70,
      align: 'right',
      render: (value: number) => fmtNum(value),
    },
    {
      title: 'Счетов',
      dataIndex: 'invoiceCount',
      key: 'invoiceCount',
      width: 78,
      align: 'right',
      render: (value: number) => fmtNum(value),
    },
    {
      title: 'Продажа брутто',
      dataIndex: 'saleGross',
      key: 'saleGross',
      width: 135,
      align: 'right',
      sorter: true,
      render: fmtMoney,
    },
    {
      title: 'Продажа нетто',
      dataIndex: 'saleNet',
      key: 'saleNet',
      width: 135,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Возврат брутто',
      dataIndex: 'refundedGross',
      key: 'refundedGross',
      width: 135,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Binder нетто',
      dataIndex: 'costNet',
      key: 'costNet',
      width: 130,
      align: 'right',
      render: (value: number, row) => (
        <span style={{ color: row.hasBinderMatch ? undefined : '#999' }}>
          {fmtMoney(value)}
        </span>
      ),
    },
    {
      title: 'Amazon commission',
      dataIndex: 'amazonCommission',
      key: 'amazonCommission',
      width: 145,
      align: 'right',
      sorter: true,
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Фикс. 10€',
      dataIndex: 'fixedCost',
      key: 'fixedCost',
      width: 95,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Маржа €',
      dataIndex: 'margin',
      key: 'margin',
      width: 120,
      align: 'right',
      sorter: true,
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {fmtMoney(value)}
        </span>
      ),
    },
    {
      title: 'Маржа %',
      dataIndex: 'marginPercent',
      key: 'marginPercent',
      width: 95,
      align: 'right',
      sorter: true,
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#16a34a' : '#dc2626' }}>
          {fmtPct(value)}
        </span>
      ),
    },
  ];

  const detailColumns: ColumnsType<FbmMarginDetailRow> = [
    {
      title: 'Заказ',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      width: 135,
      fixed: 'left',
      render: (value: string, row) => <span style={{ opacity: row.hasBinderMatch ? 1 : 0.5 }}>{value}</span>,
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (value: string) => (value ? dayjs(value).format('DD.MM.YYYY') : '-'),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string | null) => value ?? '-',
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
      width: 260,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: 'Qty',
      dataIndex: 'qtyOrdered',
      key: 'qtyOrdered',
      width: 70,
      align: 'right',
      render: (value: number) => fmtNum(value),
    },
    {
      title: 'Qty ref',
      dataIndex: 'qtyRefunded',
      key: 'qtyRefunded',
      width: 78,
      align: 'right',
      render: (value: number) => fmtNum(value),
    },
    {
      title: 'Продажа брутто',
      dataIndex: 'saleGross',
      key: 'saleGross',
      width: 130,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Продажа нетто',
      dataIndex: 'saleNet',
      key: 'saleNet',
      width: 130,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Binder брутто',
      dataIndex: 'allocatedCostGross',
      key: 'allocatedCostGross',
      width: 130,
      align: 'right',
      render: (value: number | null, row) => (
        <span style={{ color: row.hasBinderMatch ? undefined : '#999' }}>
          {value != null ? fmtMoney(value) : '-'}
        </span>
      ),
    },
    {
      title: 'Amazon commission',
      dataIndex: 'amazonCommission',
      key: 'amazonCommission',
      width: 145,
      align: 'right',
      render: (value: number) => (value > 0 ? fmtMoney(value) : '-'),
    },
    {
      title: 'Фикс. 10€',
      dataIndex: 'fixedCost',
      key: 'fixedCost',
      width: 95,
      align: 'right',
      render: fmtMoney,
    },
    {
      title: 'Маржа €',
      dataIndex: 'margin',
      key: 'margin',
      width: 120,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {fmtMoney(value)}
        </span>
      ),
    },
    {
      title: 'Маржа %',
      dataIndex: 'marginPercent',
      key: 'marginPercent',
      width: 95,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#16a34a' : '#dc2626' }}>
          {fmtPct(value)}
        </span>
      ),
    },
    {
      title: 'Счета Binder',
      dataIndex: 'invoiceNumbers',
      key: 'invoiceNumbers',
      width: 170,
      render: (value: string) => value || '-',
    },
    {
      title: 'Типы',
      dataIndex: 'invoiceTypes',
      key: 'invoiceTypes',
      width: 110,
      render: (value: string) => value || '-',
    },
    {
      title: 'Binder коды',
      dataIndex: 'productCodes',
      key: 'productCodes',
      width: 180,
      render: (value: string) => value || '-',
    },
    {
      title: 'Binder описание',
      dataIndex: 'descriptions',
      key: 'descriptions',
      width: 260,
      render: (value: string) => value || '-',
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
    setPageSize(pagination.pageSize ?? 50);
  };

  const exportSubtitle = filterSummary;

  const handleExportExcel = () => {
    downloadExcelWorkbook<any>('fbm-margin.xls', [
      {
        title: 'FBM Маржа',
        worksheetName: 'FBM Margin',
        subtitle: exportSubtitle,
        columns: ORDER_EXPORT_COLUMNS,
        rows,
      },
      {
        title: 'FBM Маржа · детали',
        worksheetName: 'FBM Details',
        subtitle: `Детализация по заказам на текущей странице: ${exportSubtitle}`,
        columns: DETAIL_EXPORT_COLUMNS,
        rows: detailRows,
      },
    ]);
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

  return (
    <div style={{ padding: '0 0 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
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

      <div className="bento">
        <div className="bento__item">
          <span className="bento__label">Заказы</span>
          <span className="bento__value">{fmtNum(summary.orderCount)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Выручка нетто</span>
          <span className="bento__value">{fmtMoney(summary.totalRevenue)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Себестоимость</span>
          <span className="bento__value">{fmtMoney(summary.totalCost)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Amazon commission</span>
          <span className="bento__value">{fmtMoney(summary.totalCommission)}</span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Общая маржа</span>
          <span className="bento__value" style={{ color: summary.totalMargin >= 0 ? '#16a34a' : '#dc2626' }}>
            {fmtMoney(summary.totalMargin)}
          </span>
        </div>
        <div className="bento__item">
          <span className="bento__label">Средняя маржа</span>
          <span className="bento__value" style={{ color: summary.avgMarginPercent >= 0 ? '#16a34a' : '#dc2626' }}>
            {fmtPct(summary.avgMarginPercent)}
          </span>
        </div>
        {summary.unmatchedOrders > 0 && (
          <div className="bento__item">
            <span className="bento__label">Без Binder</span>
            <span className="bento__value" style={{ color: '#f59e0b' }}>
              {fmtNum(summary.unmatchedOrders)}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <div>
            <h3>FBM Margin</h3>
            <Typography.Text type="secondary">
              Маржа = Продажа без НДС - Binder без НДС - Amazon commission - фиксированные 10€
            </Typography.Text>
          </div>
        </div>
        <Table<FbmMarginRow>
          dataSource={rows}
          columns={orderColumns}
          rowKey="orderNumber"
          loading={loading}
          size="small"
          scroll={{ x: 1550 }}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['25', '50', '100'],
            showTotal: (value) => `${value} заказов`,
          }}
        />
      </div>

      <div className="card">
        <div className="card__header">
          <div>
            <h3>Полная информация</h3>
            <Typography.Text type="secondary">
              Детализация по SKU и строкам Edelind для заказов с текущей страницы FBM Margin.
            </Typography.Text>
          </div>
        </div>
        <Table<FbmMarginDetailRow>
          dataSource={detailRows}
          columns={detailColumns}
          rowKey="rowKey"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 2600, y: 520 }}
        />
      </div>
    </div>
  );
}
