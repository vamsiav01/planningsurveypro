const { PMTiles } = require("pmtiles");

async function test() {
  const p = new PMTiles("https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles");
  
  try {
    const header = await p.getHeader();
    console.log("Header:", header);
    const meta = await p.getMetadata();
    console.log("Metadata:", meta);
  } catch (e) {
    console.error("Error", e);
  }
}
test();
