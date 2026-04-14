CREATE TABLE IF NOT EXISTS binder_invoices (
  id              BIGSERIAL PRIMARY KEY,
  source_row_hash TEXT NOT NULL UNIQUE,
  business_key    TEXT UNIQUE,
  kunde           INT,
  invoice_type    TEXT NOT NULL,
  invoice_number  TEXT,
  invoice_date    DATE,
  order_number    TEXT,
  description     TEXT,
  product_codes   TEXT,
  total_amount    NUMERIC(12, 2),
  shipping_cost   NUMERIC(12, 2),
  raw_record      JSONB NOT NULL,
  import_id       BIGINT REFERENCES data_imports(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_binder_invoices_order_number ON binder_invoices (order_number);
CREATE INDEX IF NOT EXISTS idx_binder_invoices_invoice_type ON binder_invoices (invoice_type);
CREATE INDEX IF NOT EXISTS idx_binder_invoices_invoice_date ON binder_invoices (invoice_date);
