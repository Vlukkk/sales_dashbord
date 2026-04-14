#!/usr/bin/env python3
"""Import current sales/catalog/inventory sources into PostgreSQL."""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

try:
    import psycopg
    from psycopg.rows import dict_row
except ModuleNotFoundError as exc:  # pragma: no cover - runtime dependency
    raise SystemExit(
        "psycopg is required for PostgreSQL import. Install it with: pip install psycopg[binary]"
    ) from exc

try:
    from preprocess import (
        CATALOG_XLSX,
        INVENTORY_TXT,
        LIEFERANT_XLSX,
        SALES_XML,
        discover_binder_xlsx_files,
        discover_sales_xml_files,
        parse_binder_invoices,
        parse_catalog,
        parse_inventory,
        parse_lieferanten,
        parse_sales,
    )
except ModuleNotFoundError:
    from scripts.preprocess import (
        CATALOG_XLSX,
        INVENTORY_TXT,
        LIEFERANT_XLSX,
        SALES_XML,
        discover_binder_xlsx_files,
        discover_sales_xml_files,
        parse_binder_invoices,
        parse_catalog,
        parse_inventory,
        parse_lieferanten,
        parse_sales,
    )


def require_database_url() -> str:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    return database_url


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def row_hash(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_sales_business_key(row: Dict[str, Any]) -> str:
    order_number = str(row.get("bestellungNr") or "").strip()
    sku_code = str(row.get("artikelposition") or "").strip()
    if order_number and sku_code:
        return f"{order_number}|{sku_code}"

    return row_hash(row)


def derive_channel(sale: Dict[str, Any]) -> str:
    group = (sale.get("kundengruppe") or "").lower()
    email = (sale.get("kundenEmail") or "").lower()

    if "retail" in group:
        return "Retail"
    if "amazon" in group or "amazon." in email:
        return "Amazon"
    return "Direct"


def build_binder_business_key(row: Dict[str, Any]) -> str:
    order_number = str(row.get("order_number") or "").strip()
    invoice_number = str(row.get("invoice_number") or "").strip()
    invoice_type = str(row.get("invoice_type") or "").strip()
    if order_number and invoice_number:
        return f"{order_number}|{invoice_number}|{invoice_type}"
    return row_hash(row)


def parse_snapshot_date(filename: str) -> str:
    match = re.search(r"(\d{2})-(\d{2})-(\d{4})", filename)
    if not match:
        return datetime.utcnow().date().isoformat()
    day, month, year = match.groups()
    return f"{year}-{month}-{day}"


def parse_numeric_token(value: Any) -> Optional[Decimal]:
    if value is None:
        return None

    cleaned = re.sub(r"[^0-9,.\-]", "", str(value)).strip()
    if not cleaned:
        return None

    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")

    try:
        return Decimal(cleaned)
    except Exception:
        return None


def first_non_empty(product: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = product.get(key)
        if value not in (None, ""):
            return str(value)
    return None


@dataclass
class ImportRun:
    id: int
    source_type: str
    filename: str


class ImportWriter:
    def __init__(self, conn: "psycopg.Connection[Any]") -> None:
        self.conn = conn

    def create_import(self, source_type: str, filename: str, file_hash: str, rows_total: int) -> ImportRun:
        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO data_imports (
                  source_type,
                  filename,
                  file_hash,
                  status,
                  rows_total,
                  started_at
                ) VALUES (%s, %s, %s, 'processing', %s, NOW())
                RETURNING id, source_type, filename
                """,
                (source_type, filename, file_hash, rows_total),
            )
            row = cur.fetchone()
            assert row is not None
            return ImportRun(id=row["id"], source_type=row["source_type"], filename=row["filename"])

    def find_completed_import(self, source_type: str, file_hash: str) -> Optional[ImportRun]:
        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, source_type, filename
                FROM data_imports
                WHERE source_type = %s
                  AND file_hash = %s
                  AND status = 'completed'
                ORDER BY id DESC
                LIMIT 1
                """,
                (source_type, file_hash),
            )
            row = cur.fetchone()
            if row is None:
                return None

            return ImportRun(id=row["id"], source_type=row["source_type"], filename=row["filename"])

    def finish_import(
        self,
        run: ImportRun,
        *,
        inserted: int,
        updated: int,
        skipped: int,
        status: str = "completed",
        error_message: Optional[str] = None,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE data_imports
                SET
                  status = %s,
                  rows_inserted = %s,
                  rows_updated = %s,
                  rows_skipped = %s,
                  error_message = %s,
                  finished_at = NOW()
                WHERE id = %s
                """,
                (status, inserted, updated, skipped, error_message, run.id),
            )

    def upsert_suppliers(self, supplier_names: Iterable[str]) -> None:
        with self.conn.cursor() as cur:
            for name in sorted({name for name in supplier_names if name}):
                cur.execute(
                    """
                    INSERT INTO suppliers (name)
                    VALUES (%s)
                    ON CONFLICT (name) DO NOTHING
                    """,
                    (name,),
                )

    def load_supplier_ids(self) -> Dict[str, int]:
        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT id, name FROM suppliers")
            return {row["name"]: row["id"] for row in cur.fetchall()}

    def upsert_skus(self, products: Dict[str, Dict[str, Any]], inventory_records: Dict[str, Dict[str, Any]]) -> tuple[int, int]:
        inserted = 0
        updated = 0
        with self.conn.cursor() as cur:
            for sku_code, product in products.items():
                inventory = inventory_records.get(sku_code, {})
                result = cur.execute(
                    """
                    INSERT INTO skus (
                      sku_code,
                      vendor_sku,
                      asin,
                      title,
                      parent_sku,
                      product_type,
                      status,
                      metal_type,
                      metal_alloy,
                      length_value,
                      width_value,
                      weight_value,
                      raw_attributes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (sku_code) DO UPDATE SET
                      vendor_sku = EXCLUDED.vendor_sku,
                      asin = COALESCE(EXCLUDED.asin, skus.asin),
                      title = EXCLUDED.title,
                      parent_sku = EXCLUDED.parent_sku,
                      product_type = EXCLUDED.product_type,
                      status = EXCLUDED.status,
                      metal_type = EXCLUDED.metal_type,
                      metal_alloy = EXCLUDED.metal_alloy,
                      length_value = EXCLUDED.length_value,
                      width_value = EXCLUDED.width_value,
                      weight_value = EXCLUDED.weight_value,
                      raw_attributes = EXCLUDED.raw_attributes
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        sku_code,
                        first_non_empty(product, "sku_vender"),
                        inventory.get("asin"),
                        first_non_empty(product, "amaz_name", "name"),
                        first_non_empty(product, "amaz_parent_sku"),
                        first_non_empty(product, "product_type", "ringe_produkt_type"),
                        first_non_empty(product, "status"),
                        first_non_empty(product, "chain_metal_type", "pendant_metal_type"),
                        first_non_empty(product, "chain_metal_aloy", "pendant_metal_aloy", "ringe_metal_aloy"),
                        parse_numeric_token(first_non_empty(product, "chain_length", "length")),
                        parse_numeric_token(first_non_empty(product, "chain_width", "pendant_width", "earring_width")),
                        parse_numeric_token(first_non_empty(product, "chain_weight", "pendant_weight", "earring_weight")),
                        json.dumps(product, ensure_ascii=False),
                    ),
                ).fetchone()
                if result and result[0]:
                    inserted += 1
                else:
                    updated += 1
        return inserted, updated

    def load_sku_ids(self) -> Dict[str, int]:
        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT id, sku_code FROM skus")
            return {row["sku_code"]: row["id"] for row in cur.fetchall()}

    def upsert_sku_suppliers(
        self,
        products: Dict[str, Dict[str, Any]],
        sku_ids: Dict[str, int],
        supplier_ids: Dict[str, int],
    ) -> tuple[int, int]:
        inserted = 0
        updated = 0
        with self.conn.cursor() as cur:
            for sku_code, product in products.items():
                supplier_name = product.get("lieferant")
                if not supplier_name:
                    continue

                sku_id = sku_ids.get(sku_code)
                supplier_id = supplier_ids.get(str(supplier_name))
                if not sku_id or not supplier_id:
                    continue

                cur.execute(
                    """
                    UPDATE sku_supplier
                    SET is_primary = FALSE
                    WHERE sku_id = %s AND supplier_id <> %s AND is_primary = TRUE
                    """,
                    (sku_id, supplier_id),
                )
                result = cur.execute(
                    """
                    INSERT INTO sku_supplier (sku_id, supplier_id, purchase_price, currency, is_primary)
                    VALUES (%s, %s, %s, 'EUR', TRUE)
                    ON CONFLICT (sku_id, supplier_id) DO UPDATE SET
                      purchase_price = EXCLUDED.purchase_price,
                      currency = EXCLUDED.currency,
                      is_primary = TRUE
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        sku_id,
                        supplier_id,
                        parse_numeric_token(product.get("purchase_price")),
                    ),
                ).fetchone()
                if result and result[0]:
                    inserted += 1
                else:
                    updated += 1
        return inserted, updated

    def upsert_sales(self, sales_rows: list[Dict[str, Any]], sku_ids: Dict[str, int], run: ImportRun) -> tuple[int, int]:
        inserted = 0
        updated = 0
        with self.conn.cursor() as cur:
            for row in sales_rows:
                sku_code = row.get("artikelposition")
                if not sku_code:
                    continue

                result = cur.execute(
                    """
                    INSERT INTO sales (
                      source_row_hash,
                      business_key,
                      order_number,
                      sku_id,
                      sku_code,
                      order_status,
                      order_date,
                      customer_group,
                      channel,
                      country,
                      city,
                      qty_ordered,
                      qty_invoiced,
                      qty_shipped,
                      qty_refunded,
                      price,
                      total_incl_tax,
                      refunded_incl_tax,
                      total_cost,
                      total_profit,
                      total_margin,
                      raw_record,
                      import_id
                    )
                    VALUES (
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
                    )
                    ON CONFLICT (business_key) DO UPDATE SET
                      order_number = EXCLUDED.order_number,
                      source_row_hash = EXCLUDED.source_row_hash,
                      business_key = EXCLUDED.business_key,
                      sku_id = EXCLUDED.sku_id,
                      sku_code = EXCLUDED.sku_code,
                      order_status = EXCLUDED.order_status,
                      order_date = EXCLUDED.order_date,
                      customer_group = EXCLUDED.customer_group,
                      channel = EXCLUDED.channel,
                      country = EXCLUDED.country,
                      city = EXCLUDED.city,
                      qty_ordered = EXCLUDED.qty_ordered,
                      qty_invoiced = EXCLUDED.qty_invoiced,
                      qty_shipped = EXCLUDED.qty_shipped,
                      qty_refunded = EXCLUDED.qty_refunded,
                      price = EXCLUDED.price,
                      total_incl_tax = EXCLUDED.total_incl_tax,
                      refunded_incl_tax = EXCLUDED.refunded_incl_tax,
                      total_cost = EXCLUDED.total_cost,
                      total_profit = EXCLUDED.total_profit,
                      total_margin = EXCLUDED.total_margin,
                      raw_record = EXCLUDED.raw_record,
                      import_id = EXCLUDED.import_id
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        row_hash(row),
                        build_sales_business_key(row),
                        row.get("bestellungNr"),
                        sku_ids.get(sku_code),
                        sku_code,
                        row.get("status"),
                        row.get("bestelldatum"),
                        row.get("kundengruppe"),
                        derive_channel(row),
                        row.get("land"),
                        row.get("stadt"),
                        row.get("qtyOrdered", 0),
                        row.get("qtyInvoiced", 0),
                        row.get("qtyShipped", 0),
                        row.get("qtyRefunded", 0),
                        row.get("preis"),
                        row.get("totalInclTax"),
                        row.get("refundedInclTax"),
                        row.get("totalCost"),
                        row.get("totalProfit"),
                        row.get("totalMargin"),
                        json.dumps(row, ensure_ascii=False),
                        run.id,
                    ),
                ).fetchone()
                if result and result[0]:
                    inserted += 1
                else:
                    updated += 1
        return inserted, updated

    def upsert_binder_invoices(self, rows: list[Dict[str, Any]], run: ImportRun) -> tuple[int, int]:
        inserted = 0
        updated = 0
        with self.conn.cursor() as cur:
            for row in rows:
                if not row.get("invoice_type"):
                    continue
                bkey = build_binder_business_key(row)
                result = cur.execute(
                    """
                    INSERT INTO binder_invoices (
                      source_row_hash,
                      business_key,
                      kunde,
                      invoice_type,
                      invoice_number,
                      invoice_date,
                      order_number,
                      description,
                      product_codes,
                      total_amount,
                      shipping_cost,
                      raw_record,
                      import_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (business_key) DO UPDATE SET
                      source_row_hash = EXCLUDED.source_row_hash,
                      kunde = EXCLUDED.kunde,
                      invoice_type = EXCLUDED.invoice_type,
                      invoice_number = EXCLUDED.invoice_number,
                      invoice_date = EXCLUDED.invoice_date,
                      order_number = EXCLUDED.order_number,
                      description = EXCLUDED.description,
                      product_codes = EXCLUDED.product_codes,
                      total_amount = EXCLUDED.total_amount,
                      shipping_cost = EXCLUDED.shipping_cost,
                      raw_record = EXCLUDED.raw_record,
                      import_id = EXCLUDED.import_id
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        row_hash(row),
                        bkey,
                        row.get("kunde"),
                        row.get("invoice_type"),
                        row.get("invoice_number"),
                        row.get("invoice_date"),
                        row.get("order_number"),
                        row.get("description"),
                        row.get("product_codes"),
                        row.get("total_amount"),
                        row.get("shipping_cost"),
                        json.dumps(row, ensure_ascii=False),
                        run.id,
                    ),
                ).fetchone()
                if result and result[0]:
                    inserted += 1
                else:
                    updated += 1
        return inserted, updated

    def upsert_inventory(
        self,
        inventory_records: Dict[str, Dict[str, Any]],
        sku_ids: Dict[str, int],
        snapshot_date: str,
        run: ImportRun,
    ) -> tuple[int, int]:
        inserted = 0
        updated = 0
        with self.conn.cursor() as cur:
            for sku_code, row in inventory_records.items():
                result = cur.execute(
                    """
                    INSERT INTO inventory_snapshots (
                      sku_id,
                      sku_code,
                      asin,
                      fulfillment_channel_sku,
                      sellable_qty,
                      unsellable_qty,
                      snapshot_date,
                      raw_record,
                      import_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (sku_code, snapshot_date) DO UPDATE SET
                      sku_id = EXCLUDED.sku_id,
                      asin = EXCLUDED.asin,
                      fulfillment_channel_sku = EXCLUDED.fulfillment_channel_sku,
                      sellable_qty = EXCLUDED.sellable_qty,
                      unsellable_qty = EXCLUDED.unsellable_qty,
                      raw_record = EXCLUDED.raw_record,
                      import_id = EXCLUDED.import_id
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        sku_ids.get(sku_code),
                        sku_code,
                        row.get("asin"),
                        row.get("fulfillmentChannelSku"),
                        row.get("sellable", 0),
                        row.get("unsellable", 0),
                        snapshot_date,
                        json.dumps(row, ensure_ascii=False),
                        run.id,
                    ),
                ).fetchone()
                if result and result[0]:
                    inserted += 1
                else:
                    updated += 1
        return inserted, updated


def load_sales_sources() -> list[tuple[Path, list[Dict[str, Any]]]]:
    sales_sources: list[tuple[Path, list[Dict[str, Any]]]] = []
    for source_path in discover_sales_xml_files():
        sales_sources.append((source_path, parse_sales(source_path)))
    return sales_sources


def load_source_bundle() -> tuple[list[tuple[Path, list[Dict[str, Any]]]], Dict[str, Any], Dict[str, Any]]:
    sales_sources = load_sales_sources()
    sales_rows = [row for _, rows in sales_sources for row in rows]
    inventory = parse_inventory()
    inventory_records = inventory["records"]
    inventory_skus = set(inventory_records.keys())
    sales_skus = {row["artikelposition"] for row in sales_rows if row.get("artikelposition")}
    supplier_map = parse_lieferanten()
    catalog = parse_catalog(sales_skus, inventory_skus, supplier_map)
    return sales_sources, catalog, inventory


def main() -> None:
    database_url = require_database_url()
    sales_sources, catalog, inventory = load_source_bundle()
    products = catalog["products"]
    inventory_records = inventory["records"]
    snapshot_date = parse_snapshot_date(INVENTORY_TXT.name)
    total_sales_rows = sum(len(rows) for _, rows in sales_sources)

    with psycopg.connect(database_url) as conn:
        conn.execute("SET TIME ZONE 'UTC'")
        writer = ImportWriter(conn)

        catalog_import = writer.create_import(
            "catalog_bundle",
            f"{CATALOG_XLSX.name} + {LIEFERANT_XLSX.name}",
            hashlib.sha256(
                f"{sha256_file(CATALOG_XLSX)}:{sha256_file(LIEFERANT_XLSX)}".encode("utf-8")
            ).hexdigest(),
            len(products),
        )
        inventory_import = writer.create_import(
            "inventory_txt",
            INVENTORY_TXT.name,
            sha256_file(INVENTORY_TXT),
            len(inventory_records),
        )
        conn.commit()

        try:
            writer.upsert_suppliers(
                product["lieferant"]
                for product in products.values()
                if product.get("lieferant")
            )
            sku_inserted, sku_updated = writer.upsert_skus(products, inventory_records)
            sku_ids = writer.load_sku_ids()
            supplier_ids = writer.load_supplier_ids()
            rel_inserted, rel_updated = writer.upsert_sku_suppliers(products, sku_ids, supplier_ids)
            sales_inserted = 0
            sales_updated = 0
            sales_skipped = 0

            for sales_source, sales_rows in sales_sources:
                file_hash = sha256_file(sales_source)
                existing_import = writer.find_completed_import("sales_xml", file_hash)
                if existing_import is not None:
                    sales_skipped += len(sales_rows)
                    continue

                sales_import = writer.create_import(
                    "sales_xml",
                    sales_source.name,
                    file_hash,
                    len(sales_rows),
                )
                conn.commit()

                try:
                    inserted, updated = writer.upsert_sales(sales_rows, sku_ids, sales_import)
                    writer.finish_import(
                        sales_import,
                        inserted=inserted,
                        updated=updated,
                        skipped=max(0, len(sales_rows) - inserted - updated),
                    )
                    conn.commit()
                except Exception as error:
                    conn.rollback()
                    with psycopg.connect(database_url) as error_conn:
                        error_writer = ImportWriter(error_conn)
                        error_writer.finish_import(
                            sales_import,
                            inserted=0,
                            updated=0,
                            skipped=0,
                            status="failed",
                            error_message=str(error),
                        )
                        error_conn.commit()
                    raise

                sales_inserted += inserted
                sales_updated += updated

            inventory_inserted, inventory_updated = writer.upsert_inventory(
                inventory_records,
                sku_ids,
                snapshot_date,
                inventory_import,
            )

            writer.finish_import(
                catalog_import,
                inserted=sku_inserted + rel_inserted,
                updated=sku_updated + rel_updated,
                skipped=0,
            )
            writer.finish_import(
                inventory_import,
                inserted=inventory_inserted,
                updated=inventory_updated,
                skipped=0,
            )
            conn.commit()
        except Exception as error:
            conn.rollback()
            with psycopg.connect(database_url) as error_conn:
                error_writer = ImportWriter(error_conn)
                for run in (catalog_import, inventory_import):
                    error_writer.finish_import(run, inserted=0, updated=0, skipped=0, status="failed", error_message=str(error))
                error_conn.commit()
            raise

    # --- Binder invoices ---
    binder_sources = discover_binder_xlsx_files()
    binder_inserted_total = 0
    binder_updated_total = 0
    binder_skipped_total = 0

    for binder_path in binder_sources:
        file_hash = sha256_file(binder_path)
        with psycopg.connect(database_url) as bconn:
            bconn.execute("SET TIME ZONE 'UTC'")
            bwriter = ImportWriter(bconn)

            existing = bwriter.find_completed_import("binder_xlsx", file_hash)
            if existing is not None:
                binder_rows = parse_binder_invoices(binder_path)
                binder_skipped_total += len(binder_rows)
                print(f"Binder: {binder_path.name} already imported, skipping ({len(binder_rows)} rows)")
                continue

            binder_rows = parse_binder_invoices(binder_path)
            binder_import = bwriter.create_import(
                "binder_xlsx",
                binder_path.name,
                file_hash,
                len(binder_rows),
            )
            bconn.commit()

            try:
                b_inserted, b_updated = bwriter.upsert_binder_invoices(binder_rows, binder_import)
                bwriter.finish_import(
                    binder_import,
                    inserted=b_inserted,
                    updated=b_updated,
                    skipped=max(0, len(binder_rows) - b_inserted - b_updated),
                )
                bconn.commit()
                binder_inserted_total += b_inserted
                binder_updated_total += b_updated
            except Exception as error:
                bconn.rollback()
                with psycopg.connect(database_url) as error_conn:
                    error_writer = ImportWriter(error_conn)
                    error_writer.finish_import(
                        binder_import,
                        inserted=0,
                        updated=0,
                        skipped=0,
                        status="failed",
                        error_message=str(error),
                    )
                    error_conn.commit()
                raise

    print("PostgreSQL import completed")
    print(f"Sales sources: {len(sales_sources)} files from {SALES_XML.parent}")
    print(f"Catalog source: {CATALOG_XLSX}")
    print(f"Lieferanten source: {LIEFERANT_XLSX}")
    print(f"Inventory source: {INVENTORY_TXT}")
    print(f"SKUs: {len(products)}")
    print(f"Sales rows: {total_sales_rows}")
    print(f"Inventory rows: {len(inventory_records)}")
    print(f"Snapshot date: {snapshot_date}")
    print(f"Binder sources: {len(binder_sources)} files")
    print(f"Binder rows: inserted={binder_inserted_total}, updated={binder_updated_total}, skipped={binder_skipped_total}")


if __name__ == "__main__":
    main()
