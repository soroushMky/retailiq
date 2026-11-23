"""
api/analytics.py
Analytics layer for the API: SQL only, no web framework, no Streamlit.
Every function returns plain Python data (dicts / lists) ready to be sent as JSON.
"""
from functools import lru_cache
from pathlib import Path

import duckdb
import pandas as pd

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "retailiq.duckdb"

REGION_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}

_con = duckdb.connect(str(DB_PATH), read_only=True)


# ---------------------------------------------------------------- helpers
def _df(sql: str, params: list | None = None) -> pd.DataFrame:
    """Run a query on a fresh cursor (safe when several requests arrive at once)."""
    return _con.cursor().execute(sql, params or []).df()


def _records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of dicts, with NaN turned into None (NaN is not valid JSON)."""
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _order_filter(start: str, end: str, regions: tuple[str, ...]):
    sql = "WHERE purchase_month BETWEEN ? AND ?"
    params: list = [start, end]
    if regions:
        sql += f" AND region IN ({', '.join(['?'] * len(regions))})"
        params += list(regions)
    return sql, params


# ---------------------------------------------------------------- filter options
@lru_cache
def filter_options() -> dict:
    months = _df("SELECT DISTINCT purchase_month FROM fct_orders ORDER BY 1")["purchase_month"].tolist()
    codes = _df("SELECT DISTINCT region FROM fct_orders ORDER BY 1")["region"].tolist()
    return {
        "months": months,
        "regions": [{"code": c, "name": REGION_NAMES.get(c, c)} for c in codes],
        "default_start": "2017-01",
        "default_end": "2018-08",
    }


@lru_cache
def all_categories() -> frozenset[str]:
    """Allow-list used to validate the ?category= parameter."""
    return frozenset(_df("SELECT DISTINCT category FROM std_products")["category"].tolist())


# ---------------------------------------------------------------- KPIs
@lru_cache(maxsize=256)
def kpis(start: str, end: str, regions: tuple[str, ...]) -> dict:
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        SELECT
            COUNT(*)                                            AS total_orders,
            COUNT(*) FILTER (WHERE is_delivered)                AS delivered_orders,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered AND n_units > 0)
              / NULLIF(COUNT(*) FILTER (WHERE is_delivered AND n_units > 0), 0)
                                                                AS aov,
            SUM(n_units) FILTER (WHERE is_delivered)            AS units,
            COUNT(DISTINCT customer_id)                         AS customers,
            AVG(review_score)                                   AS avg_review,
            100.0 * AVG(CAST(is_late AS INTEGER))               AS late_rate
        FROM fct_orders
        {where}
    """, params)
    return _records(df)[0]


# ---------------------------------------------------------------- overview charts
@lru_cache(maxsize=256)
def monthly_trend(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            purchase_month                                      AS month,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv,
            COUNT(*) FILTER (WHERE is_delivered)                AS orders,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered AND n_units > 0)
              / NULLIF(COUNT(*) FILTER (WHERE is_delivered AND n_units > 0), 0)
                                                                AS aov
        FROM fct_orders
        {where}
        GROUP BY purchase_month
        ORDER BY purchase_month
    """, params))


@lru_cache(maxsize=256)
def top_categories(start: str, end: str, regions: tuple[str, ...], limit: int = 10) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            p.category,
            SUM(i.unit_price)            AS gmv,
            COUNT(DISTINCT i.order_id)   AS orders,
            COUNT(*)                     AS units
        FROM std_order_items AS i
        JOIN std_products    AS p ON i.product_id = p.product_id
        JOIN fct_orders      AS o ON i.order_id   = o.order_id
        {where} AND o.is_delivered
        GROUP BY p.category
        ORDER BY gmv DESC
        LIMIT ?
    """, params + [limit]))


@lru_cache(maxsize=256)
def orders_by_region(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        SELECT
            region,
            COUNT(*)                                            AS orders,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv
        FROM fct_orders
        {where}
        GROUP BY region
        ORDER BY orders DESC
    """, params)
    df["region_name"] = df["region"].map(lambda c: REGION_NAMES.get(c, c))
    return _records(df)


@lru_cache(maxsize=256)
def orders_by_city(start: str, end: str, regions: tuple[str, ...], limit: int = 10) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            city,
            region,
            COUNT(*)                                            AS orders,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv
        FROM fct_orders
        {where}
        GROUP BY city, region
        ORDER BY orders DESC
        LIMIT ?
    """, params + [limit]))


# ---------------------------------------------------------------- map
@lru_cache(maxsize=128)
def geo_points(start: str, end: str, regions: tuple[str, ...], cell: float = 0.1) -> dict:
    """Orders binned on a lat/lng grid. cell = grid size in degrees (0.1 ~ 10 km, 0.5 ~ 50 km)."""
    where, params = _order_filter(start, end, regions)
    points = _df(f"""
        SELECT
            ROUND(g.lat / ?) * ?   AS lat,
            ROUND(g.lng / ?) * ?   AS lng,
            COUNT(*)               AS orders
        FROM fct_orders  AS o
        JOIN std_zip_geo AS g ON o.zip_prefix = g.zip_prefix
        {where}
        GROUP BY 1, 2
        ORDER BY orders DESC
    """, [cell, cell, cell, cell] + params)
    total = int(_df(f"SELECT COUNT(*) AS n FROM fct_orders {where}", params)["n"].iloc[0])
    mapped = int(points["orders"].sum())
    return {
        "points": _records(points),
        "mapped_orders": mapped,
        "total_orders": total,
        "coverage_pct": 100.0 * mapped / total if total else None,
    }


# ---------------------------------------------------------------- delivery & experience
@lru_cache(maxsize=256)
def delivery_kpis(start: str, end: str, regions: tuple[str, ...]) -> dict:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            100.0 * AVG(CAST(is_late AS INTEGER))                    AS late_rate,
            AVG(delivery_days)                                       AS avg_delivery_days,
            AVG(review_score) FILTER (WHERE is_late = false)         AS review_on_time,
            AVG(review_score) FILTER (WHERE is_late = true)          AS review_late,
            AVG(review_score) FILTER (WHERE is_late = false)
              - AVG(review_score) FILTER (WHERE is_late = true)      AS review_gap,
            COUNT(*) FILTER (WHERE is_late IS NOT NULL)              AS delivered_measured,
            COUNT(*) FILTER (WHERE is_late)                          AS late_orders
        FROM fct_orders
        {where}
    """, params))[0]


@lru_cache(maxsize=256)
def review_by_status(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            CASE WHEN is_late THEN 'Late' ELSE 'On time / early' END AS delivery,
            COUNT(*)                                                  AS orders,
            AVG(review_score)                                         AS avg_review,
            100.0 * AVG(CAST(review_score <= 2 AS INTEGER))           AS pct_negative
        FROM fct_orders
        {where} AND is_late IS NOT NULL AND review_score IS NOT NULL
        GROUP BY 1
    """, params))


@lru_cache(maxsize=256)
def review_by_days(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        WITH d AS (
            SELECT
                -- negative = arrived early, positive = late; capped at +/-20 days
                GREATEST(-20, LEAST(20,
                    date_diff('day', CAST(promised_at AS DATE), CAST(delivered_at AS DATE))
                ))                  AS days_vs_promise,
                review_score
            FROM fct_orders
            {where} AND is_late IS NOT NULL AND review_score IS NOT NULL
        )
        SELECT days_vs_promise, COUNT(*) AS orders, AVG(review_score) AS avg_review
        FROM d
        GROUP BY days_vs_promise
        ORDER BY days_vs_promise
    """, params))


@lru_cache(maxsize=256)
def late_by_region(start: str, end: str, regions: tuple[str, ...], min_orders: int = 300) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        SELECT
            region,
            COUNT(*)                                  AS delivered_orders,
            100.0 * AVG(CAST(is_late AS INTEGER))     AS late_rate,
            AVG(delivery_days)                        AS avg_delivery_days,
            AVG(review_score)                         AS avg_review
        FROM fct_orders
        {where} AND is_late IS NOT NULL
        GROUP BY region
        HAVING COUNT(*) >= ?
        ORDER BY late_rate DESC
    """, params + [min_orders])
    df["region_name"] = df["region"].map(lambda c: REGION_NAMES.get(c, c))
    return _records(df)


# ---------------------------------------------------------------- products & opportunity matrix
_QUADRANT = {  # (high GMV?, good reviews?) -> label
    (True, False): "investigate",   # lots of money, unhappy customers: look here first
    (True, True): "protect",        # lots of money, happy customers
    (False, True): "grow",          # small but loved: room to scale
    (False, False): "monitor",      # small and weak
}


@lru_cache(maxsize=256)
def category_performance(start: str, end: str, regions: tuple[str, ...], min_orders: int = 100) -> dict:
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        WITH order_category AS (      -- step 1: items -> one row per (order, category): no double-counted reviews
            SELECT
                i.order_id,
                p.category,
                SUM(i.unit_price)      AS gmv,
                SUM(i.shipping_cost)   AS freight,
                COUNT(*)               AS units
            FROM std_order_items AS i
            JOIN std_products    AS p ON i.product_id = p.product_id
            GROUP BY i.order_id, p.category
        )
        SELECT                        -- step 2: one row per order joins safely; aggregate per category
            oc.category,
            SUM(oc.gmv)                                   AS gmv,
            COUNT(*)                                      AS orders,
            SUM(oc.units)                                 AS units,
            SUM(oc.gmv) / SUM(oc.units)                   AS avg_item_price,
            100.0 * SUM(oc.freight) / SUM(oc.gmv)         AS freight_pct,
            AVG(o.review_score)                           AS avg_review,
            100.0 * AVG(CAST(o.is_late AS INTEGER))       AS late_rate
        FROM order_category AS oc
        JOIN fct_orders     AS o ON oc.order_id = o.order_id
        {where} AND o.is_delivered
        GROUP BY oc.category
        HAVING COUNT(*) >= ?
        ORDER BY gmv DESC
    """, params + [min_orders])

    if df.empty:
        return {"categories": [], "median_review": None, "median_gmv": None, "min_orders": min_orders}

    median_review = float(df["avg_review"].median())
    median_gmv = float(df["gmv"].median())
    df["quadrant"] = [
        _QUADRANT[(g >= median_gmv, r >= median_review)] for g, r in zip(df["gmv"], df["avg_review"])
    ]
    return {
        "categories": _records(df),
        "median_review": median_review,
        "median_gmv": median_gmv,
        "min_orders": min_orders,
    }


@lru_cache(maxsize=512)
def category_monthly(start: str, end: str, regions: tuple[str, ...], category: str) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            o.purchase_month             AS month,
            SUM(i.unit_price)            AS gmv,
            COUNT(DISTINCT i.order_id)   AS orders
        FROM std_order_items AS i
        JOIN std_products    AS p ON i.product_id = p.product_id
        JOIN fct_orders      AS o ON i.order_id   = o.order_id
        {where} AND o.is_delivered AND p.category = ?
        GROUP BY o.purchase_month
        ORDER BY o.purchase_month
    """, params + [category]))


# ---------------------------------------------------------------- sales
FULL_START, FULL_END = "2017-01", "2018-08"   # months outside this range are incomplete in the dataset
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _is_partial(month: str) -> bool:
    return month < FULL_START or month > FULL_END


@lru_cache(maxsize=256)
def sales_monthly(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        WITH m AS (
            SELECT
                purchase_month                                      AS month,
                SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv,
                COUNT(*) FILTER (WHERE is_delivered)                AS orders
            FROM fct_orders
            {where}
            GROUP BY purchase_month
        )
        SELECT
            month,
            gmv,
            orders,
            gmv / NULLIF(orders, 0)                                 AS aov,
            -- window function: compare each month with the one before it
            100.0 * (gmv - LAG(gmv) OVER (ORDER BY month))
                  / NULLIF(LAG(gmv) OVER (ORDER BY month), 0)       AS gmv_mom_pct,
            LAG(month) OVER (ORDER BY month)                        AS prev_month
        FROM m
        ORDER BY month
    """, params)
    df["is_partial"] = df["month"].map(_is_partial)
    # A month-over-month change is only meaningful between two complete months
    comparable = ~df["is_partial"] & df["prev_month"].notna() & ~df["prev_month"].fillna(FULL_START).map(_is_partial)
    df.loc[~comparable, "gmv_mom_pct"] = None
    return _records(df.drop(columns=["prev_month"]))


@lru_cache(maxsize=256)
def period_comparison(start: str, end: str, regions: tuple[str, ...]) -> dict:
    """Like-for-like growth: the latest year in range vs the same months of the year before."""
    where, params = _order_filter(start, end, regions)
    df = _df(f"""
        SELECT
            purchase_month                                      AS month,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv,
            COUNT(*) FILTER (WHERE is_delivered)                AS orders
        FROM fct_orders
        {where}
        GROUP BY purchase_month
    """, params)
    df = df[~df["month"].map(_is_partial)]
    empty = {"available": False, "label": None}
    if df.empty:
        return empty
    df["year"] = df["month"].str[:4].astype(int)
    df["mm"] = df["month"].str[5:7]
    cur_year = int(df["year"].max())
    cur = df[df["year"] == cur_year].set_index("mm")
    prev = df[df["year"] == cur_year - 1].set_index("mm")
    months = sorted(set(cur.index) & set(prev.index))
    if not months:
        return empty

    cur_gmv, prev_gmv = float(cur.loc[months, "gmv"].sum()), float(prev.loc[months, "gmv"].sum())
    cur_orders, prev_orders = int(cur.loc[months, "orders"].sum()), int(prev.loc[months, "orders"].sum())
    names = [MONTH_NAMES[int(m) - 1] for m in months]
    span = names[0] if len(names) == 1 else f"{names[0]}–{names[-1]}"
    return {
        "available": True,
        "label": f"{span} {cur_year} vs {span} {cur_year - 1}",
        "months": len(months),
        "current_gmv": cur_gmv,
        "previous_gmv": prev_gmv,
        "gmv_growth_pct": 100.0 * (cur_gmv - prev_gmv) / prev_gmv if prev_gmv else None,
        "current_orders": cur_orders,
        "previous_orders": prev_orders,
        "orders_growth_pct": 100.0 * (cur_orders - prev_orders) / prev_orders if prev_orders else None,
    }


@lru_cache(maxsize=256)
def top_products(start: str, end: str, regions: tuple[str, ...], limit: int = 20) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            LEFT(i.product_id, 8)          AS product,
            p.category,
            SUM(i.unit_price)              AS gmv,
            COUNT(*)                       AS units,
            COUNT(DISTINCT i.order_id)     AS orders,
            AVG(i.unit_price)              AS avg_price
        FROM std_order_items AS i
        JOIN std_products    AS p ON i.product_id = p.product_id
        JOIN fct_orders      AS o ON i.order_id   = o.order_id
        {where} AND o.is_delivered
        GROUP BY i.product_id, p.category
        ORDER BY gmv DESC
        LIMIT ?
    """, params + [limit]))


@lru_cache(maxsize=256)
def payment_mix(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            pm.method,
            COUNT(*)                                                AS payments,
            SUM(pm.amount)                                          AS amount,
            -- window function: this method's share of the grand total
            100.0 * SUM(pm.amount) / SUM(SUM(pm.amount)) OVER ()    AS share_pct
        FROM std_payments AS pm
        JOIN fct_orders   AS o ON pm.order_id = o.order_id
        {where} AND o.is_delivered AND pm.method <> 'not_defined'
        GROUP BY pm.method
        ORDER BY amount DESC
    """, params))


# ---------------------------------------------------------------- customers
@lru_cache(maxsize=256)
def customer_kpis(start: str, end: str, regions: tuple[str, ...]) -> dict:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        WITH c AS (                     -- one row per person
            SELECT customer_id, COUNT(*) AS n_orders
            FROM fct_orders
            {where}
            GROUP BY customer_id
        )
        SELECT
            COUNT(*)                                      AS customers,
            COUNT(*) FILTER (WHERE n_orders > 1)          AS repeat_customers,
            100.0 * AVG(CAST(n_orders > 1 AS INTEGER))    AS repeat_rate,
            AVG(n_orders)                                 AS avg_orders
        FROM c
    """, params))[0]


@lru_cache(maxsize=256)
def repeat_vs_one_time(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        WITH c AS (
            SELECT
                customer_id,
                COUNT(*)                                                    AS n_orders,
                SUM(merchandise_gmv) FILTER (WHERE is_delivered)            AS gmv,
                COUNT(*) FILTER (WHERE is_delivered AND n_units > 0)        AS delivered_orders
            FROM fct_orders
            {where}
            GROUP BY customer_id
        )
        SELECT
            CASE WHEN n_orders > 1 THEN 'Repeat' ELSE 'One-time' END  AS segment,
            COUNT(*)                                                  AS customers,
            AVG(COALESCE(gmv, 0))                                     AS avg_spend_per_customer,
            SUM(gmv) / NULLIF(SUM(delivered_orders), 0)               AS aov
        FROM c
        GROUP BY 1
    """, params))


@lru_cache(maxsize=256)
def order_frequency(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        WITH c AS (
            SELECT customer_id, COUNT(*) AS n
            FROM fct_orders
            {where}
            GROUP BY customer_id
        )
        SELECT
            CASE WHEN n >= 4 THEN '4+' ELSE CAST(n AS VARCHAR) END  AS orders_per_customer,
            COUNT(*)                                                AS customers
        FROM c
        GROUP BY 1
        ORDER BY 1
    """, params))


@lru_cache(maxsize=256)
def purchase_heatmap(start: str, end: str, regions: tuple[str, ...]) -> list[dict]:
    where, params = _order_filter(start, end, regions)
    return _records(_df(f"""
        SELECT
            isodow(purchased_at)   AS weekday,     -- 1 = Monday ... 7 = Sunday
            hour(purchased_at)     AS hour,
            COUNT(*)               AS orders
        FROM fct_orders
        {where}
        GROUP BY 1, 2
    """, params))


def _add_months(ym: str, k: int) -> str:
    t = int(ym[:4]) * 12 + int(ym[5:7]) - 1 + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


@lru_cache(maxsize=128)
def cohort_retention(start: str, end: str, regions: tuple[str, ...], max_k: int = 6) -> dict:
    """
    Cohort = the month of a person's FIRST ever order (over all history, not just the range).
    Cell (cohort, k) = % of that cohort who ordered again exactly k months later.
    Cells after the last complete month of data are None: not observed yet, which is not the same as 0%.
    """
    region_sql, region_params = "", []
    if regions:
        region_sql = f"AND region IN ({', '.join(['?'] * len(regions))})"
        region_params = list(regions)

    df = _df(f"""
        WITH o AS (
            SELECT
                customer_id,
                purchase_month,
                MIN(purchase_month) OVER (PARTITION BY customer_id) AS cohort   -- window function
            FROM fct_orders
            WHERE status NOT IN ('canceled', 'unavailable') {region_sql}
        ),
        activity AS (
            SELECT DISTINCT
                customer_id,
                cohort,
                (CAST(SUBSTR(purchase_month, 1, 4) AS INTEGER) - CAST(SUBSTR(cohort, 1, 4) AS INTEGER)) * 12
              + (CAST(SUBSTR(purchase_month, 6, 2) AS INTEGER) - CAST(SUBSTR(cohort, 6, 2) AS INTEGER)) AS k
            FROM o
        )
        SELECT cohort, k, COUNT(*) AS customers
        FROM activity
        WHERE cohort BETWEEN ? AND ? AND k BETWEEN 0 AND ?
        GROUP BY cohort, k
        ORDER BY cohort, k
    """, region_params + [max(start, FULL_START), min(end, FULL_END), max_k])

    rows = []
    for cohort, g in df.groupby("cohort"):
        counts = dict(zip(g["k"], g["customers"]))
        size = int(counts.get(0, 0))
        if size == 0:
            continue
        cells = []
        for k in range(1, max_k + 1):
            observed = _add_months(cohort, k) <= FULL_END
            cells.append(100.0 * counts.get(k, 0) / size if observed else None)
        rows.append({"cohort": cohort, "size": size, "cells": cells})
    return {"rows": rows, "max_k": max_k, "data_end": FULL_END}
