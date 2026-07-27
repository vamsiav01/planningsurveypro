const { PMTiles } = require("pmtiles");
// Use dynamic import for pbf if needed, or just raw path
const Pbf = require("pbf"); // in temp_duck this is v5. Let's use PbfReader
const { VectorTile } = require("@mapbox/vector-tile");
const zlib = require("zlib");

async function test() {
  const p = new PMTiles("https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles");
  
  const z = 14;
  const lat = 23.25;
  const lon = 77.40;
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, z));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
  
  try {
    const tileData = await p.getZxy(z, x, y);
    let buf = Buffer.from(tileData.data);
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      buf = zlib.gunzipSync(buf);
    }
    
    // In pbf@5, it's PbfReader
    const PbfClass = Pbf.PbfReader || Pbf;
    const tile = new VectorTile(new PbfClass(new Uint8Array(buf)));
    const layer = tile.layers[Object.keys(tile.layers)[0]];
    const feature = layer.feature(0);
    const geojson = feature.toGeoJSON(x, y, z);
    console.log("Feature Type:", geojson.geometry.type);
    console.log("Coords shape:", JSON.stringify(geojson.geometry.coordinates).substring(0, 100));
  } catch (e) {
    console.error("Error", e);
  }
}
test();
