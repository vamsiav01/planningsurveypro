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
  onMapClick: (lat: number, lng: number, overpassTags?: any) => void;
  onDrawCreate?: (layer: any) => void;
  activeClickLoc: { lat: number; lng: number } | null;
  activeFootprint: {coords: [number, number][], tags: any, id?: string | number} | null;
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

function GeolocationEvents({ onMapClick }: { onMapClick: (lat: number, lng: number, overpassTags?: any) => void }) {
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

export default function MapWrapper({ surveys, onMapClick, onDrawCreate, activeClickLoc, activeFootprint, loadingFootprint }: MapWrapperProps) {
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

        {/* Existing Saved Surveys */}
        {surveys.map((survey) => {
          let fillColor = "#8b5cf6"; // Default purple
          if (survey.answers?.floors) {
            const floors = String(survey.answers.floors).toLowerCase();
            if (floors === 'g' || floors === '1') fillColor = "#22c55e"; // Green
            else if (floors === 'g+1' || floors === '2') fillColor = "#3b82f6"; // Blue
            else if (floors === 'g+2' || floors === '3') fillColor = "#eab308"; // Yellow
            else if (floors === 'g+3' || floors === '4') fillColor = "#f97316"; // Orange
            else fillColor = "#ef4444"; // Red for G+4 and above
          }

          return (
            <Fragment key={survey.id}>
              {survey.osmData?.coords ? (
                <Polygon 
                  positions={survey.osmData.coords} 
                  pathOptions={{ color: fillColor, weight: 2, fillColor: fillColor, fillOpacity: 0.5 }}
                >
                  <Tooltip>{survey.answers?.houseNo || survey.answers?.buildingName || 'Surveyed Building'}</Tooltip>
                </Polygon>
              ) : (
                <Marker position={[survey.location.lat, survey.location.lng]}>
                  <Tooltip>{survey.answers?.houseNo || survey.answers?.buildingName || 'Survey Point'}</Tooltip>
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
