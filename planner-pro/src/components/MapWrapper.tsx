"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import "leaflet-geosearch/dist/geosearch.css";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";

// Custom marker icon to avoid missing default assets
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
      provider: provider,
      style: 'bar',
      showMarker: false,
      retainZoomLevel: false,
      animateZoom: true,
      autoClose: true,
      searchLabel: 'Search location...',
      keepResult: true
    });
    map.addControl(searchControl);
    return () => {
      map.removeControl(searchControl);
    };
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
      edit: {
        featureGroup: drawnItems,
        remove: true
      },
      draw: {
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: {},
        polygon: {
          allowIntersection: false,
          drawError: { color: '#e1e100', message: '<strong>Oh snap!<strong> you can\'t draw that!' },
          shapeOptions: { color: '#3b82f6' }
        },
        rectangle: {
          shapeOptions: { color: '#3b82f6' }
        }
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);
      if (onDrawCreate) {
        onDrawCreate(layer);
      }
    });

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onDrawCreate]);

  return null;
}

function GeolocationEvents({ onMapClick }: { onMapClick: (lat: number, lng: number, preFetchedFootprint?: any) => void }) {
  const map = useMap();

  useEffect(() => {
    // Request location on mount
    map.locate({ setView: true, maxZoom: 16 });
  }, [map]);

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    locationfound(e) {
      // Optional: draw a marker for user location
    }
  });
  return null;
}

function BoundingBoxFetcher({
  onMapClick,
  activeFootprintId,
  surveys
}: {
  onMapClick: (lat: number, lng: number, preFetchedFootprint?: any) => void;
  activeFootprintId?: string | number;
  surveys: any[];
}) {
  const map = useMapEvents({
    moveend() {
      fetchBuildingsInBounds();
    }
  });

  const [bgFootprints, setBgFootprints] = useState<any[]>([]);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const fetchIdRef = useRef(0);

  const fetchBuildingsInBounds = async () => {
    const currentZoom = map.getZoom();
    
    // Zoom < 10 is too far even for out center
    if (currentZoom < 10) {
      setBgFootprints([]); 
      return; 
    }

    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);

    // Debounce to prevent spamming API while panning quickly
    fetchTimeout.current = setTimeout(() => {
      const currentFetchId = ++fetchIdRef.current;
      setBgFootprints([]);

      const bounds = map.getBounds();
      const s = bounds.getSouth();
      const w = bounds.getWest();
      const n = bounds.getNorth();
      const e = bounds.getEast();

      const queryType = currentZoom < 15 ? 'out center;' : 'out body; >;';

      const q = `
        [out:json][timeout:25];
        (
          node["building"](${s},${w},${n},${e});
          way["building"](${s},${w},${n},${e});
          relation["building"](${s},${w},${n},${e});
          node["building:part"](${s},${w},${n},${e});
          way["building:part"](${s},${w},${n},${e});
          relation["building:part"](${s},${w},${n},${e});
        );
        ${queryType}
      `;

      // 1. Fetch Overpass (OSM)
      fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "data=" + encodeURIComponent(q)
      })
        .then(async res => {
          const text = await res.text();
          if (!res.ok) {
            throw new Error(`Overpass HTTP error ${res.status}: ${text.substring(0, 100)}`);
          }
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error(`Invalid JSON from Overpass: ${text.substring(0, 100)}`);
          }
        })
        .then(data => {
          if (fetchIdRef.current !== currentFetchId) return;
          const newFootprints: any[] = [];
        if (data.elements && data.elements.length > 0) {
          const offset = 0.000015; // Approx 1.6 meters (3x3m trick squares)
          
          data.elements.forEach((e: any) => {
            if (e.tags && (e.tags.building || e.tags['building:part'])) {
              let coords: [number, number][] = [];
              
              if (e.type === 'way' && e.nodes && e.nodes.length > 0 && !e.center) {
                // Polygon from 'out body; >'
                e.nodes.forEach((nodeId: number) => {
                  const node = data.elements.find((n: any) => n.type === 'node' && n.id === nodeId);
                  if (node) coords.push([node.lat, node.lon]);
                });
              } else if (e.type === 'way' && e.center) {
                // Center point from 'out center;'
                coords = [
                  [e.center.lat - offset, e.center.lon - offset],
                  [e.center.lat - offset, e.center.lon + offset],
                  [e.center.lat + offset, e.center.lon + offset],
                  [e.center.lat + offset, e.center.lon - offset],
                ];
              } else if (e.type === 'node') {
                // Node building
                coords = [
                  [e.lat - offset, e.lon - offset],
                  [e.lat - offset, e.lon + offset],
                  [e.lat + offset, e.lon + offset],
                  [e.lat + offset, e.lon - offset],
                ];
              }
              
              if (coords.length > 0) {
                newFootprints.push({ coords, tags: e.tags, id: e.id, source: 'osm' });
              }
            }
          });
        }
        setBgFootprints(prev => [...prev, ...newFootprints]);
        })
        .catch(err => console.error("Overpass API error:", err));

      // 2. Fetch ESRI (Microsoft AI Footprints)
      const esriUrl = `https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/MSBFP2/FeatureServer/0/query?f=json&geometry=${w},${s},${e},${n}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true`;

      fetch(esriUrl)
        .then(res => res.json())
        .then(esriData => {
          if (fetchIdRef.current !== currentFetchId) return;
          const newFootprints: any[] = [];
          if (esriData && esriData.features && esriData.features.length > 0) {
            esriData.features.forEach((feature: any) => {
              if (feature.geometry && feature.geometry.rings && feature.geometry.rings.length > 0) {
                const coords = feature.geometry.rings[0].map((pt: [number, number]) => [pt[1], pt[0]]);
                if (coords.length > 0) {
                  const id = `esri-${feature.attributes?.OBJECTID || Math.random().toString()}`;
                  newFootprints.push({ coords, tags: { building: 'yes', source: 'Microsoft AI' }, id, source: 'esri' });
                }
              }
            });
          }
          setBgFootprints(prev => [...prev, ...newFootprints]);
        })
        .catch(err => console.error("ESRI Footprints API error:", err));

    }, 500);
  };

  // Initial fetch on mount if zoom is sufficient
  useEffect(() => {
    fetchBuildingsInBounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {bgFootprints.map((footprint) => {
        // Hide if it's the actively selected building (blue)
        if (activeFootprintId && activeFootprintId === footprint.id) return null;

        // Hide if it's already a saved survey (prevent overlapping colors)
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
                onMapClick(e.latlng.lat, e.latlng.lng, footprint);
              }
            }}
          >
            <Tooltip>Unsurveyed Building</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}


export default function MapWrapper({ surveys, onMapClick, onDrawCreate, onSurveyClick, activeClickLoc, activeFootprint, loadingFootprint }: MapWrapperProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-full h-full relative z-0 bg-[#0b1121]">
      <MapContainer
        center={[20.5937, 78.9629]} // Default, will fly to GPS location if granted
        zoom={5}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={true}
        preferCanvas={true}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
        </LayersControl>

        <SearchControl />
        <DrawControl onDrawCreate={onDrawCreate} />
        <GeolocationEvents onMapClick={onMapClick} />

        {/* Dynamic Bounding Box Building Fetcher */}
        <BoundingBoxFetcher
          onMapClick={onMapClick}
          activeFootprintId={activeFootprint?.id}
          surveys={surveys}
        />

        {/* Existing Saved Surveys */}
        {surveys.map((survey, index) => {
          let fillColor = "#8b5cf6"; // Default purple
          if (survey.answers?.floors) {
            const floors = String(survey.answers.floors).toLowerCase();
            if (floors === 'g' || floors === '1') fillColor = "#22c55e"; // Green
            else if (floors === 'g+1' || floors === '2') fillColor = "#3b82f6"; // Blue
            else if (floors === 'g+2' || floors === '3') fillColor = "#eab308"; // Yellow
            else if (floors === 'g+3' || floors === '4') fillColor = "#f97316"; // Orange
            else fillColor = "#ef4444"; // Red for G+4 and above
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

      {loadingFootprint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600/90 backdrop-blur-sm text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse border border-white/20">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Detecting Building Boundary...
        </div>
      )}
    </div>
  );
}
