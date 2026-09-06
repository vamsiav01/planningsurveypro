"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, Polygon, Polyline, Tooltip, useMap, CircleMarker, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import "leaflet-geosearch/dist/geosearch.css";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";
import { fetchOvertureBuildingsInBounds } from "@/utils/OvertureFallback";

const defaultIcon = L.divIcon({
  className: "custom-div-icon",
  html: `<div style="background-color: #6366f1; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});
L.Marker.prototype.options.icon = defaultIcon;

interface MapWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number, preFetchedFootprint?: any) => void;
  onSurveyClick?: (survey: any) => void;
  onShapeDrawn?: (geojsonFeature: any) => void;
  onShapeClick?: (feature: any, layerId: string, featureIndex: number) => void;
  activeClickLoc?: { lat: number, lng: number } | null;
  activeFootprint: { coords: [number, number][], tags: any, id?: string | number } | null;
  loadingFootprint: boolean;
  show3DBuildings?: boolean;
  showHeatmap?: boolean;
  customLayers?: any[];
  hiddenLayers?: string[];
  mapBounds?: any;
}

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new (GeoSearchControl as any)({ provider, style: "bar", showMarker: false, retainZoomLevel: false, animateZoom: true, autoClose: true, searchLabel: "Search location...", keepResult: true });
    map.addControl(searchControl);
    return () => { map.removeControl(searchControl); };
  }, [map]);
  return null;
}

function DrawControl({ onShapeDrawn }: { onShapeDrawn?: (feature: any) => void }) {
  const map = useMap();
  const drawnItemsRef = useRef(new L.FeatureGroup());

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({
      position: "topleft",
      edit: { featureGroup: drawnItems, remove: true },
      draw: {
        polyline: { shapeOptions: { color: "#f59e0b", weight: 3 } },
        polygon: { allowIntersection: false, shapeOptions: { color: "#3b82f6", weight: 2 } },
        rectangle: { shapeOptions: { color: "#10b981", weight: 2 } },
        circle: false,
        circlemarker: false,
        marker: { icon: defaultIcon },
      }
    });
    map.addControl(drawControl);
    const handleCreated = (e: any) => {
      const layer = e.layer;
      // Do NOT add to drawnItems to prevent duplicates. React state handles rendering.
      const geojsonFeature = layer.toGeoJSON();
      geojsonFeature.properties = geojsonFeature.properties || {};
      if (onShapeDrawn) onShapeDrawn(geojsonFeature);
    };
    map.on(L.Draw.Event.CREATED, handleCreated);
    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onShapeDrawn]);
  return null;
}

function GeolocationEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => { map.locate({ setView: true, maxZoom: 17 }); }, [map]);
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const locate = () => {
    setLocating(true);
    map.locate({ setView: true, maxZoom: 18 });
    map.once("locationfound", () => setLocating(false));
    map.once("locationerror", () => { setLocating(false); console.warn("Unable to retrieve your location."); });
  };
  return (
    <div className="leaflet-top leaflet-right" style={{ top: "130px" }}>
      <div className="leaflet-control leaflet-bar">
        <a href="#" onClick={(e) => { e.preventDefault(); locate(); }} className="w-[34px] h-[34px] bg-white hover:bg-gray-100 flex items-center justify-center text-gray-700" title="Locate Me" style={{ textDecoration: "none" }}>
          {locating ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>}
        </a>
      </div>
    </div>
  );
}

function GlobalBuildingsFetcher({ onMapClick, activeFootprintId, surveys, onLoading }: { onMapClick: (lat: number, lng: number, fp: any) => void; activeFootprintId?: string | number; surveys: any[]; onLoading: (isLoading: boolean) => void; }) {
  const map = useMap();
  const [bgFootprints, setBgFootprints] = useState<any[]>([]);
  const cache = useRef(new Map<string, any[]>());

  // Overpass servers (used as fallback if Overture returns nothing)
  const OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];

  const fetchOverpassFallback = async (s: number, w: number, n: number, e: number): Promise<any[]> => {
    const q = `[out:json][timeout:15];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom;`;
    for (const server of OVERPASS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(server, { method: "POST", body: q, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data || !data.elements) continue;
        const features: any[] = [];
        data.elements.forEach((el: any) => {
          let coords: [number, number][] = [];
          if (el.type === 'way' && el.geometry) {
            coords = el.geometry.map((g: any) => [g.lat, g.lon]);
          } else if (el.type === 'relation' && el.members) {
            const outer = el.members.find((m: any) => m.role === 'outer' && m.geometry);
            if (outer) coords = outer.geometry.map((g: any) => [g.lat, g.lon]);
          }
          if (coords.length > 0) {
            features.push({ id: el.id, name: el.tags?.name || "", coords, tags: el.tags || {} });
          }
        });
        return features;
      } catch (err) {
        continue;
      }
    }
    return [];
  };

  const fetchTiles = async () => {
    const zoom = map.getZoom();
    if (zoom < 15) { 
      setBgFootprints([]); 
      onLoading(false);
      return; 
    }
    
    const bounds = map.getBounds();
    const n = bounds.getNorth(); const s = bounds.getSouth(); 
    const w = bounds.getWest(); const e = bounds.getEast();
    
    const tileKey = `${Math.round(s*100)},${Math.round(w*100)},${Math.round(n*100)},${Math.round(e*100)}`;
    if (cache.current.has(tileKey)) {
      setBgFootprints(cache.current.get(tileKey)!);
      onLoading(false);
      return;
    }

    onLoading(true);
    try {
      // PRIMARY: Use Overture Maps PMTiles (2.5 billion buildings globally)
      let features = await fetchOvertureBuildingsInBounds(s, w, n, e);

      // FALLBACK: If Overture returned nothing, try Overpass API
      if (features.length === 0) {
        features = await fetchOverpassFallback(s, w, n, e);
      }

      cache.current.set(tileKey, features);
      setBgFootprints(features);
    } catch (err) {
      console.error("Building fetch failed:", err);
    }
    onLoading(false);
  };

  useEffect(() => {
    let timeout: any;
    const handler = () => { clearTimeout(timeout); timeout = setTimeout(fetchTiles, 800); };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    fetchTiles();
    return () => { map.off('moveend', handler); map.off('zoomend', handler); clearTimeout(timeout); };
  }, [map]);

  return (
    <>
      {bgFootprints.map((footprint) => {
        if (activeFootprintId && activeFootprintId === footprint.id) return null;
        const isSaved = surveys.some(s => s.osmData?.id === footprint.id);
        if (isSaved) return null;
        return (
          <Polygon key={footprint.id} positions={footprint.coords} pathOptions={{ color: "#a855f7", weight: 2, fillColor: "#a855f7", fillOpacity: 0.2 }} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); onMapClick(e.latlng.lat, e.latlng.lng, { coords: footprint.coords, id: footprint.id, tags: { name: footprint.name, building: "yes", source: footprint.tags?.source || "Overture Maps" } }); } }}>
            <Tooltip>{footprint.name || "Unsurveyed Building"}</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

function BoundsHandler({ bounds }: { bounds: any }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      } catch (e) {}
    }
  }, [bounds, map]);
  return null;
}

export default function MapWrapper({ surveys, onMapClick, onSurveyClick, onShapeDrawn, onShapeClick, activeClickLoc, activeFootprint, loadingFootprint, show3DBuildings = true, showHeatmap = false, customLayers = [], hiddenLayers = [], mapBounds = null }: MapWrapperProps) {
  const [mounted, setMounted] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <div className="w-full h-full relative z-0 bg-[#0b1121]">
      <MapContainer center={[23.25, 77.40]} zoom={17} style={{ height: "100%", width: "100%", zIndex: 1 }} zoomControl={true} preferCanvas={false} scrollWheelZoom={true} dragging={true} doubleClickZoom={true}>
        <BoundsHandler bounds={mapBounds} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite (Esri)">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark (Carto)">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; CARTO" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Light (Carto)">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; CARTO" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrain / Topo">
            <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="&copy; OpenTopoMap" maxZoom={17} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Humanitarian (HOT)">
            <TileLayer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" attribution="&copy; HOT OSM" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="ESRI Topo">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="ESRI Street">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={19} />
          </LayersControl.BaseLayer>
        </LayersControl>

        <SearchControl />
        <DrawControl onShapeDrawn={onShapeDrawn} />
        <GeolocationEvents onMapClick={onMapClick} />
        <LocateControl />

        {show3DBuildings && <GlobalBuildingsFetcher onMapClick={onMapClick} activeFootprintId={activeFootprint?.id} surveys={surveys} onLoading={setIsAiLoading} />}

        {(customLayers || []).map(layer => {
          if ((hiddenLayers || []).includes(layer.id)) return null;
          return (layer.features || []).map((feature: any, fi: number) => {
            const geomType = feature.geometry?.type;
            const fillColor = feature.properties?.color || layer.color || "#3b82f6";
            const strokeColor = feature.properties?.strokeColor || layer.strokeColor || fillColor;
            const fillOpacity = feature.properties?.fillOpacity ?? layer.fillOpacity ?? 0.25;
            const strokeWidth = feature.properties?.strokeWidth ?? layer.strokeWidth ?? 2;
            const strokeDasharray = feature.properties?.strokeDasharray ?? layer.strokeDasharray ?? undefined;
            const coords = feature.geometry?.coordinates;
            const key = `${layer.id}-${fi}`;
            if (geomType === "Polygon") {
              const positions = coords.map((ring: number[][]) => ring.map(c => [c[1], c[0]] as [number, number]));
              return <Polygon key={key} positions={positions} pathOptions={{ color: strokeColor, weight: strokeWidth, fillColor, fillOpacity, dashArray: strokeDasharray }} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onShapeClick) onShapeClick(feature, layer.id, fi); } }}><Tooltip>{feature.properties?.name || layer.name}</Tooltip></Polygon>;
            } else if (geomType === "MultiPolygon") {
              const positions = coords.map((polygon: number[][][]) => polygon.map(ring => ring.map(c => [c[1], c[0]] as [number, number])));
              return <Polygon key={key} positions={positions} pathOptions={{ color: strokeColor, weight: strokeWidth, fillColor, fillOpacity, dashArray: strokeDasharray }} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onShapeClick) onShapeClick(feature, layer.id, fi); } }}><Tooltip>{feature.properties?.name || layer.name}</Tooltip></Polygon>;
            } else if (geomType === "LineString") {
              const positions = coords.map((c: number[]) => [c[1], c[0]]) as [number, number][];
              return <Polyline key={key} positions={positions} pathOptions={{ color: strokeColor, weight: strokeWidth, dashArray: strokeDasharray }} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onShapeClick) onShapeClick(feature, layer.id, fi); } }}><Tooltip>{feature.properties?.name || layer.name}</Tooltip></Polyline>;
            } else if (geomType === "Point") {
              return <Marker key={key} position={[coords[1], coords[0]]} icon={L.divIcon({ className: "custom-div-icon", html: `<div style="background-color: ${fillColor}; width: 12px; height: 12px; border-radius: 50%; border: ${strokeWidth}px solid ${strokeColor}; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] })} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onShapeClick) onShapeClick(feature, layer.id, fi); } }}><Tooltip>{feature.properties?.name || layer.name}</Tooltip></Marker>;
            }
            return null;
          });
        })}

        {surveys.map((survey, index) => {
          if (showHeatmap) {
            return <CircleMarker key={`heat-${survey.id}`} center={[survey.location.lat, survey.location.lng]} radius={22} pathOptions={{ color: "transparent", fillColor: "#ef4444", fillOpacity: 0.35 }} />;
          }
          let fillColor = "#8b5cf6";
          const ans = survey.answers || survey;
          if (ans.floors) {
            const floorsStr = String(ans.floors).toLowerCase().replace(/\s+/g, "");
            if (floorsStr.includes("g+4") || floorsStr.includes("g4")) fillColor = "#ef4444";
            else if (floorsStr.includes("g+3") || floorsStr.includes("g3")) fillColor = "#f97316";
            else if (floorsStr.includes("g+2") || floorsStr.includes("g2")) fillColor = "#eab308";
            else if (floorsStr.includes("g+1") || floorsStr.includes("g1")) fillColor = "#3b82f6";
            else if (floorsStr === "g" || floorsStr === "1") fillColor = "#22c55e";
          }
          const sLabel = `S${index + 1}`;
          const labelIcon = L.divIcon({ className: "custom-survey-label", html: `<div style="background-color: ${fillColor}; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; box-shadow: 0 0 4px rgba(0,0,0,0.5);">${sLabel}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
          return (
            <Fragment key={survey.id}>
              {survey.osmData?.coords && (
                (function() {
                  const isValid = (arr: any): boolean => {
                    if (!Array.isArray(arr)) return false;
                    for (let c of arr) {
                      if (Array.isArray(c)) {
                        if (typeof c[0] === 'number' && typeof c[1] === 'number') continue;
                        if (!isValid(c)) return false;
                      } else if (c && typeof c === 'object') {
                        if (typeof c.lat === 'number' && typeof c.lng === 'number') continue;
                        return false;
                      } else {
                        return false;
                      }
                    }
                    return true;
                  };
                  if (!isValid(survey.osmData.coords)) return null;
                  return (
                    <Polygon positions={survey.osmData.coords} pathOptions={{ color: fillColor, weight: 2, fillColor: fillColor, fillOpacity: 0.5 }} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onSurveyClick) onSurveyClick(survey); } }}>
                      <Tooltip>{ans.houseNo || ans.buildingName || "Surveyed Building"}</Tooltip>
                    </Polygon>
                  );
                })()
              )}
              <Marker position={[survey.location.lat, survey.location.lng]} icon={labelIcon} eventHandlers={{ click: (e: any) => { L.DomEvent.stopPropagation(e.originalEvent || e); if (onSurveyClick) onSurveyClick(survey); } }}>
                <Tooltip>{ans.houseNo || ans.buildingName || "Survey Point"}</Tooltip>
              </Marker>
            </Fragment>
          );
        })}

        {activeClickLoc && (
          <Marker position={[activeClickLoc.lat, activeClickLoc.lng]} icon={L.divIcon({ className: "active-pin", html: `<div class="relative w-5 h-5"><div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div><div class="absolute top-[3px] left-[3px] w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-white shadow-md"></div></div>`, iconSize: [20, 20], iconAnchor: [10, 10] })} />
        )}
        {activeFootprint && (
          <Polygon positions={activeFootprint.coords} pathOptions={{ color: "#3b82f6", weight: 3, fillOpacity: 0.2 }} />
        )}
      </MapContainer>

      {isAiLoading && show3DBuildings && (
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
