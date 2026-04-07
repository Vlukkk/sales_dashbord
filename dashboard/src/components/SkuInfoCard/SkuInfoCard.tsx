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
        <Typography.Text type="secondary">Produktinfo nicht verfügbar</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph style={{ fontSize: 14 }}>
            {parsed.fullName}
          </Typography.Paragraph>

          <Descriptions column={1} size="small" bordered>
            {parsed.metalType && <Descriptions.Item label="Metall">{parsed.metalType}</Descriptions.Item>}
            {parsed.metalAlloy && <Descriptions.Item label="Legierung">{parsed.metalAlloy}</Descriptions.Item>}
            {parsed.length && <Descriptions.Item label="Länge">{parsed.length} cm</Descriptions.Item>}
            {parsed.width && <Descriptions.Item label="Breite">{parsed.width} mm</Descriptions.Item>}
            {parsed.weight && <Descriptions.Item label="Gewicht">{parsed.weight} g</Descriptions.Item>}
            {product.amaz_metal_stamp && <Descriptions.Item label="Stempel">{product.amaz_metal_stamp}</Descriptions.Item>}
            {product.product_type && <Descriptions.Item label="Typ">{product.product_type}</Descriptions.Item>}
            {product.supplier && <Descriptions.Item label="Lieferant">{product.supplier}</Descriptions.Item>}
            {product.sku_vender && <Descriptions.Item label="Vendor SKU">{product.sku_vender}</Descriptions.Item>}
            {product.purchase_price != null && (
              <Descriptions.Item label="Einkaufspreis">{Number(product.purchase_price).toFixed(2)} €</Descriptions.Item>
            )}
            {product.amaz_price != null && (
              <Descriptions.Item label="Amazon Preis">{Number(product.amaz_price).toFixed(2)} €</Descriptions.Item>
            )}
            {product.amaz_parent_sku && (
              <Descriptions.Item label="Parent SKU">{product.amaz_parent_sku}</Descriptions.Item>
            )}
          </Descriptions>

          <Divider>Verkaufsübersicht</Divider>
          <div style={{ display: 'flex', gap: 16 }}>
            <Tag color="blue">Bestellungen: {salesSummary.count}</Tag>
            <Tag color="green">Umsatz: {salesSummary.totalInclTax.toFixed(2)} €</Tag>
            <Tag color="gold">Gewinn: {salesSummary.totalProfit.toFixed(2)} €</Tag>
          </div>

          <Divider>FBA Bestand</Divider>
          {inventoryRecord ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Tag color="cyan">Sellable: {inventoryRecord.sellable}</Tag>
              <Tag color="purple">Unsellable: {inventoryRecord.unsellable}</Tag>
              <Tag>Total: {inventoryRecord.total}</Tag>
            </div>
          ) : (
            <Typography.Text type="secondary">Keine FBA-Bestandsdaten für diese SKU gefunden</Typography.Text>
          )}

          {siblings.length > 0 && (
            <>
              <Divider>Varianten ({siblings.length})</Divider>
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
