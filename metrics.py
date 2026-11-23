from pathlib import Path
import sys

import duckdb

HERE = Path(__file__).resolve().parent
con = duckdb.connect(str(HERE / "data" / "retailiq.duckdb"), read_only=True)

# name: (SQL that returns one number, expected baseline, decimals to compare)
METRICS = {
    "total_orders": (
        "SELECT COUNT(*) FROM fct_orders",
        99_441, 0),

    "delivered_orders": (
        "SELECT COUNT(*) FILTER (WHERE is_delivered) FROM fct_orders",
        96_478, 0),

    "order_item_records": (
        "SELECT COUNT(*) FROM std_order_items",
        112_650, 0),

    "delivered_merchandise_gmv": (
        "SELECT SUM(merchandise_gmv) FILTER (WHERE is_delivered) FROM fct_orders",
        13_221_498.11, 2),

    "delivered_aov": (
        """SELECT SUM(merchandise_gmv) / COUNT(*)
           FROM fct_orders
           WHERE is_delivered AND n_units > 0""",
        137.04, 2),

    "delivered_units": (
        "SELECT SUM(n_units) FILTER (WHERE is_delivered) FROM fct_orders",
        110_197, 0),

    "delivered_freight": (
        "SELECT SUM(shipping_total) FILTER (WHERE is_delivered) FROM fct_orders",
        2_198_275.64, 2),

    "late_delivery_rate_pct": (
        """SELECT 100.0 * AVG(CAST(is_late AS INTEGER))
           FROM fct_orders
           WHERE is_late IS NOT NULL""",
        8.11, 2),

    "repeat_customers": (
        """SELECT COUNT(*) FROM (
               SELECT customer_id
               FROM fct_orders
               GROUP BY customer_id
               HAVING COUNT(*) > 1
           )""",
        2_997, 0),

    "avg_review_on_time": (
        "SELECT AVG(review_score) FROM fct_orders WHERE is_late = false",
        4.294, 3),

    "avg_review_late": (
        "SELECT AVG(review_score) FROM fct_orders WHERE is_late = true",
        2.567, 3),
}

failed = 0
print(f"{'metric':<28}{'computed':>18}{'baseline':>18}   result")
print("-" * 72)

for name, (sql, baseline, decimals) in METRICS.items():
    value = con.execute(sql).fetchone()[0]
    computed = round(float(value), decimals)
    ok = computed == round(baseline, decimals)
    if not ok:
        failed += 1
    print(f"{name:<28}{computed:>18,.{decimals}f}{baseline:>18,.{decimals}f}   {'OK' if ok else 'DIFF'}")

con.close()
print("-" * 72)
print(f"{len(METRICS) - failed}/{len(METRICS)} metrics match the baseline")
if failed:
    sys.exit(1)