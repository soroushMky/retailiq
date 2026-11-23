-- std_order_items: one row per unit sold (grain = order_id + line_number)
CREATE OR REPLACE TABLE std_order_items AS
SELECT
    i.order_id,
    i.order_item_id     AS line_number,
    i.product_id,
    i.seller_id,
    i.price             AS unit_price,
    i.freight_value     AS shipping_cost
FROM raw_order_items AS i;