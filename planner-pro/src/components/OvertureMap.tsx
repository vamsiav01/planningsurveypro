"use client";

import React, { useRef, useState, useEffect } from 'react';
import Map, { Source, Layer, Marker, MapRef, NavigationControl, GeolocateControl } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { MapPin, Loader2 } from 'lucide-react';
import { renderToStaticMarkup } from "react-dom/server";

// Register PMTiles protocol globally
let pmtilesRegistered = false;
if (typeof window !== 'undefined' && !pmtilesRegistered) {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

interface OvertureMapProps {
  surveys: any[];
  onMapClick: (lat: number, lng: number) => void;
  onSurveyClick: (survey: any, index: string | number) => void;
  onAutoBuildingClick?: (geom: any[], tags: any, lat: number, lng: number) => void;
  activeBuildingGeom?: any[]; 
  activeClickLoc?: {lat: number, lng: number}; 
  showHeatmap: boolean;
  showMarkers: boolean;
}

export default function OvertureMap({ surveys, onMapClick, onSurveyClick, onAutoBuildingClick, activeBuildingGeom, activeClickLoc, showHeatmap, showMarkers }: OvertureMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [viewState, setViewState] = useState({
    longitude: 77.40,
    latitude: 23.21,
    zoom: 15,
    pitch: 45,
    bearing: 0
  });



  const handleMapClick = (e: any) => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    
    // Check if clicked on an Overture building
    const features = map.queryRenderedFeatures(e.point, { layers: ['overture-buildings-3d', 'overture-buildings-flat'] });
    if (features && features.length > 0 && onAutoBuildingClick) {
      const feature = features[0];
      
      let geom: any[] = [];
      if (feature.geometry.type === 'Polygon') {
        geom = feature.geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]]);
      } else if (feature.geometry.type === 'MultiPolygon') {
        geom = feature.geometry.coordinates[0][0].map((coord: any) => [coord[1], coord[0]]);
      }
      
      const tags = feature.properties || {};
      tags.name = tags.name || tags.names || "Detected Structure";
      tags.source = "Overture Maps AI";
      
      onAutoBuildingClick(geom, tags, e.lngLat.lat, e.lngLat.lng);
      map.flyTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), 17), duration: 1000 });
      return;
    }

    onMapClick(e.lngLat.lat, e.lngLat.lng);
    map.flyTo({ center: e.lngLat, duration: 1000 });
  };

  const highlightGeoJSON = React.useMemo(() => {
    if (!activeBuildingGeom || activeBuildingGeom.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [activeBuildingGeom.map(p => [p[1], p[0]])]
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

  const overturePMTilesUrl = "pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-06-17.0/buildings.pmtiles";

  return (
    <div className="w-full h-full relative">
      
      {/* LOADING OVERLAY */}
      {isMapLoading && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-[#111827]/90 backdrop-blur-md border border-indigo-500/30 text-indigo-400 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-4">
            <Loader2 className="w-5 h-5 animate-spin" /> 
            <div>
              Scanning Global Satellites...
              <div className="text-[10px] text-indigo-400/70 font-medium">Downloading Overture AI Footprints</div>
            </div>
          </div>
        </div>
      )}

      <Map
        ref={mapRef}
        mapLib={maplibregl as any}
        initialViewState={viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={handleMapClick}
        interactiveLayerIds={['overture-buildings-3d', 'overture-buildings-flat']}
        onLoad={() => setIsMapLoading(false)}
        onIdle={() => setIsMapLoading(false)}
        mapStyle={{
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
              tileSize: 256,
            },
            'overture': {
              type: 'vector',
              url: overturePMTilesUrl,
              maxzoom: 15
            }
          },
          layers: [
            {
              id: 'base-map',
              type: 'raster',
              source: 'carto-dark',
              paint: { 'raster-opacity': 0.9 }
            },
            // Flat fallback for when we look straight down or if no height
            {
              id: 'overture-buildings-flat',
              type: 'fill',
              source: 'overture',
              'source-layer': 'building',
              paint: {
                'fill-color': '#4f46e5',
                'fill-opacity': 0.2,
                'fill-outline-color': '#818cf8'
              }
            },
            // 3D Extrusion
            {
              id: 'overture-buildings-3d',
              type: 'fill-extrusion',
              source: 'overture',
              'source-layer': 'building',
              paint: {
                'fill-extrusion-color': '#3730a3',
                'fill-extrusion-height': ['coalesce', ['get', 'height'], 10], // Default height 10m if missing
                'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
                'fill-extrusion-opacity': 0.8
              }
            }
          ]
        }}
      >
        <NavigationControl position="bottom-right" />
        <GeolocateControl position="bottom-right" />

        {/* Highlight Clicked Building */}
        {highlightGeoJSON && (
          <Source id="highlight-source" type="geojson" data={highlightGeoJSON as any}>
            <Layer 
              id="highlight-layer" 
              type="fill" 
              paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.5 }} 
            />
            <Layer 
              id="highlight-line" 
              type="line" 
              paint={{ 'line-color': '#34d399', 'line-width': 4 }} 
            />
          </Source>
        )}

        {/* Heatmap */}
        {showHeatmap && (
          <Source id="heatmap-source" type="geojson" data={heatmapGeoJSON as any}>
            <Layer 
              id="survey-heat"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                'heatmap-intensity': 1,
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
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

        {/* Clicks & Markers */}
        {activeClickLoc && (
          <Marker longitude={activeClickLoc.lng} latitude={activeClickLoc.lat} anchor="bottom">
            <div dangerouslySetInnerHTML={{ __html: renderToStaticMarkup(
              <div className="bg-emerald-500 text-white rounded-full shadow-lg border-2 border-white flex items-center justify-center h-8 w-8 relative">
                <span className="font-bold text-sm leading-none">+</span>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white"></div>
              </div>
            )}} />
          </Marker>
        )}

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
