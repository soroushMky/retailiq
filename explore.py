from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parent
con = duckdb.connect(str(HERE / "data" / "retailiq.duckdb"), read_only=True)

def q(sql: str):
    """Run a query and print the result as a table."""
    print(con.sql(sql))

# Example: is order_id unique in raw_orders?
q("""
    SELECT COUNT(*)                 AS total_rows,
           COUNT(DISTINCT order_id) AS distinct_orders
    FROM raw_orders
""")

q("""
    SELECT COUNT(*)                   AS total_rows,
           COUNT(DISTINCT review_id)  AS distinct_reviews,
           COUNT(DISTINCT order_id)   AS distinct_orders
    FROM raw_reviews
""")
q("""
    SELECT COUNT(*)                            AS total_rows,
           COUNT(DISTINCT customer_id)         AS distinct_customer_ids,
           COUNT(DISTINCT customer_unique_id)  AS distinct_people
    FROM raw_customers
""")
q("""
    SELECT COUNT(*) AS orders_with_multiple_payments
    FROM (
        SELECT order_id
        FROM raw_payments
        GROUP BY order_id
        HAVING COUNT(*) > 1
    )
""")
q("""
    SELECT order_id, COUNT(*) AS n_items
    FROM raw_order_items
    GROUP BY order_id
    ORDER BY n_items DESC
    LIMIT 5
""")
q("""
    SELECT DISTINCT p.product_category_name
    FROM raw_products AS p
    LEFT JOIN raw_category_translation AS t
           ON p.product_category_name = t.product_category_name
    WHERE t.product_category_name IS NULL
      AND p.product_category_name IS NOT NULL
""")
q("""
    SELECT category, COUNT(*) AS n_products
    FROM std_products
    WHERE category IN ('pc_gamer', 'kitchen_portables_and_food_preparers', 'uncategorized')
    GROUP BY category
""")