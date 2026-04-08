import { useMemo } from 'react';
import { Drawer, Descriptions, Tag, Typography, Divider, List } from 'antd';
import type { CatalogData, InventoryData, SaleRecord } from '../../types';
import { parseAmazName } from '../../utils/parseAmazName';

interface Props {
  sku: string | null;
  catalog: CatalogData;
  inventory: InventoryData;
  sales: SaleRecord[];
  onClose: () => void;
}

export default function SkuInfoCard({ sku, catalog, inventory, sales, onClose }: Props) {
  const product = sku ? catalog.products[sku] : null;
  const inventoryRecord = sku ? inventory.records[sku] : null;
  const parsed = useMemo(() => parseAmazName(product?.amaz_name ?? null), [product]);

  const skuSales = useMemo(() => {
    if (!sku) return [];
    return sales.filter((s) => s.artikelposition === sku);
  }, [sku, sales]);

  const salesSummary = useMemo(() => {
    const count = skuSales.length;
    const totalInclTax = skuSales.reduce((s, r) => s + (r.totalInclTax || 0), 0);
    const totalProfit = skuSales.reduce((s, r) => s + (r.totalProfit || 0), 0);
    return { count, totalInclTax, totalProfit };
  }, [skuSales]);

  const siblings = useMemo(() => {
    if (!product?.amaz_parent_sku) return [];
    const children = catalog.parentGroups[product.amaz_parent_sku] || [];
    return children.filter((c) => c !== sku).map((c) => ({
      sku: c,
      name: catalog.products[c]?.amaz_name || c,
      length: catalog.products[c]?.chain_length,
    }));
  }, [sku, product, catalog]);

  return (
    <Drawer
      title={sku || ''}
      open={!!sku}
      onClose={onClose}
      width={500}
      className="sku-drawer"
    >
      {!product ? (
        <Typography.Text type="secondary">Информация о товаре недоступна</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph style={{ fontSize: 14 }}>
            {parsed.fullName}
          </Typography.Paragraph>

          <Descriptions column={1} size="small" bordered>
            {parsed.metalType && <Descriptions.Item label="Металл">{parsed.metalType}</Descriptions.Item>}
            {parsed.metalAlloy && <Descriptions.Item label="Сплав">{parsed.metalAlloy}</Descriptions.Item>}
            {parsed.length && <Descriptions.Item label="Длина">{parsed.length} см</Descriptions.Item>}
            {parsed.width && <Descriptions.Item label="Ширина">{parsed.width} мм</Descriptions.Item>}
            {parsed.weight && <Descriptions.Item label="Вес">{parsed.weight} г</Descriptions.Item>}
            {product.amaz_metal_stamp && <Descriptions.Item label="Клеймо">{product.amaz_metal_stamp}</Descriptions.Item>}
            {product.product_type && <Descriptions.Item label="Тип">{product.product_type}</Descriptions.Item>}
            {product.lieferant && <Descriptions.Item label="Поставщик">{product.lieferant}</Descriptions.Item>}
            {product.sku_vender && <Descriptions.Item label="SKU поставщика">{product.sku_vender}</Descriptions.Item>}
            {product.purchase_price != null && (
              <Descriptions.Item label="Закупочная цена">{Number(product.purchase_price).toFixed(2)} €</Descriptions.Item>
            )}
            {product.amaz_price != null && (
              <Descriptions.Item label="Цена Amazon">{Number(product.amaz_price).toFixed(2)} €</Descriptions.Item>
            )}
            {product.amaz_parent_sku && (
              <Descriptions.Item label="Parent SKU">{product.amaz_parent_sku}</Descriptions.Item>
            )}
          </Descriptions>

          <Divider>Сводка продаж</Divider>
          <div style={{ display: 'flex', gap: 16 }}>
            <Tag color="blue">Заказы: {salesSummary.count}</Tag>
            <Tag color="green">Выручка: {salesSummary.totalInclTax.toFixed(2)} €</Tag>
            <Tag color="gold">Прибыль: {salesSummary.totalProfit.toFixed(2)} €</Tag>
          </div>

          <Divider>Остаток FBA</Divider>
          {inventoryRecord ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Tag color="cyan">В продаже: {inventoryRecord.sellable}</Tag>
              <Tag color="purple">Дефектные: {inventoryRecord.unsellable}</Tag>
              <Tag>Всего: {inventoryRecord.total}</Tag>
            </div>
          ) : (
            <Typography.Text type="secondary">Нет данных FBA по этому SKU</Typography.Text>
          )}

          {siblings.length > 0 && (
            <>
              <Divider>Варианты ({siblings.length})</Divider>
              <List
                size="small"
                dataSource={siblings}
                renderItem={(item) => (
                  <List.Item>
                    <Typography.Text code>{item.sku}</Typography.Text>
                    {item.length && <Typography.Text type="secondary"> | {item.length} cm</Typography.Text>}
                  </List.Item>
                )}
              />
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
