-- std_zip_geo: one row per zip prefix.
-- The raw table has ~1M points with many duplicates per zip; the median gives one stable centre.
CREATE OR REPLACE TABLE std_zip_geo AS
SELECT
    geolocation_zip_code_prefix   AS zip_prefix,
    median(geolocation_lat)       AS lat,
    median(geolocation_lng)       AS lng
FROM raw_geolocation
WHERE geolocation_lat BETWEEN -34 AND 6        -- drop points outside Brazil (bad geocodes)
  AND geolocation_lng BETWEEN -74 AND -34
GROUP BY geolocation_zip_code_prefix;