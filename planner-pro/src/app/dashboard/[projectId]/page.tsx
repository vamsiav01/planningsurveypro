"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import dynamic from "next/dynamic";
import Draggable from "react-draggable";
import { Loader2, Hexagon, Printer, Download, Layers, Map as MapIcon, Settings2, FileEdit, ArrowLeft, CheckCircle2, Trash2, Edit2, MapPin } from "lucide-react";

const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-3 font-medium">Loading Professional Maps...</span>
    </div>
  )
});

export default function DashboardProjectPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Map State
  const [activeBuildingGeom, setActiveBuildingGeom] = useState<any[]>([]);
  const [activeClickLoc, setActiveClickLoc] = useState<{lat: number, lng: number} | null>(null);

  // Modal States
  const [isNewSurveyModalOpen, setIsNewSurveyModalOpen] = useState(false);
  const [viewedSurvey, setViewedSurvey] = useState<any>(null); // For viewing/editing
  
  // Data State
  const [osmData, setOsmData] = useState<any>(null);
  const [fetchingOsm, setFetchingOsm] = useState(false);
  
  // Form State
  const [houseNo, setHouseNo] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [floors, setFloors] = useState("");
  const [landUse, setLandUse] = useState("residential");
  const [condition, setCondition] = useState("good");
  const [occupancy, setOccupancy] = useState("occupied");

  // Map Tools State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Form Settings State
  const [formSettings, setFormSettings] = useState({
    houseNo: true,
    buildingName: true,
    floors: true,
    landUse: true,
    condition: true,
    occupancy: true
  });

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    const fetchProjectAndSurveys = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", projectId as string));
        if (projectDoc.exists()) {
          setProject({ id: projectDoc.id, ...projectDoc.data() });
        } else {
          router.push("/projects");
          return;
        }

        const q = query(collection(db, `projects/${projectId}/surveys`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const loadedSurveys: any[] = [];
          snapshot.forEach((doc) => {
            loadedSurveys.push({ id: doc.id, ...doc.data() });
          });
          setSurveys(loadedSurveys);
          setLoading(false);
        });
        return () => unsubscribe();
      } catch (error) {
        console.error("Error:", error);
        setLoading(false);
      }
    };
    fetchProjectAndSurveys();
  }, [projectId, user, router]);

  const handleMapClick = async (lat: number, lng: number) => {
    setActiveClickLoc({ lat, lng });
    setActiveBuildingGeom([]);
    setViewedSurvey(null);
    setIsNewSurveyModalOpen(true);
    setOsmData(null);
    setFetchingOsm(true);
    
    // Clear form for new entry
    setHouseNo("");
    setBuildingName("");
    setFloors("");
    setLandUse("residential");
    setCondition("good");
    setOccupancy("occupied");
    
    try {
      const overpassQuery = `[out:json];(way[building](around:20, ${lat}, ${lng});relation[building](around:20, ${lat}, ${lng}););out body geom;`;
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
      const data = await response.json();
      
      if (data.elements && data.elements.length > 0) {
        const building = data.elements[0];
        const tags = building.tags || {};
        
        if (building.geometry) {
          const geom = building.geometry.map((pt: any) => [pt.lat, pt.lon]);
          setActiveBuildingGeom(geom);
        }

        let approxArea = 0;
        if (building.bounds) {
          const w = (building.bounds.maxlon - building.bounds.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
          const h = (building.bounds.maxlat - building.bounds.minlat) * 111320;
          approxArea = Math.round(w * h * 0.7);
        }

        setOsmData({
          id: `${building.type}/${building.id}`,
          area: approxArea > 0 ? approxArea : "Unknown",
          tags: tags
        });

        if (tags['addr:housenumber']) setHouseNo(tags['addr:housenumber']);
        if (tags['name']) setBuildingName(tags['name']);
        
        if (tags['building:levels']) {
          const levels = parseInt(tags['building:levels']);
          if (!isNaN(levels)) {
            setFloors(levels > 1 ? `G+${levels - 1}` : 'G');
          } else {
            setFloors(tags['building:levels']);
          }
        }
        
        if (tags['building'] === 'commercial' || tags['building'] === 'retail') setLandUse('commercial');
        if (tags['building'] === 'industrial') setLandUse('industrial');
      } else {
        setOsmData({ id: "Not Found", area: "N/A", tags: {} });
      }
    } catch (err) {
      console.error("OSM Fetch Error", err);
      setOsmData({ id: "Error", area: "N/A", tags: {} });
    } finally {
      setFetchingOsm(false);
    }
  };

  const handleSurveyClick = (survey: any, index: string | number) => {
    setIsNewSurveyModalOpen(false);
    setActiveClickLoc(null);
    setActiveBuildingGeom([]);
    
    // Set form state to edit mode
    setHouseNo(survey.houseNo || "");
    setBuildingName(survey.buildingName || "");
    setFloors(survey.floors || "");
    setLandUse(survey.landUse || "residential");
    setCondition(survey.condition || "good");
    setOccupancy(survey.occupancy || "occupied");
    
    setViewedSurvey({ ...survey, index });
  };

  const handleSaveNewSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClickLoc || !user) return;
    try {
      await addDoc(collection(db, `projects/${projectId}/surveys`), {
        location: activeClickLoc,
        houseNo: formSettings.houseNo ? houseNo : null,
        buildingName: formSettings.buildingName ? buildingName : null,
        floors: formSettings.floors ? (floors || 'G') : null,
        landUse: formSettings.landUse ? landUse : null,
        condition: formSettings.condition ? condition : null,
        occupancy: formSettings.occupancy ? occupancy : null,
        osmData,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsNewSurveyModalOpen(false);
      setActiveClickLoc(null);
      setActiveBuildingGeom([]);
    } catch (error) {
      console.error("Error saving survey:", error);
    }
  };

  const handleUpdateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewedSurvey || !user) return;
    try {
      await updateDoc(doc(db, `projects/${projectId}/surveys`, viewedSurvey.id), {
        houseNo: formSettings.houseNo ? houseNo : null,
        buildingName: formSettings.buildingName ? buildingName : null,
        floors: formSettings.floors ? floors : null,
        landUse: formSettings.landUse ? landUse : null,
        condition: formSettings.condition ? condition : null,
        occupancy: formSettings.occupancy ? occupancy : null,
      });
      setViewedSurvey(null);
    } catch (error) {
      console.error("Error updating survey:", error);
    }
  };

  const handleDeleteSurvey = async () => {
    if (!viewedSurvey) return;
    if (window.confirm("Are you sure you want to delete this survey record?")) {
      try {
        await deleteDoc(doc(db, `projects/${projectId}/surveys`, viewedSurvey.id));
        setViewedSurvey(null);
      } catch (error) {
        console.error("Error deleting survey:", error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#0b1121] overflow-hidden font-sans">
      
      {/* ABSOLUTE FULL-SCREEN MAP */}
      <div className="absolute inset-0 z-0">
        <MapWrapper 
          surveys={surveys} 
          onMapClick={handleMapClick} 
          onSurveyClick={handleSurveyClick}
          activeBuildingGeom={activeBuildingGeom}
          activeClickLoc={activeClickLoc || undefined}
          showHeatmap={showHeatmap}
          showMarkers={showMarkers}
        />
      </div>

      {/* FLOATING TOP-LEFT NAV */}
      <div className="absolute top-6 left-6 z-10 flex gap-4 pointer-events-none">
        <button 
          onClick={() => router.push('/projects')}
          className="pointer-events-auto flex items-center justify-center w-12 h-12 bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl text-slate-300 hover:text-white hover:bg-[#1e293b]/90 transition-all shadow-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="pointer-events-auto flex items-center gap-3 px-6 h-12 bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl">
          <div className="bg-indigo-600 rounded-md p-1">
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Planner Pro</h1>
        </div>
      </div>

      {/* DRAGGABLE RIGHT SIDEBAR */}
      <Draggable handle=".handle">
        <aside className="absolute top-6 right-6 w-80 bg-[#111827]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col z-20 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto max-h-[90vh]">
          <div className="handle cursor-grab active:cursor-grabbing w-full h-4 absolute top-0 left-0 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <div className="w-12 h-1 bg-white/20 rounded-full"></div>
          </div>
          
          <div className="flex items-start gap-3 mb-6 mt-4">
            <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-xl mt-1">
              <MapIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white truncate w-52">{project?.name || "Loading..."}</h2>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Cloud Synced
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20">
              <Printer className="w-4 h-4" /> Print Map Layout
            </button>
            <button className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 rounded-xl py-3 text-sm font-medium transition-colors">
              <Download className="w-4 h-4" /> Export Project Data
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-3 uppercase">Functional Map Tools</h3>
            <div className="space-y-1">
              {[
                { id: 'markers', label: 'Toggle Survey Pointers', icon: MapPin, state: showMarkers, setter: setShowMarkers },
                { id: 'heat', label: 'Survey Heatmap', icon: Hexagon, state: showHeatmap, setter: setShowHeatmap },
              ].map((tool) => (
                <div key={tool.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <tool.icon className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">{tool.label}</span>
                  </div>
                  <button 
                    onClick={() => tool.setter(!tool.state)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${tool.state ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${tool.state ? 'translate-x-5' : ''}`}></div>
                  </button>
                </div>
              ))}
            </div>
            
            <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 rounded-xl py-2 mt-4 text-sm font-medium transition-colors">
              <Settings2 className="w-4 h-4" /> Edit Survey Form Fields
            </button>
          </div>

          <div className="mt-auto">
            <div className="bg-[#0b1121]/50 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
              <div className="flex items-center gap-2 text-indigo-400 font-medium mb-4 relative z-10">
                <FileEdit className="w-5 h-5" /> Survey Analytics
              </div>
              <div className="flex justify-between items-end relative z-10">
                <span className="text-slate-400 text-sm">Total Surveyed:</span>
                <span className="text-2xl font-bold text-white">{surveys.length}</span>
              </div>
            </div>
          </div>
        </aside>
      </Draggable>

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6">
             <h2 className="text-xl font-bold text-white mb-4">Form Settings</h2>
             <p className="text-sm text-slate-400 mb-6">Toggle the fields that appear when clicking the map.</p>
             
             <div className="space-y-3 mb-6">
                {Object.keys(formSettings).map(field => (
                  <label key={field} className="flex items-center gap-3 text-slate-300 text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formSettings[field as keyof typeof formSettings]} 
                      onChange={() => setFormSettings(prev => ({ ...prev, [field]: !prev[field as keyof typeof prev] }))}
                      className="w-4 h-4 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-[#0b1121]"
                    />
                    {field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                  </label>
                ))}
             </div>
             
             <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* DRAGGABLE NEW SURVEY MODAL */}
      {isNewSurveyModalOpen && (
        <Draggable handle=".handle">
          <div className="absolute top-24 left-1/4 z-50 w-full max-w-md bg-[#111827]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden pointer-events-auto">
            <div className="handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <div className="w-12 h-1 bg-white/20 rounded-full"></div>
            </div>
            <div className="p-6 pt-2">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                  <MapIcon className="w-5 h-5 text-indigo-400" /> New Survey Data
                </h2>
                <button onClick={() => { setIsNewSurveyModalOpen(false); setActiveBuildingGeom([]); setActiveClickLoc(null); }} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-[#0b1121]/50 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2 text-sm">
                    <MapIcon className="w-4 h-4" /> Geographical Location
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                    <div>Lat: {activeClickLoc?.lat.toFixed(6)}</div>
                    <div>Lng: {activeClickLoc?.lng.toFixed(6)}</div>
                  </div>
                  {osmData && osmData.id !== "Error" && osmData.id !== "Not Found" && (
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 mt-2 border-t border-white/5 pt-2">
                      <div>Area: {osmData.area} sq meters</div>
                      <div>Source: OSM Live</div>
                    </div>
                  )}
                </div>

                <div className="bg-[#0b1121]/50 border border-blue-500/20 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
                  <div className="flex items-center gap-2 text-blue-400 font-medium mb-1 text-sm relative z-10">
                    <Hexagon className="w-4 h-4" /> OSM Building Detected
                  </div>
                  {fetchingOsm ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 relative z-10">
                      <Loader2 className="w-3 h-3 animate-spin" /> Fetching footprint...
                    </div>
                  ) : (
                    <div className="relative z-10">
                      <div className="text-sm text-slate-200">Building ID: {osmData?.id}</div>
                      {osmData?.id === "Not Found" && (
                        <div className="text-xs text-amber-500 mt-1 italic">No building footprint found at this location.</div>
                      )}
                    </div>
                  )}
                </div>

                <form onSubmit={handleSaveNewSurvey} className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    {formSettings.houseNo && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">House No.</label>
                        <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="Auto or Enter..." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      </div>
                    )}
                    {formSettings.floors && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                        <input type="text" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="e.g. G+1" className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" required />
                      </div>
                    )}
                  </div>
                  {formSettings.buildingName && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Building Name</label>
                      <input type="text" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="Auto or Enter..." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                  {formSettings.landUse && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                      <select value={landUse} onChange={(e) => setLandUse(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="industrial">Industrial</option>
                        <option value="mixed">Mixed Use</option>
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {formSettings.condition && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Condition</label>
                        <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="poor">Poor</option>
                          <option value="ruins">Ruins</option>
                        </select>
                      </div>
                    )}
                    {formSettings.occupancy && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Occupancy</label>
                        <select value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                          <option value="occupied">Occupied</option>
                          <option value="vacant">Vacant</option>
                          <option value="abandoned">Abandoned</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={fetchingOsm} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 mt-4 text-sm font-medium transition-colors disabled:opacity-50">
                    Save Survey
                  </button>
                </form>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* DRAGGABLE VIEW/EDIT SURVEY MODAL */}
      {viewedSurvey && (
        <Draggable handle=".handle">
          <div className="absolute top-24 left-1/4 z-50 w-full max-w-md bg-[#111827]/95 backdrop-blur-2xl border border-indigo-500/30 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.2)] overflow-hidden pointer-events-auto">
            <div className="handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <div className="w-12 h-1 bg-white/20 rounded-full"></div>
            </div>
            <div className="p-6 pt-2">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                  <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">{viewedSurvey.index}</span>
                  Edit Survey Data
                </h2>
                <div className="flex gap-2">
                  <button onClick={handleDeleteSurvey} title="Delete Survey" className="text-slate-400 hover:text-red-400 p-1 rounded-full hover:bg-red-400/10 transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => setViewedSurvey(null)} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                    ✕
                  </button>
                </div>
              </div>

              <div className="text-sm text-slate-400 mb-4 bg-black/20 p-3 rounded-lg border border-white/5">
                Saved at Lat: {viewedSurvey.location?.lat.toFixed(5)}, Lng: {viewedSurvey.location?.lng.toFixed(5)}
              </div>

              <form onSubmit={handleUpdateSurvey} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {formSettings.houseNo && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">House No.</label>
                      <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                  {formSettings.floors && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                      <input type="text" value={floors} onChange={(e) => setFloors(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" required />
                    </div>
                  )}
                </div>
                {formSettings.buildingName && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Building Name</label>
                    <input type="text" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                )}
                {formSettings.landUse && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                    <select value={landUse} onChange={(e) => setLandUse(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                      <option value="industrial">Industrial</option>
                      <option value="mixed">Mixed Use</option>
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {formSettings.condition && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Condition</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                        <option value="ruins">Ruins</option>
                      </select>
                    </div>
                  )}
                  {formSettings.occupancy && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Occupancy</label>
                      <select value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        <option value="occupied">Occupied</option>
                        <option value="vacant">Vacant</option>
                        <option value="abandoned">Abandoned</option>
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 mt-4 text-sm font-medium transition-colors">
                  <Edit2 className="w-4 h-4" /> Save Changes
                </button>
              </form>
            </div>
          </div>
        </Draggable>
      )}

    </div>
  );
}
