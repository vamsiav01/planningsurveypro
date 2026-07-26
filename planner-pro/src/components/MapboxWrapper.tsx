"use client";

import React, { useRef, useState, useEffect } from 'react';
import Map, { Source, Layer, Marker, MapRef, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { renderToStaticMarkup } from "react-dom/server";

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
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
       <foreignObject width="32" height="40">
         <div xmlns="http://www.w3.org/1999/xhtml">
           ${iconMarkup}
         </div>
       </foreignObject>
     </svg>`
  )}`;
};

interface MapboxWrapperProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number) => void;
  onSurveyClick: (survey: any, index: string | number) => void;
  onAutoBuildingClick?: (geom: any[], tags: any, lat: number, lng: number) => void;
  activeBuildingGeom?: any[]; // LatLng arrays for polygon highlight
  activeClickLoc?: {lat: number, lng: number}; 
  showHeatmap: boolean;
  showMarkers: boolean;
  mapboxToken: string;
}

export default function MapboxWrapper({ surveys, onMapClick, onSurveyClick, onAutoBuildingClick, activeBuildingGeom, activeClickLoc, showHeatmap, showMarkers, mapboxToken }: MapboxWrapperProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 77.4,
    latitude: 23.2,
    zoom: 15,
    pitch: 45,
    bearing: 0
  });

  const handleMapClick = (e: mapboxgl.MapLayerMouseEvent) => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    
    // Check if clicked on a building
    const features = map.queryRenderedFeatures(e.point, { layers: ['building'] });
    if (features && features.length > 0 && onAutoBuildingClick) {
      const feature = features[0];
      // Mapbox features return geometry in GeoJSON format (LngLat instead of LatLng)
      // We must convert it to LatLng arrays for our app's internal format
      let geom: any[] = [];
      if (feature.geometry.type === 'Polygon') {
        geom = feature.geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]]);
      } else if (feature.geometry.type === 'MultiPolygon') {
        geom = feature.geometry.coordinates[0][0].map((coord: any) => [coord[1], coord[0]]);
      }
      
      const tags = feature.properties || {};
      onAutoBuildingClick(geom, tags, e.lngLat.lat, e.lngLat.lng);
      
      // Pan to center
      map.flyTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), 16), duration: 1000 });
      return;
    }

    // Default map click
    onMapClick(e.lngLat.lat, e.lngLat.lng);
    map.flyTo({ center: e.lngLat, duration: 1000 });
  };

  // Convert activeBuildingGeom (LatLng) to GeoJSON for Mapbox
  const highlightGeoJSON = React.useMemo(() => {
    if (!activeBuildingGeom || activeBuildingGeom.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [activeBuildingGeom.map(p => [p[1], p[0]])] // Swap to LngLat
        },
        properties: {}
      }]
    };
  }, [activeBuildingGeom]);

  const heatmapGeoJSON = React.useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: surveys.filter(s => s.location).map(s => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.location.lng, s.location.lat]
        },
        properties: { weight: 1 }
      }))
    };
  }, [surveys]);

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        onClick={handleMapClick}
        interactiveLayerIds={['building']}
      >
        <NavigationControl position="bottom-right" />
        <GeolocateControl position="bottom-right" />

        {/* 3D Buildings Layer */}
        <Layer 
          id="3d-buildings" 
          source="composite" 
          source-layer="building" 
          filter={['==', 'extrude', 'true']} 
          type="fill-extrusion" 
          paint={{
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.6
          }} 
        />

        {/* Highlight Clicked Building */}
        {highlightGeoJSON && (
          <Source id="highlight-source" type="geojson" data={highlightGeoJSON as any}>
            <Layer 
              id="highlight-layer" 
              type="fill" 
              paint={{ 'fill-color': '#6366f1', 'fill-opacity': 0.5 }} 
            />
            <Layer 
              id="highlight-line" 
              type="line" 
              paint={{ 'line-color': '#6366f1', 'line-width': 3 }} 
            />
          </Source>
        )}

        {/* Heatmap Layer */}
        {showHeatmap && (
          <Source id="heatmap-source" type="geojson" data={heatmapGeoJSON as any}>
            <Layer 
              id="survey-heat"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                'heatmap-intensity': 1,
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(33,102,172,0)',
                  0.2, 'rgb(103,169,207)',
                  0.4, 'rgb(209,229,240)',
                  0.6, 'rgb(253,219,199)',
                  0.8, 'rgb(239,138,98)',
                  1, 'rgb(178,24,43)'
                ],
                'heatmap-radius': 30,
                'heatmap-opacity': 0.8
              }}
            />
          </Source>
        )}

        {/* Temporary Click Marker */}
        {activeClickLoc && (
          <Marker longitude={activeClickLoc.lng} latitude={activeClickLoc.lat} anchor="bottom">
            <div dangerouslySetInnerHTML={{ __html: renderToStaticMarkup(
              <div className="bg-indigo-600 text-white rounded-full shadow-lg border-2 border-white flex items-center justify-center h-8 w-8 relative">
                <span className="font-bold text-sm leading-none">+</span>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"></div>
              </div>
            )}} />
          </Marker>
        )}

        {/* Survey Markers */}
        {showMarkers && surveys.map((survey, index) => (
          survey.location && (
            <Marker 
              key={survey.id} 
              longitude={survey.location.lng} 
              latitude={survey.location.lat} 
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSurveyClick(survey, `S${index + 1}`);
                mapRef.current?.flyTo({ center: [survey.location.lng, survey.location.lat], zoom: 18, duration: 800 });
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: renderToStaticMarkup(
                <div className="bg-indigo-600 text-white rounded-full shadow-lg border-2 border-white flex items-center justify-center h-8 w-8 relative cursor-pointer hover:bg-indigo-500 transition-colors">
                  <span className="font-bold text-sm leading-none">{`S${index + 1}`}</span>
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"></div>
                </div>
              )}} />
            </Marker>
          )
        ))}
      </Map>
    </div>
  );
}
