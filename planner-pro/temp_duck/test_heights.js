const { PMTiles } = require("pmtiles");
const Pbf = require("pbf");
const { VectorTile } = require("@mapbox/vector-tile");
const zlib = require("zlib");

async function checkHeights() {
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
    
    const PbfClass = Pbf.PbfReader || Pbf;
    const tile = new VectorTile(new PbfClass(new Uint8Array(buf)));
    const layer = tile.layers['building'];
    
    let heights = [];
    let noHeight = 0;
    
    if (layer) {
      for (let i = 0; i < Math.min(layer.length, 100); i++) {
        const feature = layer.feature(i);
        const props = feature.properties;
        if (props.height) {
          heights.push(props.height);
        } else {
          noHeight++;
        }
      }
    }
    console.log("Found heights:", heights.slice(0, 20));
    console.log(`Total checked: 100. Has height: ${heights.length}, No height: ${noHeight}`);
  } catch (e) {
    console.error(e);
  }
}
checkHeights();
