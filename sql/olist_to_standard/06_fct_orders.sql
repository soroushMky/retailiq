-- fct_orders: one row per order, every child table pre-aggregated (no fan-out)
CREATE OR REPLACE TABLE fct_orders AS

WITH items AS (                       -- step 1: items -> one row per order
    SELECT order_id,
           COUNT(*)            AS n_units,
           SUM(unit_price)     AS merchandise_gmv,
           SUM(shipping_cost)  AS shipping_total
    FROM std_order_items
    GROUP BY order_id
),
payments AS (                         -- step 2: payments -> one row per order
    SELECT order_id,
           SUM(amount)         AS payments_total,
           COUNT(*)            AS n_payments
    FROM std_payments
    GROUP BY order_id
),
reviews AS (                          -- step 3: reviews -> one row per order
    SELECT order_id,
           AVG(score)          AS review_score,
           COUNT(*)            AS n_reviews
    FROM std_reviews
    GROUP BY order_id
)

SELECT                                -- step 4: join the summaries to orders
    o.order_id,
    o.customer_id,
    o.status,
    o.purchased_at,
    strftime(o.purchased_at, '%Y-%m')          AS purchase_month,
    o.delivered_at,
    o.promised_at,
    o.region,
    o.city,
    o.zip_prefix,
    o.currency,

    COALESCE(i.n_units, 0)                     AS n_units,
    COALESCE(i.merchandise_gmv, 0)             AS merchandise_gmv,
    COALESCE(i.shipping_total, 0)              AS shipping_total,
    p.payments_total,
    p.n_payments,
    r.review_score,
    r.n_reviews,

    (o.status = 'delivered')                   AS is_delivered,
    CASE
        WHEN o.status = 'delivered' AND o.delivered_at IS NOT NULL
            THEN o.delivered_at > o.promised_at
    END                                        AS is_late,
    CASE
        WHEN o.status = 'delivered' AND o.delivered_at IS NOT NULL
            THEN date_diff('hour', o.purchased_at, o.delivered_at) / 24.0
    END                                        AS delivery_days

FROM std_orders    AS o
LEFT JOIN items    AS i ON o.order_id = i.order_id
LEFT JOIN payments AS p ON o.order_id = p.order_id
LEFT JOIN reviews  AS r ON o.order_id = r.order_id;