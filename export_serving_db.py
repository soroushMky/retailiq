"""
export_serving_db.py
Builds a small, read-only copy of the database for deployment: only the tables the API reads
(no raw_* tables, no 1M-row geolocation file). Run after build.py:

    .venv/Scripts/python.exe export_serving_db.py

Output: data/serving/retailiq.duckdb  (this one file is committed so the hosted API can use it)
"""
import sys
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
SRC = HERE / "data" / "retailiq.duckdb"
DST = HERE / "data" / "serving" / "retailiq.duckdb"
TABLES = ["fct_orders", "std_order_items", "std_payments", "std_products", "std_zip_geo"]

DST.parent.mkdir(parents=True, exist_ok=True)
for f in (DST, DST.with_suffix(".duckdb.wal")):
    f.unlink(missing_ok=True)

con = duckdb.connect(str(DST))
con.execute(f"ATTACH '{SRC.as_posix()}' AS src (READ_ONLY)")

ok = True
for t in TABLES:
    con.execute(f"CREATE TABLE {t} AS SELECT * FROM src.{t}")
    a = con.execute(f"SELECT COUNT(*) FROM src.{t}").fetchone()[0]
    b = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    ok &= a == b
    print(f"{'PASS' if a == b else 'FAIL'}  {t:<16} {b:>9,} rows")

con.execute("DETACH src")
con.execute("CHECKPOINT")
con.close()

print(f"\n{DST.relative_to(HERE)}: {DST.stat().st_size / 1e6:.1f} MB   (duckdb {duckdb.__version__})")
sys.exit(0 if ok else 1)
