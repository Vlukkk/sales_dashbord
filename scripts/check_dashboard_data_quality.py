#!/usr/bin/env python3
"""Validate that generated dashboard data preserves source sales/inventory coverage."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from preprocess import BASE_DIR, parse_inventory, parse_lieferanten, parse_sales
except ModuleNotFoundError:
    from scripts.preprocess import BASE_DIR, parse_inventory, parse_lieferanten, parse_sales

DATA_DIR = BASE_DIR / "dashboard" / "public" / "data"
REPORTS_DIR = BASE_DIR / "reports"
REPORT_PATH = REPORTS_DIR / f"dashboard_data_quality_{date.today().isoformat()}.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build_supplier_summary(supplier_by_sku: Dict[str, str], inventory_records: Dict[str, dict]) -> Dict[str, dict]:
    summary = defaultdict(
        lambda: {
            "skuCount": 0,
            "skusWithStock": 0,
            "sellable": 0,
            "unsellable": 0,
            "total": 0,
        }
    )

    for sku, record in inventory_records.items():
        supplier = supplier_by_sku.get(sku) or "Без поставщика"
        group = summary[supplier]
        group["skuCount"] += 1
        if record.get("sellable", 0) > 0:
            group["skusWithStock"] += 1
        group["sellable"] += record.get("sellable", 0)
        group["unsellable"] += record.get("unsellable", 0)
        group["total"] += record.get("total", 0)

    return dict(summary)


def diff_supplier_summaries(raw: Dict[str, dict], project: Dict[str, dict]) -> List[dict]:
    mismatches: List[dict] = []
    for supplier in sorted(set(raw) | set(project)):
        raw_values = raw.get(
            supplier,
            {"skuCount": 0, "skusWithStock": 0, "sellable": 0, "unsellable": 0, "total": 0},
        )
        project_values = project.get(
            supplier,
            {"skuCount": 0, "skusWithStock": 0, "sellable": 0, "unsellable": 0, "total": 0},
        )
        if raw_values != project_values:
            mismatches.append(
                {
                    "lieferant": supplier,
                    "source": raw_values,
                    "project": project_values,
                }
            )
    return mismatches


def main() -> int:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    raw_sales = parse_sales()
    raw_inventory = parse_inventory()["records"]
    raw_supplier_map = parse_lieferanten()

    project_sales = load_json(DATA_DIR / "sales.json")
    project_catalog = load_json(DATA_DIR / "products.json")
    project_inventory = load_json(DATA_DIR / "inventory.json")

    raw_sales_skus = {row["artikelposition"] for row in raw_sales if row.get("artikelposition")}
    raw_inventory_skus = set(raw_inventory.keys())
    relevant_skus = raw_sales_skus | raw_inventory_skus
    project_product_skus = set(project_catalog["products"].keys())
    project_inventory_skus = set(project_inventory["records"].keys())
    project_supplier_map = {
        sku: product.get("lieferant")
        for sku, product in project_catalog["products"].items()
        if product.get("lieferant")
    }

    missing_sales_products = sorted(raw_sales_skus - project_product_skus)
    missing_inventory_products = sorted(raw_inventory_skus - project_product_skus)
    missing_inventory_records = sorted(raw_inventory_skus - project_inventory_skus)
    extra_inventory_records = sorted(project_inventory_skus - raw_inventory_skus)

    supplier_label_mismatches = []
    for sku in sorted(relevant_skus):
        supplier = raw_supplier_map.get(sku)
        project_supplier = project_supplier_map.get(sku)
        if project_supplier != supplier:
            supplier_label_mismatches.append(
                {
                    "sku": sku,
                    "source": supplier,
                    "project": project_supplier,
                }
            )

    raw_summary = build_supplier_summary(raw_supplier_map, raw_inventory)
    project_summary = build_supplier_summary(project_supplier_map, project_inventory["records"])
    supplier_summary_mismatches = diff_supplier_summaries(raw_summary, project_summary)

    report = {
        "generatedAt": date.today().isoformat(),
        "source": {
            "salesRows": len(raw_sales),
            "salesSkus": len(raw_sales_skus),
            "inventorySkus": len(raw_inventory_skus),
            "supplierMappings": len(raw_supplier_map),
        },
        "project": {
            "salesRows": len(project_sales),
            "productSkus": len(project_product_skus),
            "inventorySkus": len(project_inventory_skus),
        },
        "checks": {
            "salesRowCountMatches": len(raw_sales) == len(project_sales),
            "missingSalesProducts": missing_sales_products,
            "missingInventoryProducts": missing_inventory_products,
            "missingInventoryRecords": missing_inventory_records,
            "extraInventoryRecords": extra_inventory_records,
            "supplierLabelMismatches": supplier_label_mismatches,
            "supplierSummaryMismatches": supplier_summary_mismatches,
        },
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Quality report saved to {REPORT_PATH}")
    print(f"Source sales rows: {len(raw_sales)} | Project sales rows: {len(project_sales)}")
    print(f"Source inventory SKUs: {len(raw_inventory_skus)} | Project inventory SKUs: {len(project_inventory_skus)}")
    print(f"Project product SKUs: {len(project_product_skus)}")

    issues: List[Tuple[str, int]] = []
    if len(raw_sales) != len(project_sales):
        issues.append(("sales row count mismatch", abs(len(raw_sales) - len(project_sales))))
    if missing_sales_products:
        issues.append(("sales SKU missing in products.json", len(missing_sales_products)))
    if missing_inventory_products:
        issues.append(("inventory SKU missing in products.json", len(missing_inventory_products)))
    if missing_inventory_records:
        issues.append(("inventory SKU missing in inventory.json", len(missing_inventory_records)))
    if extra_inventory_records:
        issues.append(("extra inventory SKU in inventory.json", len(extra_inventory_records)))
    if supplier_label_mismatches:
        issues.append(("supplier label mismatches", len(supplier_label_mismatches)))
    if supplier_summary_mismatches:
        issues.append(("supplier summary mismatches", len(supplier_summary_mismatches)))

    if issues:
        print("Data quality check failed:")
        for label, count in issues:
            print(f"- {label}: {count}")
        return 1

    print("Data quality check passed: no sales/inventory/supplier losses detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
