"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { Loader2, Hexagon, Printer, Download, Layers, Map as MapIcon, Settings2, FileEdit, ArrowLeft, CheckCircle2 } from "lucide-react";

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

  // Survey Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [osmData, setOsmData] = useState<any>(null);
  const [fetchingOsm, setFetchingOsm] = useState(false);
  
  // Extended Form State
  const [houseNo, setHouseNo] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [floors, setFloors] = useState("");
  const [landUse, setLandUse] = useState("residential");
  const [condition, setCondition] = useState("good");
  const [occupancy, setOccupancy] = useState("occupied");

  // Map Tools State
  const [show3D, setShow3D] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
    setSelectedLocation({ lat, lng });
    setIsModalOpen(true);
    setOsmData(null);
    setFetchingOsm(true);
    
    // Clear form for new entry
    setHouseNo("");
    setBuildingName("");
    setFloors("");
    setLandUse("residential");
    
    try {
      // Fetch Real OSM Building Data using Overpass API
      const overpassQuery = `
        [out:json];
        (
          way[building](around:10, ${lat}, ${lng});
          relation[building](around:10, ${lat}, ${lng});
        );
        out body geom;
      `;
      
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: overpassQuery
      });
      const data = await response.json();
      
      if (data.elements && data.elements.length > 0) {
        const building = data.elements[0];
        const tags = building.tags || {};
        
        // Approximate Area Calculation based on bounding box
        let approxArea = 0;
        if (building.bounds) {
          const w = (building.bounds.maxlon - building.bounds.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
          const h = (building.bounds.maxlat - building.bounds.minlat) * 111320;
          approxArea = Math.round(w * h * 0.7); // Roughly 70% of bounding box
        }

        setOsmData({
          id: `${building.type}/${building.id}`,
          area: approxArea > 0 ? approxArea : "Unknown",
          tags: tags
        });

        // Pre-fill form
        if (tags['addr:housenumber']) setHouseNo(tags['addr:housenumber']);
        if (tags['name']) setBuildingName(tags['name']);
        if (tags['building:levels']) setFloors(tags['building:levels']);
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

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !user) return;

    try {
      await addDoc(collection(db, `projects/${projectId}/surveys`), {
        location: selectedLocation,
        houseNo,
        buildingName,
        floors: parseInt(floors) || 1,
        landUse,
        condition,
        occupancy,
        osmData,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving survey:", error);
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

      {/* FLOATING RIGHT SIDEBAR */}
      <aside className="absolute top-6 right-6 bottom-6 w-80 bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col z-10 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-y-auto pointer-events-auto">
        <div className="flex items-start gap-3 mb-8">
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

        <div className="space-y-3 mb-8">
          <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20">
            <Printer className="w-4 h-4" /> Print Map Layout
          </button>
          <button className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 rounded-xl py-3 text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Export Project Data
          </button>
        </div>

        <div className="mb-8">
          <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-4 uppercase">Map Tools</h3>
          <div className="space-y-1">
            {[
              { id: '3d', label: '3D Buildings', icon: Layers, state: show3D, setter: setShow3D },
              { id: 'heat', label: 'Survey Heatmap', icon: Hexagon, state: showHeatmap, setter: setShowHeatmap },
              { id: 'street', label: 'Street View Mode', icon: MapIcon, state: showStreetView, setter: setShowStreetView },
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
            <Settings2 className="w-4 h-4" /> Edit Survey Form
          </button>
        </div>

        <div className="mt-auto">
          <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-4 uppercase">Project Analytics</h3>
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

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl p-6">
             <h2 className="text-xl font-bold text-white mb-4">Form Settings</h2>
             <p className="text-sm text-slate-400 mb-6">Customize the fields that appear when clicking the map.</p>
             
             <div className="space-y-3 mb-6">
                {['House Number', 'Building Name', 'Floors', 'Land Use', 'Condition', 'Occupancy Status'].map(field => (
                  <div key={field} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500" /> {field} (Enabled)
                  </div>
                ))}
             </div>
             
             <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* GLASSMORPHIC SURVEY MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
          <div className="w-full max-w-md bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 pointer-events-auto overflow-y-auto max-h-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <MapIcon className="w-5 h-5 text-indigo-400" /> New Survey Data
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#0b1121]/50 border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2 text-sm">
                  <MapIcon className="w-4 h-4" /> Geographical Location
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                  <div>Lat: {selectedLocation?.lat.toFixed(6)}</div>
                  <div>Lng: {selectedLocation?.lng.toFixed(6)}</div>
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
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching live OSM data...
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

              <form onSubmit={handleSaveSurvey} className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">House No.</label>
                    <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="Auto or Enter..." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                    <input type="number" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="Auto or Enter..." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Building Name</label>
                  <input type="text" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="Auto or Enter..." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                  <select value={landUse} onChange={(e) => setLandUse(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="industrial">Industrial</option>
                    <option value="mixed">Mixed Use</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Condition</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                      <option value="ruins">Ruins</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Occupancy</label>
                    <select value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      <option value="occupied">Occupied</option>
                      <option value="vacant">Vacant</option>
                      <option value="abandoned">Abandoned</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={fetchingOsm} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 mt-4 text-sm font-medium transition-colors disabled:opacity-50">
                  Save Survey
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
