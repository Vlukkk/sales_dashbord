CREATE TABLE IF NOT EXISTS data_imports (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rows_total INT,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_errors (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  row_number INT,
  sku_code TEXT,
  field_name TEXT,
  message TEXT NOT NULL,
  raw_record JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
  id BIGSERIAL PRIMARY KEY,
  sku_code TEXT NOT NULL UNIQUE,
  vendor_sku TEXT,
  asin TEXT,
  title TEXT,
  parent_sku TEXT,
  product_type TEXT,
  status TEXT,
  metal_type TEXT,
  metal_alloy TEXT,
  length_value NUMERIC(12, 3),
  width_value NUMERIC(12, 3),
  weight_value NUMERIC(12, 3),
  raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sku_supplier (
  sku_id BIGINT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sku_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  source_row_hash TEXT NOT NULL UNIQUE,
  business_key TEXT,
  order_number TEXT,
  sku_id BIGINT REFERENCES skus(id) ON DELETE SET NULL,
  sku_code TEXT NOT NULL,
  order_status TEXT,
  order_date TIMESTAMPTZ,
  customer_group TEXT,
  channel TEXT,
  country TEXT,
  city TEXT,
  qty_ordered INT NOT NULL DEFAULT 0,
  qty_invoiced INT NOT NULL DEFAULT 0,
  qty_shipped INT NOT NULL DEFAULT 0,
  qty_refunded INT NOT NULL DEFAULT 0,
  price NUMERIC(12, 2),
  total_incl_tax NUMERIC(12, 2),
  refunded_incl_tax NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  total_profit NUMERIC(12, 2),
  total_margin NUMERIC(12, 2),
  raw_record JSONB NOT NULL,
  import_id BIGINT REFERENCES data_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id BIGSERIAL PRIMARY KEY,
  sku_id BIGINT REFERENCES skus(id) ON DELETE SET NULL,
  sku_code TEXT NOT NULL,
  asin TEXT,
  fulfillment_channel_sku TEXT,
  sellable_qty INT NOT NULL DEFAULT 0,
  unsellable_qty INT NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  raw_record JSONB NOT NULL,
  import_id BIGINT REFERENCES data_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku_code, snapshot_date)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_skus_updated_at ON skus;
CREATE TRIGGER trg_skus_updated_at
BEFORE UPDATE ON skus
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sku_supplier_updated_at ON sku_supplier;
CREATE TRIGGER trg_sku_supplier_updated_at
BEFORE UPDATE ON sku_supplier
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_data_imports_status ON data_imports (status);
CREATE INDEX IF NOT EXISTS idx_import_errors_import_id ON import_errors (import_id);
CREATE INDEX IF NOT EXISTS idx_skus_parent_sku ON skus (parent_sku);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_supplier_primary ON sku_supplier (sku_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales (order_date);
CREATE INDEX IF NOT EXISTS idx_sales_sku_id ON sales (sku_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_status ON sales (order_status);
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales (channel);
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON sales (order_number);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_date ON inventory_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_sku_id ON inventory_snapshots (sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_sku_code ON inventory_snapshots (sku_code);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_key TEXT;

UPDATE sales
SET business_key = order_number || '|' || sku_code
WHERE business_key IS NULL
  AND order_number IS NOT NULL
  AND sku_code IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY business_key ORDER BY id DESC) AS row_num
  FROM sales
  WHERE business_key IS NOT NULL
)
DELETE FROM sales
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_num > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_sales_business_key'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT uq_sales_business_key UNIQUE (business_key);
  END IF;
END $$;
