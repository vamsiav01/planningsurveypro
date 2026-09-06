import { PMTiles } from 'pmtiles';

// Official Overture Maps Buildings PMTiles (2.5 billion buildings, global coverage)
const OVERTURE_URL = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-08-19.0/buildings.pmtiles";
let pmtilesInstance: PMTiles | null = null;

function lon2tile(lon: number, zoom: number) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
function lat2tile(lat: number, zoom: number) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); }
function tile2lon(x: number, z: number) { return (x / Math.pow(2, z) * 360 - 180); }
function tile2lat(y: number, z: number) { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))); }

function pointInPolygon(point: number[], polygon: number[][]) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// Fetch a single building footprint at a specific lat/lng (for click detection)
export async function fetchOvertureFootprint(lat: number, lng: number) {
  try {
    if (!pmtilesInstance) {
      pmtilesInstance = new PMTiles(OVERTURE_URL);
    }

    const { VectorTile } = await import('@mapbox/vector-tile');
    const Protobuf = (await import('pbf')).default;

    const zoom = 15; // Overture buildings are at z=15
    const x = lon2tile(lng, zoom);
    const y = lat2tile(lat, zoom);

    const tileData = await pmtilesInstance.getZxy(zoom, x, y);
    if (!tileData || !tileData.data) return null;

    const tile = new VectorTile(new Protobuf(tileData.data) as unknown as any);
    const layer = tile.layers[Object.keys(tile.layers)[0]]; // usually 'buildings'
    
    if (!layer) return null;

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (feature.type === 3) { // Polygon
        const geometry = feature.loadGeometry();
        for (let r = 0; r < geometry.length; r++) {
          const ring = geometry[r];
          // Convert vector tile coords to lat/lng
          const coords = ring.map(pt => [
            tile2lat(y + pt.y / layer.extent, zoom),
            tile2lon(x + pt.x / layer.extent, zoom)
          ] as [number, number]);

          // Check if clicked point is inside this footprint
          if (pointInPolygon([lng, lat], coords.map(c => [c[1], c[0]]))) {
            return {
              id: `ovt-${feature.id || Math.random().toString(36).substr(2, 9)}`,
              coords: coords,
              tags: {
                source: "Overture Maps",
                building: "yes",
                ...(feature.properties || {})
              }
            };
          }
        }
      }
    }
    return null;
  } catch (err) {
    console.error("Error fetching Overture footprint:", err);
    return null;
  }
}

// Fetch ALL building footprints in a bounding box (for background rendering)
export async function fetchOvertureBuildingsInBounds(
  south: number, west: number, north: number, east: number
): Promise<any[]> {
  try {
    if (!pmtilesInstance) {
      pmtilesInstance = new PMTiles(OVERTURE_URL);
    }

    const { VectorTile } = await import('@mapbox/vector-tile');
    const Protobuf = (await import('pbf')).default;

    const zoom = 15;
    const minX = lon2tile(west, zoom);
    const maxX = lon2tile(east, zoom);
    const minY = lat2tile(north, zoom); // note: lat2tile is inverted
    const maxY = lat2tile(south, zoom);

    const allFeatures: any[] = [];
    const seenIds = new Set<string>();

    // Limit tiles to prevent fetching too many (max 9 tiles = 3x3 grid)
    const tileCountX = Math.min(maxX - minX + 1, 3);
    const tileCountY = Math.min(maxY - minY + 1, 3);

    for (let tx = minX; tx < minX + tileCountX; tx++) {
      for (let ty = minY; ty < minY + tileCountY; ty++) {
        try {
          const tileData = await pmtilesInstance.getZxy(zoom, tx, ty);
          if (!tileData || !tileData.data) continue;

          const tile = new VectorTile(new Protobuf(tileData.data) as unknown as any);
          const layerName = Object.keys(tile.layers)[0];
          if (!layerName) continue;
          const layer = tile.layers[layerName];

          for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            if (feature.type !== 3) continue; // Only polygons

            const fid = `ovt-${tx}-${ty}-${feature.id || i}`;
            if (seenIds.has(fid)) continue;
            seenIds.add(fid);

            const geometry = feature.loadGeometry();
            if (geometry.length === 0) continue;
            
            const ring = geometry[0]; // outer ring
            const coords: [number, number][] = ring.map(pt => [
              tile2lat(ty + pt.y / layer.extent, zoom),
              tile2lon(tx + pt.x / layer.extent, zoom)
            ]);

            // Filter: only include buildings that overlap with the requested bounds
            const inBounds = coords.some(c => 
              c[0] >= south && c[0] <= north && c[1] >= west && c[1] <= east
            );
            if (!inBounds) continue;

            allFeatures.push({
              id: fid,
              name: feature.properties?.name || "",
              coords,
              tags: { building: "yes", source: "Overture Maps", ...(feature.properties || {}) }
            });
          }
        } catch (tileErr) {
          console.warn(`Failed to load tile ${tx},${ty}:`, tileErr);
          continue;
        }
      }
    }

    return allFeatures;
  } catch (err) {
    console.error("Error fetching Overture buildings in bounds:", err);
    return [];
  }
}
