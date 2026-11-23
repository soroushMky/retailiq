"""
queries.py
All SQL for the dashboard lives here. The UI (app.py) never calculates metrics itself.
"""
from pathlib import Path

import duckdb
import streamlit as st

DB_PATH = Path(__file__).resolve().parent / "data" / "retailiq.duckdb"
# Brazilian state codes -> full names (display only; the database keeps the 2-letter code)
REGION_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}


def region_name(code: str) -> str:
    """'SP' -> 'São Paulo'. Unknown codes are returned unchanged."""
    return REGION_NAMES.get(code, code)

@st.cache_resource
def _connection():
    """One shared read-only connection for the whole app."""
    return duckdb.connect(str(DB_PATH), read_only=True)


def run(sql: str, params: list | None = None):
    """Run a query and return a pandas DataFrame. A cursor per call is thread-safe."""
    return _connection().cursor().execute(sql, params or []).df()


def order_filter(start_month: str, end_month: str, regions: tuple):
    """Build a WHERE clause for fct_orders. Values go in as parameters (?), never pasted into SQL."""
    sql = "WHERE purchase_month BETWEEN ? AND ?"
    params = [start_month, end_month]
    if regions:
        sql += f" AND region IN ({', '.join(['?'] * len(regions))})"
        params += list(regions)
    return sql, params


# ---------------------------------------------------------------- filter options
@st.cache_data
def all_months() -> list[str]:
    return run("SELECT DISTINCT purchase_month FROM fct_orders ORDER BY 1")["purchase_month"].tolist()


@st.cache_data
def all_regions() -> list[str]:
    return run("SELECT DISTINCT region FROM fct_orders ORDER BY 1")["region"].tolist()


# ---------------------------------------------------------------- KPIs
@st.cache_data
def kpis(start_month: str, end_month: str, regions: tuple) -> dict:
    where, params = order_filter(start_month, end_month, regions)
    sql = f"""
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
    """
    return run(sql, params).iloc[0].to_dict()


# ---------------------------------------------------------------- overview charts
@st.cache_data
def monthly_trend(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
    """, params)


@st.cache_data
def top_categories(start_month: str, end_month: str, regions: tuple, limit: int = 10):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        SELECT
            p.category,
            SUM(i.unit_price)            AS gmv,
            COUNT(DISTINCT i.order_id)   AS orders,
            COUNT(*)                     AS units
        FROM std_order_items AS i
        JOIN std_products    AS p ON i.product_id = p.product_id   -- many items -> one product
        JOIN fct_orders      AS o ON i.order_id   = o.order_id     -- many items -> one order
        {where} AND o.is_delivered
        GROUP BY p.category
        ORDER BY gmv DESC
        LIMIT ?
    """, params + [limit])


@st.cache_data
def orders_by_region(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    df = run(f"""
        SELECT
            region,
            COUNT(*)                                            AS orders,
            SUM(merchandise_gmv) FILTER (WHERE is_delivered)    AS gmv
        FROM fct_orders
        {where}
        GROUP BY region
        ORDER BY orders DESC
    """, params)
    df["region_name"] = df["region"].map(region_name)
    return df

# ---------------------------------------------------------------- delivery & experience
@st.cache_data
def delivery_kpis(start_month: str, end_month: str, regions: tuple) -> dict:
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        SELECT
            100.0 * AVG(CAST(is_late AS INTEGER))                    AS late_rate,
            AVG(delivery_days)                                       AS avg_delivery_days,
            AVG(review_score) FILTER (WHERE is_late = false)         AS review_on_time,
            AVG(review_score) FILTER (WHERE is_late = true)          AS review_late,
            COUNT(*) FILTER (WHERE is_late IS NOT NULL)              AS n_measured
        FROM fct_orders
        {where}
    """, params).iloc[0].to_dict()


@st.cache_data
def review_by_status(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        SELECT
            CASE WHEN is_late THEN 'Late' ELSE 'On time / early' END AS delivery,
            COUNT(*)                                                  AS orders,
            AVG(review_score)                                         AS avg_review,
            100.0 * AVG(CAST(review_score <= 2 AS INTEGER))           AS pct_negative
        FROM fct_orders
        {where} AND is_late IS NOT NULL AND review_score IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
    """, params)


@st.cache_data
def review_by_days_vs_promise(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        WITH d AS (
            SELECT
                -- negative = arrived early, positive = arrived late; capped at +/-20 days
                GREATEST(-20, LEAST(20,
                    date_diff('day', CAST(promised_at AS DATE), CAST(delivered_at AS DATE))
                ))                     AS days_vs_promise,
                review_score
            FROM fct_orders
            {where} AND is_late IS NOT NULL AND review_score IS NOT NULL
        )
        SELECT days_vs_promise,
               COUNT(*)            AS orders,
               AVG(review_score)   AS avg_review
        FROM d
        GROUP BY days_vs_promise
        ORDER BY days_vs_promise
    """, params)


@st.cache_data
def late_by_region(start_month: str, end_month: str, regions: tuple, min_orders: int = 300):
    where, params = order_filter(start_month, end_month, regions)
    df = run(f"""
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
    df["region_name"] = df["region"].map(region_name)
    return df

# ---------------------------------------------------------------- products & opportunity matrix
@st.cache_data
def category_performance(start_month: str, end_month: str, regions: tuple, min_orders: int = 100):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        WITH order_category AS (      -- step 1: items -> one row per (order, category)
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
        SELECT                        -- step 2: join one row per order, then aggregate per category
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


@st.cache_data
def category_monthly(start_month: str, end_month: str, regions: tuple, category: str):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
    """, params + [category])
# ---------------------------------------------------------------- sales
@st.cache_data
def sales_monthly(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
            -- window function: compare each month with the month before it
            100.0 * (gmv - LAG(gmv) OVER (ORDER BY month))
                  / NULLIF(LAG(gmv) OVER (ORDER BY month), 0)       AS gmv_mom_pct
        FROM m
        ORDER BY month
    """, params)


@st.cache_data
def top_products(start_month: str, end_month: str, regions: tuple, limit: int = 20):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
    """, params + [limit])


@st.cache_data
def payment_mix(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        SELECT
            pm.method,
            COUNT(*)                                            AS payments,
            SUM(pm.amount)                                      AS amount,
            -- window function: this method's share of the grand total
            100.0 * SUM(pm.amount) / SUM(SUM(pm.amount)) OVER ()  AS share_pct
        FROM std_payments AS pm
        JOIN fct_orders   AS o ON pm.order_id = o.order_id
        {where} AND o.is_delivered AND pm.method <> 'not_defined'
        GROUP BY pm.method
        ORDER BY amount DESC
    """, params)


# ---------------------------------------------------------------- customers
@st.cache_data
def customer_kpis(start_month: str, end_month: str, regions: tuple) -> dict:
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
    """, params).iloc[0].to_dict()


@st.cache_data
def repeat_vs_one_time(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
        ORDER BY 1
    """, params)


@st.cache_data
def order_frequency(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
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
    """, params)


@st.cache_data
def purchase_heatmap(start_month: str, end_month: str, regions: tuple):
    where, params = order_filter(start_month, end_month, regions)
    return run(f"""
        SELECT
            isodow(purchased_at)   AS weekday,     -- 1 = Monday ... 7 = Sunday
            hour(purchased_at)     AS hour,
            COUNT(*)               AS orders
        FROM fct_orders
        {where}
        GROUP BY 1, 2
    """, params)