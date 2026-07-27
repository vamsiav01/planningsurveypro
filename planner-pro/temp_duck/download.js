const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');

db.all(`
  INSTALL spatial;
  LOAD spatial;
  INSTALL httpfs;
  LOAD httpfs;
  INSTALL aws;
  LOAD aws;
  CALL load_aws_credentials();
  
  SET s3_region='us-west-2';

  COPY (
    SELECT id, ST_AsGeoJSON(geometry) as geom, names.primary as name, height
    FROM read_parquet('s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*', filename=true, hive_partitioning=1)
    WHERE bbox.xmin BETWEEN 77.30 AND 77.45
      AND bbox.ymin BETWEEN 23.15 AND 23.25
  ) TO 'bhopal_buildings.json' (FORMAT JSON, ARRAY true);
`, function(err, res) {
  if (err) {
    console.error("Error:", err);
  } else {
    console.log("Successfully created bhopal_buildings.json");
  }
});
