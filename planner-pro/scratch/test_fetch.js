async function test() {
  const s = 20.5900;
  const w = 78.9600;
  const n = 20.6000;
  const e = 78.9700;

  const q = `
    [out:json][timeout:25];
    (
      way["building"](${s},${w},${n},${e});
      relation["building"](${s},${w},${n},${e});
    );
    out body;
    >;
    out skel qt;
  `;
  
  console.log("Fetching Overpass...");
  const overpassPromise = fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: q
  }).then(res => res.json()).catch(err => { console.error("Overpass error", err); return null; });
  
  const esriUrl = `https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/MSBFP2/FeatureServer/0/query?f=json&geometry=${w},${s},${e},${n}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true`;
  
  console.log("Fetching ESRI...");
  const esriPromise = fetch(esriUrl).then(res => res.json()).catch(err => { console.error("ESRI error", err); return null; });

  const [overpassData, esriData] = await Promise.all([overpassPromise, esriPromise]);
  
  console.log("Overpass Data:", overpassData ? `Elements: ${overpassData.elements?.length}` : "null");
  console.log("ESRI Data:", esriData ? `Features: ${esriData.features?.length}` : "null");

  const newFootprints = [];
  
  if (overpassData && overpassData.elements && overpassData.elements.length > 0) {
    const ways = overpassData.elements.filter(e => e.type === 'way' && e.tags && e.tags.building);
    ways.forEach(way => {
      const coords = [];
      way.nodes.forEach(nodeId => {
        const node = overpassData.elements.find(e => e.type === 'node' && e.id === nodeId);
        if (node) {
          coords.push([node.lat, node.lon]);
        }
      });
      if (coords.length > 0) {
        newFootprints.push({ coords, tags: way.tags, id: way.id, source: 'osm' });
      }
    });
  }

  if (esriData && esriData.features && esriData.features.length > 0) {
    esriData.features.forEach(feature => {
      if (feature.geometry && feature.geometry.rings && feature.geometry.rings.length > 0) {
        const coords = feature.geometry.rings[0].map(pt => [pt[1], pt[0]]);
        if (coords.length > 0) {
          const id = `esri-${feature.attributes?.OBJECTID || Math.random().toString()}`;
          newFootprints.push({ coords, tags: { building: 'yes', source: 'Microsoft AI' }, id, source: 'esri' });
        }
      }
    });
  }

  console.log(`Total valid footprints: ${newFootprints.length}`);
  if (newFootprints.length > 0) {
    console.log("First footprint coords:", newFootprints[0].coords.slice(0, 3));
  }
}

test();
