"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  onMapClick: (lat: number, lng: number, overpassTags: any) => void;
  activeClickLoc: { lat: number; lng: number } | null;
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

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export default function MapWrapper({ surveys, onMapClick, activeClickLoc }: MapWrapperProps) {
  const [mounted, setMounted] = useState(false);
  const [loadingFootprint, setLoadingFootprint] = useState(false);
  const [activeFootprint, setActiveFootprint] = useState<{coords: [number, number][], tags: any} | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMapClick = async (lat: number, lng: number) => {
    setLoadingFootprint(true);
    setActiveFootprint(null);
    try {
      // Extremely precise Overpass query: look for building within 15 meters
      const query = `
        [out:json][timeout:10];
        (
          way["building"](around:15, ${lat}, ${lng});
          relation["building"](around:15, ${lat}, ${lng});
        );
        out body;
        >;
        out skel qt;
      `;
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
      });
      const data = await response.json();
      
      let foundBuilding = null;
      let tags = {};
      
      if (data.elements && data.elements.length > 0) {
        const ways = data.elements.filter((e: any) => e.type === 'way' && e.tags && e.tags.building);
        if (ways.length > 0) {
          const way = ways[0];
          tags = way.tags;
          const coords: [number, number][] = [];
          
          way.nodes.forEach((nodeId: number) => {
            const node = data.elements.find((e: any) => e.type === 'node' && e.id === nodeId);
            if (node) {
              coords.push([node.lat, node.lon]);
            }
          });
          
          if (coords.length > 0) {
            foundBuilding = { coords, tags };
            setActiveFootprint(foundBuilding);
          }
        }
      }
      onMapClick(lat, lng, tags);
    } catch (error) {
      console.error("Overpass error:", error);
      onMapClick(lat, lng, {});
    } finally {
      setLoadingFootprint(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="w-full h-full relative z-0 bg-[#0b1121]">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={false}
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
        <MapEvents onMapClick={handleMapClick} />

        {/* Existing Saved Surveys */}
        {surveys.map((survey) => {
          let fillColor = "#8b5cf6"; // Default purple
          if (survey.answers?.floors) {
            const floors = String(survey.answers.floors).toLowerCase();
            if (floors === 'g') fillColor = "#22c55e"; // Green
            else if (floors === 'g+1') fillColor = "#3b82f6"; // Blue
            else if (floors === 'g+2') fillColor = "#eab308"; // Yellow
            else if (floors === 'g+3') fillColor = "#f97316"; // Orange
            else fillColor = "#ef4444"; // Red for G+4 and above
          }

          return (
            <Fragment key={survey.id}>
              {survey.osmData?.coords ? (
                <Polygon 
                  positions={survey.osmData.coords} 
                  pathOptions={{ color: fillColor, weight: 2, fillColor: fillColor, fillOpacity: 0.5 }}
                >
                  <Tooltip>{survey.answers?.buildingName || 'Surveyed Building'}</Tooltip>
                </Polygon>
              ) : (
                <Marker position={[survey.location.lat, survey.location.lng]}>
                  <Tooltip>{survey.answers?.buildingName || 'Survey Point'}</Tooltip>
                </Marker>
              )}
            </Fragment>
          );
        })}

        {/* Active Click Location */}
        {activeClickLoc && (
          <Marker position={[activeClickLoc.lat, activeClickLoc.lng]} />
        )}

        {/* Active Overpass Footprint Outline */}
        {activeFootprint && (
          <Polygon 
            positions={activeFootprint.coords} 
            pathOptions={{ color: "#a855f7", weight: 3, fillOpacity: 0.2, dashArray: "5, 5" }}
          />
        )}
      </MapContainer>
      
      {loadingFootprint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Detecting Footprint...
        </div>
      )}
    </div>
  );
}
