-- std_orders: one row per order (grain = order_id)
CREATE OR REPLACE TABLE std_orders AS
SELECT
    o.order_id,
    c.customer_unique_id               AS customer_id,   -- the real person
    o.order_status                     AS status,
    o.order_purchase_timestamp         AS purchased_at,
    o.order_delivered_customer_date    AS delivered_at,
    o.order_estimated_delivery_date    AS promised_at,
    c.customer_state                   AS region,
    c.customer_city                    AS city,
    c.customer_zip_code_prefix         AS zip_prefix,
    'BRL'                              AS currency,
    'olist'                            AS source
FROM raw_orders    AS o
JOIN raw_customers AS c
  ON o.customer_id = c.customer_id;