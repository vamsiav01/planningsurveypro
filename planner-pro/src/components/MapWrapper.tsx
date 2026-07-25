"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MapPin } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

// Custom icon using lucide react MapPin
const createCustomIcon = () => {
  const iconMarkup = renderToStaticMarkup(
    <div className="bg-primary text-white p-1 rounded-full shadow-lg border-2 border-white flex items-center justify-center h-8 w-8">
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

// Component to handle map clicks
function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface MapWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number) => void;
  mapType: string;
}

export default function MapWrapper({ surveys, onMapClick, mapType }: MapWrapperProps) {
  const [icon, setIcon] = useState<L.DivIcon | null>(null);

  useEffect(() => {
    // Client-side only
    setIcon(createCustomIcon());
  }, []);

  const getTileUrl = () => {
    if (mapType === 'satellite') {
        // Esri World Imagery (Free Satellite)
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }
    // Standard OpenStreetMap
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  };

  const getAttribution = () => {
    if (mapType === 'satellite') {
        return 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
    }
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  };

  return (
    <MapContainer 
      center={[40.7128, -74.0060]} 
      zoom={15} 
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution={getAttribution()}
        url={getTileUrl()}
      />
      <ClickHandler onMapClick={onMapClick} />
      
      {icon && surveys.map((survey) => (
        survey.location && (
          <Marker 
            key={survey.id} 
            position={[survey.location.lat, survey.location.lng]}
            icon={icon}
          >
            <Popup>
              <div className="font-sans">
                <h3 className="font-bold text-slate-800">{survey.buildingType}</h3>
                <p className="text-slate-600 m-0">{survey.floors} Floors</p>
                {survey.notes && <p className="text-slate-500 text-sm mt-1">{survey.notes}</p>}
              </div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
}
