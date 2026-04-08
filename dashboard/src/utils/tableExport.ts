import dayjs from 'dayjs';

export type ExportValue = string | number | null | undefined;
export type ExportColumnType = 'string' | 'integer' | 'currency' | 'percent';

export interface ExportColumn<Row> {
  key: string;
  header: string;
  type: ExportColumnType;
  width?: number;
  value: (row: Row) => ExportValue;
}

interface ExportSheet<Row> {
  title: string;
  worksheetName: string;
  subtitle?: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function sanitizeWorksheetName(value: string) {
  const normalized = value
    .replace(/[\\/:?*]/g, ' ')
    .replace(/\[/g, ' ')
    .replace(/\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (normalized || 'Export').slice(0, 31);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatCsvValue(type: ExportColumnType, value: ExportValue) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    if (type === 'currency') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }).format(value);
    }

    if (type === 'percent') {
      return `${value.toFixed(1)}%`;
    }

    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: type === 'integer' ? 0 : 2 }).format(value);
  }

  return String(value);
}

function toExcelCell(type: ExportColumnType, value: ExportValue) {
  if (value === null || value === undefined || value === '') {
    return '<Cell ss:StyleID="Cell"><Data ss:Type="String"></Data></Cell>';
  }

  if (typeof value === 'number') {
    const styleId = type === 'currency'
      ? 'Currency'
      : type === 'percent'
        ? 'Percent'
        : type === 'integer'
          ? 'Integer'
          : 'Number';
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell ss:StyleID="Cell"><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

function buildWorksheet<Row>(sheet: ExportSheet<Row>) {
  const columnsXml = sheet.columns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width ?? 110}" />`)
    .join('');
  const headerXml = sheet.columns
    .map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(column.header)}</Data></Cell>`)
    .join('');
  const rowsXml = sheet.rows
    .map((row) => (
      `<Row>${sheet.columns.map((column) => toExcelCell(column.type, column.value(row))).join('')}</Row>`
    ))
    .join('');
  const metaRows = [
    `<Row><Cell ss:StyleID="Title" ss:MergeAcross="${Math.max(sheet.columns.length - 1, 0)}"><Data ss:Type="String">${escapeXml(sheet.title)}</Data></Cell></Row>`,
    sheet.subtitle
      ? `<Row><Cell ss:StyleID="Meta" ss:MergeAcross="${Math.max(sheet.columns.length - 1, 0)}"><Data ss:Type="String">${escapeXml(sheet.subtitle)}</Data></Cell></Row>`
      : '',
    `<Row><Cell ss:StyleID="Meta" ss:MergeAcross="${Math.max(sheet.columns.length - 1, 0)}"><Data ss:Type="String">${escapeXml(`Экспортировано ${dayjs().format('YYYY-MM-DD HH:mm')}`)}</Data></Cell></Row>`,
    '<Row />',
  ].join('');

  return `
    <Worksheet ss:Name="${escapeXml(sanitizeWorksheetName(sheet.worksheetName))}">
      <Table>
        ${columnsXml}
        ${metaRows}
        <Row>${headerXml}</Row>
        ${rowsXml}
      </Table>
    </Worksheet>
  `;
}

export function downloadCsv<Row>(args: ExportSheet<Row> & { filename: string }) {
  const lines: string[] = [];
  lines.push(csvCell(args.title));
  if (args.subtitle) {
    lines.push(csvCell(args.subtitle));
  }
  lines.push(csvCell(`Экспортировано ${dayjs().format('YYYY-MM-DD HH:mm')}`));
  lines.push('');
  lines.push(args.columns.map((column) => csvCell(column.header)).join(';'));

  for (const row of args.rows) {
    lines.push(
      args.columns
        .map((column) => csvCell(formatCsvValue(column.type, column.value(row))))
        .join(';'),
    );
  }

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  downloadBlob(blob, args.filename);
}

export function downloadExcelWorkbook<Row>(
  filename: string,
  sheets: ExportSheet<Row>[],
) {
  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Codex</Author>
    <Created>${dayjs().toISOString()}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center" />
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0f172a" />
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#0f172a" />
    </Style>
    <Style ss:ID="Meta">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748b" />
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" />
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0f172a" />
      <Interior ss:Color="#e2e8f0" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1" />
      </Borders>
    </Style>
    <Style ss:ID="Cell">
      <Alignment ss:Vertical="Center" />
    </Style>
    <Style ss:ID="Integer">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
      <NumberFormat ss:Format="0" />
    </Style>
    <Style ss:ID="Number">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
      <NumberFormat ss:Format="0.00" />
    </Style>
    <Style ss:ID="Currency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
      <NumberFormat ss:Format='&quot;€&quot; #,##0.00' />
    </Style>
    <Style ss:ID="Percent">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" />
      <NumberFormat ss:Format="0.0\\%" />
    </Style>
  </Styles>
  ${sheets.map((sheet) => buildWorksheet(sheet)).join('')}
</Workbook>`;

  const blob = new Blob([workbook], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  downloadBlob(blob, filename);
}
