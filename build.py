from pathlib import Path
import sys

import duckdb

HERE = Path(__file__).resolve().parent
SQL_DIR = HERE / "sql" / "olist_to_standard"
DB_PATH = HERE / "data" / "retailiq.duckdb"


# ---------------------------------------------------------------- 1. build the tables
con = duckdb.connect(str(DB_PATH))   # not read-only: this script creates tables

for sql_file in sorted(SQL_DIR.glob("*.sql")):
    con.execute(sql_file.read_text(encoding="utf-8"))
    print("ran", sql_file.name)

print()


# ---------------------------------------------------------------- 2. data-quality checks
# each query must return a single True / False
checks = {
    # --- std_orders
    "std_orders: one row per order":
        "SELECT COUNT(*) = COUNT(DISTINCT order_id) FROM std_orders",

    # --- std_products
    "std_products: one row per product":
        "SELECT COUNT(*) = COUNT(DISTINCT product_id) FROM std_products",
    "std_products: same count as raw":
        "SELECT (SELECT COUNT(*) FROM std_products) = (SELECT COUNT(*) FROM raw_products)",

    # --- std_order_items
    "std_order_items: one row per (order, line)":
        "SELECT COUNT(*) = COUNT(DISTINCT (order_id, line_number)) FROM std_order_items",
    "std_order_items: money unchanged vs raw":
        "SELECT (SELECT SUM(unit_price) FROM std_order_items) = (SELECT SUM(price) FROM raw_order_items)",

    # --- std_payments
    "std_payments: one row per (order, seq)":
        "SELECT COUNT(*) = COUNT(DISTINCT (order_id, payment_seq)) FROM std_payments",
    "std_payments: money unchanged vs raw":
        "SELECT (SELECT SUM(amount) FROM std_payments) = (SELECT SUM(payment_value) FROM raw_payments)",

    # --- std_reviews
    "std_reviews: scores between 1 and 5":
        "SELECT MIN(score) >= 1 AND MAX(score) <= 5 FROM std_reviews",

    # --- fct_orders
    "fct_orders: one row per order":
        "SELECT COUNT(*) = COUNT(DISTINCT order_id) FROM fct_orders",
    "fct_orders: no orders lost":
        "SELECT (SELECT COUNT(*) FROM fct_orders) = (SELECT COUNT(*) FROM std_orders)",
    "fct_orders: GMV equals sum of items (no fan-out)":
        "SELECT ABS((SELECT SUM(merchandise_gmv) FROM fct_orders)"
        " - (SELECT SUM(unit_price) FROM std_order_items)) < 0.01",
    "fct_orders: payments equal raw":
        "SELECT ABS((SELECT SUM(payments_total) FROM fct_orders)"
        " - (SELECT SUM(amount) FROM std_payments)) < 0.01",
        "std_zip_geo: one row per zip":
        "SELECT COUNT(*) = COUNT(DISTINCT zip_prefix) FROM std_zip_geo",
    "fct_orders: >= 99% of orders can be placed on the map":
        "SELECT AVG(CAST(g.zip_prefix IS NOT NULL AS INTEGER)) >= 0.99 "
        "FROM fct_orders o LEFT JOIN std_zip_geo g ON o.zip_prefix = g.zip_prefix",
            # --- geography
    "std_zip_geo: one row per zip":
        "SELECT COUNT(*) = COUNT(DISTINCT zip_prefix) FROM std_zip_geo",
    "fct_orders: >= 99% of orders can be placed on the map":
        "SELECT AVG(CAST(g.zip_prefix IS NOT NULL AS INTEGER)) >= 0.99 "
        "FROM fct_orders o LEFT JOIN std_zip_geo g ON o.zip_prefix = g.zip_prefix",
}

failed = 0
for name, sql in checks.items():
    passed = con.execute(sql).fetchone()[0]
    print(("PASS  " if passed else "FAIL  ") + name)
    if not passed:
        failed += 1

con.close()


# ---------------------------------------------------------------- 3. summary
print()
print(f"{len(checks) - failed}/{len(checks)} checks passed")

if failed:
    sys.exit(1)   # non-zero exit code = "something went wrong" (useful later for automated tests)