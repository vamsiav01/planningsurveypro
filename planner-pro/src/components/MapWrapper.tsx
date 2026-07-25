"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import { MapPin, Search, Navigation } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

// Fix Leaflet Default Icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createCustomIcon = () => {
  const iconMarkup = renderToStaticMarkup(
    <div className="bg-indigo-600 text-white p-1 rounded-full shadow-lg border-2 border-white flex items-center justify-center h-8 w-8">
      <MapPin size={18} />
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

function MapTools() {
  const map = useMap();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Initialize Leaflet Draw
  useEffect(() => {
    if (!map) return;

    // FeatureGroup is to store editable layers
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems
      },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: {},
        rectangle: {}
      }
    });

    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);
    });

    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED);
    };
  }, [map]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16);
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error(err);
    }
    setSearching(false);
  };

  const locateUser = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
      <form onSubmit={handleSearch} className="flex items-center bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden h-12">
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search location..."
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
  mapType?: string; // Kept for backwards compatibility, but we use LayersControl now
}

export default function MapWrapper({ surveys, onMapClick }: MapWrapperProps) {
  const [icon, setIcon] = useState<L.DivIcon | null>(null);

  useEffect(() => {
    setIcon(createCustomIcon());
  }, []);

  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={[40.7128, -74.0060]} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Standard OSM">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark Map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Topographic">
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
              url='https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <ClickHandler onMapClick={onMapClick} />
        <MapTools />
        
        {icon && surveys.map((survey) => (
          survey.location && (
            <Marker 
              key={survey.id} 
              position={[survey.location.lat, survey.location.lng]}
              icon={icon}
            >
              <Popup>
                <div className="font-sans">
                  <h3 className="font-bold text-slate-800">{survey.houseNo || survey.buildingName || survey.landUse}</h3>
                  <p className="text-slate-600 m-0">{survey.floors} Floors - {survey.landUse}</p>
                  {survey.osmData?.area && (
                    <p className="text-slate-500 text-xs mt-1">Area: {survey.osmData.area} sqm</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}
