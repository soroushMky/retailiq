-- std_reviews: one row per (review, order) pair
CREATE OR REPLACE TABLE std_reviews AS
SELECT
    review_id,
    order_id,
    review_score            AS score,
    review_comment_message  AS comment,
    review_creation_date    AS reviewed_at
FROM raw_reviews;