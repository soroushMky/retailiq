-- std_payments: one row per payment (grain = order_id + payment_seq)
CREATE OR REPLACE TABLE std_payments AS
SELECT
    order_id,
    payment_sequential     AS payment_seq,
    payment_type           AS method,
    payment_installments   AS installments,
    payment_value          AS amount
FROM raw_payments;