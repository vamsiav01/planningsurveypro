"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, useMap, Polygon, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import 'leaflet.heat';
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";

// Fix default Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create numbered icon safely without relying on complex DOM states
const createNumberedIcon = (number?: number | string) => {
  const iconMarkup = renderToStaticMarkup(
    <div className="bg-indigo-600 text-white rounded-full shadow-lg border-2 border-white flex flex-col items-center justify-center h-8 w-8 relative">
      {number ? (
        <span className="font-bold text-sm leading-none">{number}</span>
      ) : (
        <MapPin size={16} />
      )}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"></div>
    </div>
  );
  return L.divIcon({
    html: iconMarkup,
    className: "custom-leaflet-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
      map.flyTo(e.latlng, map.getZoom(), { animate: true, duration: 0.5 });
      setTimeout(() => {
        map.panBy([-300, 0], { animate: true, duration: 0.3 });
      }, 550);
    },
  });
  return null;
}

function HeatmapLayer({ surveys, showHeatmap }: { surveys: any[], showHeatmap: boolean }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;
    if (showHeatmap && surveys.length > 0) {
      const points = surveys.map(s => [s.location?.lat, s.location?.lng, 1]);
      // @ts-ignore
      heatLayerRef.current = L.heatLayer(points, { radius: 25, blur: 15 }).addTo(map);
    } else if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
  }, [map, showHeatmap, surveys]);

  return null;
}

interface MapWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number) => void;
  onSurveyClick: (survey: any, index: string | number) => void;
  activeBuildingGeom?: any[];
  activeClickLoc?: { lat: number, lng: number };
  showHeatmap?: boolean;
  showMarkers?: boolean;
}

export default function MapWrapper({
  surveys,
  onMapClick,
  onSurveyClick,
  activeBuildingGeom = [],
  activeClickLoc,
  showHeatmap = false,
  showMarkers = true
}: MapWrapperProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer 
        center={[23.2599, 77.4126]} // Default Bhopal Center
        zoom={14} 
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
        zoomControl={false}
      >
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Satellite View">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Street View">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
              maxZoom={20}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <ClickHandler onMapClick={onMapClick} />
        <HeatmapLayer surveys={surveys} showHeatmap={showHeatmap} />

        {/* User Interaction Marker */}
        {activeClickLoc && (
          <Marker position={[activeClickLoc.lat, activeClickLoc.lng]} icon={createNumberedIcon('+')} />
        )}

        {/* Detected Building Footprint Poly */}
        {activeBuildingGeom && activeBuildingGeom.length > 0 && (
          <Polygon positions={activeBuildingGeom} pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.3, weight: 2 }} />
        )}

        {/* Existing Survey Data */}
        {showMarkers && surveys.map((survey, i) => {
          if (!survey.location || typeof survey.location.lat !== 'number') return null;
          return (
            <Fragment key={survey.id || i}>
              <Marker 
                position={[survey.location.lat, survey.location.lng]} 
                icon={createNumberedIcon(i + 1)}
                eventHandlers={{
                  click: () => onSurveyClick(survey, i + 1)
                }}
              />
              {survey.osmData && survey.osmData.geom && (
                <Polygon positions={survey.osmData.geom} pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.3, weight: 2 }} />
              )}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
