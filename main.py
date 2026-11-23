from pathlib import Path
import duckdb

# Folder this file lives in
HERE = Path(__file__).resolve().parent

# Point these at your folders (relative to this file)
RAW_DIR = HERE / "data" / "raw"
DB_PATH = HERE / "data" / "retailiq.duckdb"

files = {
    "orders": "olist_orders_dataset.csv",
    "order_items": "olist_order_items_dataset.csv",
    "payments": "olist_order_payments_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "products": "olist_products_dataset.csv",
    "reviews": "olist_order_reviews_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "geolocation": "olist_geolocation_dataset.csv",
    "category_translation": "product_category_name_translation.csv",
}

con = duckdb.connect(str(DB_PATH))

for table, file in files.items():
    path = RAW_DIR / file
    con.execute(f"""
        CREATE OR REPLACE TABLE raw_{table} AS
        SELECT * FROM read_csv_auto('{path.as_posix()}', header=true)
    """)
    n = con.execute(f"SELECT COUNT(*) FROM raw_{table}").fetchone()[0]
    print(f"raw_{table:<22}{n:>10,} rows")