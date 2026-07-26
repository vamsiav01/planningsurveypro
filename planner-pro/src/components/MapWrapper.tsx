"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, useMap, Polygon } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import 'leaflet.heat';
import { MapPin, Search, Navigation } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

// Fix default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Function to create numbered icon
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
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function LeafletLogic({ surveys, showHeatmap }: { surveys: any[], showHeatmap: boolean }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  // Initialize Leaflet Draw
  useEffect(() => {
    if (!map) return;
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        polyline: false, circle: false, circlemarker: false, marker: {}, rectangle: {}
      }
    });
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, (e: any) => drawnItems.addLayer(e.layer));
    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED);
    };
  }, [map]);

  // Initialize Heatmap
  useEffect(() => {
    if (!map) return;
    if (showHeatmap && surveys.length > 0) {
      const points = surveys.map(s => [s.location?.lat, s.location?.lng, 1]); // lat, lng, intensity
      heatLayerRef.current = (L as any).heatLayer(points, { radius: 25, blur: 15 }).addTo(map);
    } else if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
  }, [map, showHeatmap, surveys]);

  return null;
}

export function MapSearchAndGPS({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapRef.current) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        mapRef.current.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 18);
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error(err);
    }
    setSearching(false);
  };

  const locateUser = () => {
    if (mapRef.current) {
      mapRef.current.locate({ setView: true, maxZoom: 18 });
    }
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[500] flex gap-2 pointer-events-auto">
      <form onSubmit={handleSearch} className="flex items-center bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden h-12">
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search map..."
          className="bg-transparent border-none outline-none text-white px-4 py-2 w-64 text-sm"
        />
        <button type="submit" disabled={searching} className="px-4 text-slate-400 hover:text-white transition-colors">
          <Search className="w-5 h-5" />
        </button>
      </form>
      <button 
        onClick={locateUser}
        title="Live Location"
        className="w-12 h-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xl transition-colors"
      >
        <Navigation className="w-5 h-5" />
      </button>
    </div>
  );
}

interface MapWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number) => void;
  onSurveyClick: (survey: any, index: string | number) => void;
  activeBuildingGeom?: any[]; // LatLng arrays for polygon highlight
  activeClickLoc?: {lat: number, lng: number}; // Temporary marker for new survey
  showHeatmap: boolean;
  showMarkers: boolean;
}

export default function MapWrapper({ surveys, onMapClick, onSurveyClick, activeBuildingGeom, activeClickLoc, showHeatmap, showMarkers }: MapWrapperProps) {
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className="w-full h-full relative">
      <MapSearchAndGPS mapRef={mapRef} />

      <MapContainer 
        center={[23.2, 77.4]} // Defaulting closer to the user's screenshot
        zoom={14} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
        ref={mapRef}
      >
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Standard OSM">
            <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark Map">
            <TileLayer url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Topographic">
            <TileLayer url='https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' />
          </LayersControl.BaseLayer>
        </LayersControl>

        <ClickHandler onMapClick={onMapClick} />
        <LeafletLogic surveys={surveys} showHeatmap={showHeatmap} />
        
        {/* Temporary click marker for new survey */}
        {activeClickLoc && (
          <Marker position={[activeClickLoc.lat, activeClickLoc.lng]} icon={createNumberedIcon('+')} zIndexOffset={1000} />
        )}

        {/* Highlight OSM building footprint polygon */}
        {activeBuildingGeom && activeBuildingGeom.length > 0 && (
          <Polygon positions={activeBuildingGeom} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.4, weight: 3 }} />
        )}

        {/* Render Saved Surveys */}
        {showMarkers && surveys.map((survey, index) => (
          survey.location && (
            <Marker 
              key={survey.id} 
              position={[survey.location.lat, survey.location.lng]}
              icon={createNumberedIcon(`S${index + 1}`)}
              eventHandlers={{
                click: () => onSurveyClick(survey, `S${index + 1}`)
              }}
            />
          )
        ))}
      </MapContainer>
    </div>
  );
}
