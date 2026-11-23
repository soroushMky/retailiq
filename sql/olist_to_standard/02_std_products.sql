-- std_products: one row per product (grain = product_id)
CREATE OR REPLACE TABLE std_products AS
SELECT
    p.product_id,
    COALESCE(
        t.product_category_name_english,                     -- 1st choice: English from translation file
        CASE p.product_category_name                         -- 2nd choice: our own translation
            WHEN 'pc_gamer' THEN 'pc_gamer'
            WHEN 'portateis_cozinha_e_preparadores_de_alimentos'
                 THEN 'kitchen_portables_and_food_preparers'
            ELSE p.product_category_name
        END,
        'uncategorized'                                      -- 3rd choice: no category at all
    )                                  AS category,
    p.product_weight_g                 AS weight_g
FROM raw_products AS p
LEFT JOIN raw_category_translation AS t
       ON p.product_category_name = t.product_category_name;