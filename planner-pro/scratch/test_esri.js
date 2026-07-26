async function testEsriBBox() {
  const xmin = -122.4194;
  const ymin = 37.7749;
  const xmax = -122.4094;
  const ymax = 37.7849;

  const url = `https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/MSBFP2/FeatureServer/0/query?f=json&geometry=${xmin},${ymin},${xmax},${ymax}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("ESRI Response:", data?.features?.length ? `Found ${data.features.length} buildings!` : data.error || "No buildings");
  } catch (err) {
    console.error("Error:", err);
  }
}

testEsriBBox();
