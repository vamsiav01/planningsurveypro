"use client";

import { useEffect, useState, useRef, Fragment, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import "leaflet-geosearch/dist/geosearch.css";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

// Custom marker icon
const defaultIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #6366f1; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});
L.Marker.prototype.options.icon = defaultIcon;

interface MapWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number, preFetchedFootprint?: any) => void;
  onDrawCreate?: (layer: any) => void;
  onSurveyClick?: (survey: any) => void;
  activeClickLoc: { lat: number; lng: number } | null;
  activeFootprint: { coords: [number, number][], tags: any, id?: string | number } | null;
  loadingFootprint: boolean;
}

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new (GeoSearchControl as any)({
      provider, style: 'bar', showMarker: false, retainZoomLevel: false, animateZoom: true, autoClose: true, searchLabel: 'Search location...', keepResult: true
    });
    map.addControl(searchControl);
    return () => { map.removeControl(searchControl); };
  }, [map]);
  return null;
}

function DrawControl({ onDrawCreate }: { onDrawCreate?: (layer: any) => void }) {
  const map = useMap();
  const drawnItemsRef = useRef(new L.FeatureGroup());
  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: drawnItems, remove: true },
      draw: { polyline: false, circle: false, circlemarker: false, marker: {}, polygon: { allowIntersection: false, shapeOptions: { color: '#3b82f6' } }, rectangle: { shapeOptions: { color: '#3b82f6' } } }
    });
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.addLayer(e.layer);
      if (onDrawCreate) onDrawCreate(e.layer);
    });
    return () => { map.removeControl(drawControl); map.removeLayer(drawnItems); };
  }, [map, onDrawCreate]);
  return null;
}

function GeolocationEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => { map.locate({ setView: true, maxZoom: 16 }); }, [map]);
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  const locate = () => {
    setLocating(true);
    map.locate({ setView: true, maxZoom: 18 });
    map.once('locationfound', () => setLocating(false));
    map.once('locationerror', () => {
      setLocating(false);
      alert('Unable to retrieve your location. Please check browser permissions.');
    });
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ top: '130px' }}>
      <div className="leaflet-control leaflet-bar">
        <a 
          href="#"
          onClick={(e) => { e.preventDefault(); locate(); }}
          className="w-[34px] h-[34px] bg-white hover:bg-gray-100 flex items-center justify-center text-gray-700"
          title="Locate Me"
          style={{ textDecoration: 'none' }}
        >
          {locating ? (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
          )}
        </a>
      </div>
    </div>
  );
}

// Global PMTiles instance
const pmtilesUrl = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles";
const p = new PMTiles(pmtilesUrl);

// Cache fetched tiles to avoid redownloading
const tileCache = new Map<string, any[]>();

function GlobalPmtilesFetcher({
  onMapClick, activeFootprintId, surveys, onLoading
}: {
  onMapClick: (lat: number, lng: number, fp: any) => void;
  activeFootprintId?: string | number;
  surveys: any[];
  onLoading: (isLoading: boolean) => void;
}) {
  const map = useMap();
  const [bgFootprints, setBgFootprints] = useState<any[]>([]);

  const fetchTiles = async () => {
    const zoom = map.getZoom();
    const tileZoom = Math.min(zoom, 14); 

    if (zoom < 14) {
      setBgFootprints([]);
      return;
    }

    onLoading(true);
    const bounds = map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    const xMin = Math.floor((west + 180) / 360 * Math.pow(2, tileZoom));
    const xMax = Math.floor((east + 180) / 360 * Math.pow(2, tileZoom));
    const yMin = Math.floor((1 - Math.log(Math.tan(north * Math.PI / 180) + 1 / Math.cos(north * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, tileZoom));
    const yMax = Math.floor((1 - Math.log(Math.tan(south * Math.PI / 180) + 1 / Math.cos(south * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, tileZoom));

    let allFeatures: any[] = [];
    let tilePromises = [];

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tileKey = `${tileZoom}-${x}-${y}`;
        
        if (tileCache.has(tileKey)) {
          allFeatures = allFeatures.concat(tileCache.get(tileKey));
          continue;
        }

        const fetchPromise = p.getZxy(tileZoom, x, y).then(tileData => {
          if (!tileData) {
            tileCache.set(tileKey, []);
            return [];
          }
          
          let tile;
          try {
            tile = new VectorTile(new Pbf(new Uint8Array(tileData.data)) as any);
          } catch(e) {
            console.error("VectorTile decode error (is DecompressionStream missing?):", e);
            tileCache.set(tileKey, []);
            return [];
          }
          
          const layer = tile.layers['building'] || tile.layers['building_part'];
          const features = [];
          
          if (layer) {
            for (let i = 0; i < layer.length; i++) {
              const feature = layer.feature(i);
              const geojson = feature.toGeoJSON(x, y, tileZoom);
              
              if (geojson.geometry.type === 'Polygon') {
                const leafletCoords = geojson.geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
                const props = geojson.properties || {};
                features.push({
                  id: props.id || `${tileKey}-${i}`,
                  name: props.names?.primary || props.name || '',
                  height: props.height || null,
                  coords: leafletCoords
                });
              } else if (geojson.geometry.type === 'MultiPolygon') {
                const leafletCoords = geojson.geometry.coordinates[0][0].map((coord: number[]) => [coord[1], coord[0]]);
                const props = geojson.properties || {};
                features.push({
                  id: props.id || `${tileKey}-${i}`,
                  name: props.names?.primary || props.name || '',
                  height: props.height || null,
                  coords: leafletCoords
                });
              }
            }
          }
          tileCache.set(tileKey, features);
          return features;
        }).catch(err => {
          console.error("PMTiles error:", err);
          tileCache.set(tileKey, []);
          return [];
        });

        tilePromises.push(fetchPromise);
      }
    }

    try {
      const results = await Promise.all(tilePromises);
      results.forEach(res => {
        allFeatures = allFeatures.concat(res);
      });
      
      // OPTIMIZATION: Filter features to ONLY those visible in current map bounds!
      // This prevents React Leaflet from freezing the browser with 10,000+ off-screen polygons.
      const pad = 0.001; // small padding
      const s = south - pad;
      const n = north + pad;
      const w = west - pad;
      const e = east + pad;
      
      const visibleFeatures = allFeatures.filter(f => {
        if (!f.coords || f.coords.length === 0) return false;
        // Check if the first point of the polygon is within bounds
        const lat = f.coords[0][0];
        const lon = f.coords[0][1];
        return lat >= s && lat <= n && lon >= w && lon <= e;
      });
      
      setBgFootprints(visibleFeatures);
    } catch (e) {
      console.error(e);
    }
    
    onLoading(false);
  };

  useEffect(() => {
    fetchTiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapEvents({
    moveend: fetchTiles,
    zoomend: fetchTiles
  });

  return (
    <>
      {bgFootprints.map((footprint) => {
        if (activeFootprintId && activeFootprintId === footprint.id) return null;
        const isSaved = surveys.some(s => s.osmData?.id === footprint.id);
        if (isSaved) return null;
        return (
          <Polygon
            key={footprint.id}
            positions={footprint.coords}
            pathOptions={{ color: "#a855f7", weight: 2, fillColor: "#a855f7", fillOpacity: 0.2 }}
            eventHandlers={{
              click: (e: any) => {
                L.DomEvent.stopPropagation(e.originalEvent || e);
                onMapClick(e.latlng.lat, e.latlng.lng, {
                  coords: footprint.coords,
                  id: footprint.id,
                  tags: { name: footprint.name, height: footprint.height, building: 'yes', source: 'OvertureMaps AI' }
                });
              }
            }}
          >
            <Tooltip>{footprint.name || 'Unsurveyed AI Building'}</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

export default function MapWrapper({ surveys, onMapClick, onDrawCreate, onSurveyClick, activeClickLoc, activeFootprint, loadingFootprint }: MapWrapperProps) {
  const [mounted, setMounted] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <div className="w-full h-full relative z-0 bg-[#0b1121]">
      <MapContainer center={[23.25, 77.40]} zoom={15} style={{ height: '100%', width: '100%', zIndex: 1 }} zoomControl={true} preferCanvas={true}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
        </LayersControl>
        <SearchControl />
        <DrawControl onDrawCreate={onDrawCreate} />
        <GeolocationEvents onMapClick={onMapClick} />
        <LocateControl />
        <GlobalPmtilesFetcher onMapClick={onMapClick} activeFootprintId={activeFootprint?.id} surveys={surveys} onLoading={(loading) => setIsAiLoading(loading)} />
        {/* Existing Saved Surveys */}
        {surveys.map((survey, index) => {
          let fillColor = "#8b5cf6"; // Default purple
          const ans = survey.answers || survey;
          if (ans.floors) {
            const floorsStr = String(ans.floors).toLowerCase().replace(/\s+/g, '');
            if (floorsStr.includes('sg1') || floorsStr.includes('g+4') || floorsStr.includes('g4')) fillColor = "#ef4444"; // Red
            else if (floorsStr.includes('g3') || floorsStr.includes('g+3')) fillColor = "#f97316"; // Orange
            else if (floorsStr.includes('g2') || floorsStr.includes('g+2')) fillColor = "#eab308"; // Yellow
            else if (floorsStr.includes('g1') || floorsStr.includes('g+1')) fillColor = "#3b82f6"; // Blue
            else if (floorsStr === 'g' || floorsStr === '1') fillColor = "#22c55e"; // Green
          }

          const sLabel = `S${index + 1}`;
          const labelIcon = L.divIcon({
            className: 'custom-survey-label',
            html: `<div style="background-color: ${fillColor}; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; box-shadow: 0 0 4px rgba(0,0,0,0.5);">${sLabel}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          return (
            <Fragment key={survey.id}>
              {survey.osmData?.coords && (
                <Polygon
                  positions={survey.osmData.coords}
                  pathOptions={{ color: fillColor, weight: 2, fillColor: fillColor, fillOpacity: 0.5 }}
                  eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onSurveyClick) onSurveyClick(survey); } }}
                >
                  <Tooltip>{survey.answers?.houseNo || survey.answers?.buildingName || 'Surveyed Building'}</Tooltip>
                </Polygon>
              )}

              <Marker
                position={[survey.location.lat, survey.location.lng]}
                icon={labelIcon}
                eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onSurveyClick) onSurveyClick(survey); } }}
              >
                <Tooltip>{survey.answers?.houseNo || survey.answers?.buildingName || 'Survey Point'}</Tooltip>
              </Marker>
            </Fragment>
          );
        })}

        {/* Active Click Location */}
        {activeClickLoc && (
          <Marker
            position={[activeClickLoc.lat, activeClickLoc.lng]}
            icon={L.divIcon({
              className: 'active-pin',
              html: `
                <div class="relative w-5 h-5">
                  <div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                  <div class="absolute top-[3px] left-[3px] w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-white shadow-md"></div>
                </div>
              `,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })}
          />
        )}

        {/* Active Overpass Footprint Outline */}
        {activeFootprint && (
          <Polygon
            positions={activeFootprint.coords}
            pathOptions={{ color: "#3b82f6", weight: 3, fillOpacity: 0.2 }}
          />
        )}
      </MapContainer>

      {isAiLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600/90 backdrop-blur-sm text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse border border-white/20">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Loading High-Res AI Polygons...
        </div>
      )}

      {loadingFootprint && !isAiLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600/90 backdrop-blur-sm text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse border border-white/20">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Extracting Building Boundary...
        </div>
      )}
    </div>
  );
}
