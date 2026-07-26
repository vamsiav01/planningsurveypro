"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl, useMap, Polygon } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
import 'leaflet.heat';
import { MapPin, Search, Navigation, Hexagon, Edit3, Trash2, MousePointer2, Activity, Square, Circle, Undo2, Redo2, Loader2 } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import DraggablePanel from "@/components/DraggablePanel";

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
  const map = useMap();
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
      // Smart panning: center the clicked point, then shift map left (moving point to the right)
      map.flyTo(e.latlng, map.getZoom(), { animate: true, duration: 0.5 });
      setTimeout(() => {
        map.panBy([-300, 0], { animate: true, duration: 0.3 });
      }, 550);
    },
  });
  return null;
}

function LeafletLogic({ surveys, showHeatmap, setDrawRefs, handleLayerCreated, handleLayerDeleted }: { surveys: any[], showHeatmap: boolean, setDrawRefs: (map: L.Map, drawnItems: L.FeatureGroup) => void, handleLayerCreated: (l: any) => void, handleLayerDeleted: (l: any) => void }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  // Initialize Leaflet Draw FeatureGroup
  useEffect(() => {
    if (!map) return;
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    
    // We still initialize the control so the handlers exist internally, but CSS hides the UI
    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: { polygon: true, marker: true, polyline: true, circle: true, circlemarker: false, rectangle: true }
    });
    map.addControl(drawControl);
    
    const onCreate = (e: any) => {
      drawnItems.addLayer(e.layer);
      handleLayerCreated(e.layer);
    };
    
    const onDelete = (e: any) => {
      e.layers.eachLayer((layer: any) => {
        handleLayerDeleted(layer);
      });
    };

    map.on(L.Draw.Event.CREATED, onCreate);
    map.on(L.Draw.Event.DELETED, onDelete);

    setDrawRefs(map, drawnItems);

    return () => {
      map.removeControl(drawControl);
      map.off(L.Draw.Event.CREATED, onCreate);
      map.off(L.Draw.Event.DELETED, onDelete);
    };
  }, [map, setDrawRefs, handleLayerCreated, handleLayerDeleted]);

  // Initialize Heatmap
  useEffect(() => {
    if (!map) return;
    if (showHeatmap && surveys.length > 0) {
      const points = surveys.map(s => [s.location?.lat, s.location?.lng, 1]);
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
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data || []);
      setShowResults(true);
    } catch (err) {
      console.error(err);
    }
    setSearching(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 500);
  };

  const handleSelectResult = (result: any) => {
    if (mapRef.current) {
      mapRef.current.flyTo([parseFloat(result.lat), parseFloat(result.lon)], 18);
      setSearchQuery(result.name || result.display_name.split(',')[0]);
      setShowResults(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  };

  const locateUser = () => {
    if (mapRef.current) {
      mapRef.current.locate({ setView: true, maxZoom: 18 });
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.search-container')) {
        setShowResults(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[500] flex flex-col pointer-events-none items-center search-container">
      <div className="flex gap-2 pointer-events-auto">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="flex items-center bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl overflow-hidden h-12">
            <input 
              type="text"
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
              placeholder="Search map..."
              className="bg-transparent border-none outline-none text-white px-4 py-2 w-72 text-sm"
            />
            <button type="submit" disabled={searching} className="px-4 text-slate-400 hover:text-white transition-colors">
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            </button>
          </div>
          
          {/* Autocomplete Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-14 left-0 w-full bg-[#111827]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/10 transition-colors text-sm text-slate-200"
                >
                  <div className="font-medium truncate text-white">{result.name || result.display_name.split(',')[0]}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{result.display_name}</div>
                </button>
              ))}
            </div>
          )}
        </form>
        
        <button 
          onClick={locateUser}
          title="Live Location"
          className="w-12 h-12 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xl transition-colors shrink-0"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>
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
  
  // Storing refs for programmatic drawing
  const internalMapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  // Undo/Redo State
  const undoStack = useRef<{type: 'add' | 'remove', layer: any}[]>([]);
  const redoStack = useRef<{type: 'add' | 'remove', layer: any}[]>([]);
  const [undoLength, setUndoLength] = useState(0);
  const [redoLength, setRedoLength] = useState(0);

  // Automatically locate user on mount
  useEffect(() => {
    // We add a tiny timeout to ensure MapContainer has fully mounted and initialized mapRef
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.locate({ setView: true, maxZoom: 18 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const setDrawRefs = (map: L.Map, drawnItems: L.FeatureGroup) => {
    internalMapRef.current = map;
    drawnItemsRef.current = drawnItems;
  };

  const handleLayerCreated = (layer: any) => {
    undoStack.current.push({ type: 'add', layer });
    redoStack.current = []; // Clear redo stack on new action
    setUndoLength(undoStack.current.length);
    setRedoLength(redoStack.current.length);
  };

  const handleLayerDeleted = (layer: any) => {
    undoStack.current.push({ type: 'remove', layer });
    redoStack.current = [];
    setUndoLength(undoStack.current.length);
    setRedoLength(redoStack.current.length);
  };

  const undo = () => {
    if (undoStack.current.length === 0 || !drawnItemsRef.current) return;
    const action = undoStack.current.pop()!;
    redoStack.current.push(action);
    if (action.type === 'add') {
      drawnItemsRef.current.removeLayer(action.layer);
    } else {
      drawnItemsRef.current.addLayer(action.layer);
    }
    setUndoLength(undoStack.current.length);
    setRedoLength(redoStack.current.length);
  };

  const redo = () => {
    if (redoStack.current.length === 0 || !drawnItemsRef.current) return;
    const action = redoStack.current.pop()!;
    undoStack.current.push(action);
    if (action.type === 'add') {
      drawnItemsRef.current.addLayer(action.layer);
    } else {
      drawnItemsRef.current.removeLayer(action.layer);
    }
    setUndoLength(undoStack.current.length);
    setRedoLength(redoStack.current.length);
  };

  // The L.Draw instances are attached to the map via handler maps
  const triggerDraw = (type: 'polygon' | 'marker' | 'polyline' | 'rectangle' | 'circle') => {
    if (!internalMapRef.current) return;
    setActiveTool(type);
    
    // Disable any existing tool
    Object.keys(internalMapRef.current as any).forEach(k => {
      if (k.startsWith('handler') && (internalMapRef.current as any)[k].disable) {
        (internalMapRef.current as any)[k].disable();
      }
    });

    if (type === 'polygon') new (L.Draw as any).Polygon(internalMapRef.current).enable();
    else if (type === 'marker') new (L.Draw as any).Marker(internalMapRef.current).enable();
    else if (type === 'polyline') new (L.Draw as any).Polyline(internalMapRef.current).enable();
    else if (type === 'rectangle') new (L.Draw as any).Rectangle(internalMapRef.current).enable();
    else if (type === 'circle') new (L.Draw as any).Circle(internalMapRef.current).enable();
  };

  const triggerEdit = (type: 'edit' | 'remove') => {
    if (!internalMapRef.current || !drawnItemsRef.current) return;
    setActiveTool(type);
    
    if (type === 'edit') {
      new (L.EditToolbar as any).Edit(internalMapRef.current, {
        featureGroup: drawnItemsRef.current,
      }).enable();
    } else if (type === 'remove') {
      new (L.EditToolbar as any).Delete(internalMapRef.current, {
        featureGroup: drawnItemsRef.current,
      }).enable();
    }
  };

  // Reset active tool when map is clicked since L.Draw handles completion
  useEffect(() => {
    if (!internalMapRef.current) return;
    internalMapRef.current.on(L.Draw.Event.CREATED, () => setActiveTool(null));
    internalMapRef.current.on('draw:editstop', () => setActiveTool(null));
    internalMapRef.current.on('draw:deletestop', () => setActiveTool(null));
  }, []);


  return (
    <div className="w-full h-full relative">
      <MapSearchAndGPS mapRef={mapRef} />

      {/* CUSTOM DRAGGABLE DRAWING TOOLBAR */}
      <DraggablePanel initialPosition={{ x: 24, y: 120 }} className="z-[1000]">
        <div className="bg-[#111827]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl flex flex-col gap-2 pointer-events-auto">
          <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-4 mb-2 bg-white/5 flex items-center justify-center rounded-sm hover:bg-white/10 transition-colors">
            <div className="w-6 h-1 bg-white/20 rounded-full"></div>
          </div>
          
          <button 
            onClick={() => { setActiveTool(null); }}
            className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === null ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Navigate / Inspect"
          >
            <MousePointer2 className="w-5 h-5" />
          </button>
          
          <div className="w-full h-[1px] bg-white/10 my-1"></div>
          
          <div className="grid grid-cols-2 gap-1">
            <button 
              onClick={() => triggerDraw('marker')}
              className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'marker' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Add Map Pin"
            >
              <MapPin className="w-5 h-5" />
            </button>
            <button 
              onClick={() => triggerDraw('polygon')}
              className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'polygon' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Draw Polygon"
            >
              <Hexagon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => triggerDraw('polyline')}
              className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'polyline' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Draw Polyline"
            >
              <Activity className="w-5 h-5" />
            </button>
            <button 
              onClick={() => triggerDraw('rectangle')}
              className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'rectangle' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Draw Rectangle"
            >
              <Square className="w-5 h-5" />
            </button>
            <button 
              onClick={() => triggerDraw('circle')}
              className={`p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'circle' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Draw Circle"
            >
              <Circle className="w-5 h-5" />
            </button>
          </div>
          
          <div className="w-full h-[1px] bg-white/10 my-1"></div>
          
          <div className="flex gap-1">
            <button 
              onClick={undo}
              disabled={undoLength === 0}
              className={`flex-1 p-2 rounded-xl transition-colors flex items-center justify-center ${undoLength > 0 ? 'text-indigo-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'}`}
              title="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button 
              onClick={redo}
              disabled={redoLength === 0}
              className={`flex-1 p-2 rounded-xl transition-colors flex items-center justify-center ${redoLength > 0 ? 'text-indigo-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 cursor-not-allowed'}`}
              title="Redo"
            >
              <Redo2 className="w-5 h-5" />
            </button>
          </div>
          
          <div className="w-full h-[1px] bg-white/10 my-1"></div>
          
          <div className="flex gap-1">
            <button 
              onClick={() => triggerEdit('edit')}
              className={`flex-1 p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'edit' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Edit Shapes"
            >
              <Edit3 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => triggerEdit('remove')}
              className={`flex-1 p-3 rounded-xl transition-colors flex items-center justify-center ${activeTool === 'remove' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Delete Shapes"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </DraggablePanel>

      <MapContainer 
        center={[23.2, 77.4]}
        zoom={14} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
        ref={(el) => {
           mapRef.current = el;
           if (el && !internalMapRef.current) {
               // Initial mount assignment for outside components
           }
        }}
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
        <LeafletLogic 
          surveys={surveys} 
          showHeatmap={showHeatmap} 
          setDrawRefs={setDrawRefs} 
          handleLayerCreated={handleLayerCreated} 
          handleLayerDeleted={handleLayerDeleted} 
        />
        
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
              icon={createNumberedIcon(`S${(index as number) + 1}`)}
              eventHandlers={{
                click: () => {
                  onSurveyClick(survey, `S${(index as number) + 1}`);
                  if (mapRef.current && survey.location) {
                    mapRef.current.flyTo([survey.location.lat, survey.location.lng], mapRef.current.getZoom(), { animate: true, duration: 0.5 });
                    setTimeout(() => {
                      mapRef.current?.panBy([-300, 0], { animate: true, duration: 0.3 });
                    }, 550);
                  }
                }
              }}
            />
          )
        ))}
      </MapContainer>
    </div>
  );
}
