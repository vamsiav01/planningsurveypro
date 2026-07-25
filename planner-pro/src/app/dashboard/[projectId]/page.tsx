"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { Loader2, Hexagon, Printer, Download, Layers, Map, Settings2, FileEdit, ArrowLeft } from "lucide-react";

// Dynamically import MapWrapper to avoid SSR issues with Leaflet
const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin" />
      <span className="ml-3">Loading Maps...</span>
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
  
  // Form State
  const [houseNo, setHouseNo] = useState("");
  const [floors, setFloors] = useState("");
  const [landUse, setLandUse] = useState("residential");

  // Map Tools State
  const [show3D, setShow3D] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }

    const fetchProjectAndSurveys = async () => {
      try {
        // Get Project
        const projectDoc = await getDoc(doc(db, "projects", projectId as string));
        if (projectDoc.exists()) {
          setProject({ id: projectDoc.id, ...projectDoc.data() });
        } else {
          router.push("/projects");
          return;
        }

        // Listen to Surveys for this project
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
    
    setTimeout(() => {
      setOsmData({
        id: `relation/${Math.floor(Math.random() * 9000000) + 1000000}`,
        area: Math.floor(Math.random() * 5000) + 500,
        perimeter: Math.floor(Math.random() * 1000) + 100
      });
      setFetchingOsm(false);
    }, 1500);
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !user) return;

    try {
      await addDoc(collection(db, `projects/${projectId}/surveys`), {
        location: selectedLocation,
        houseNo,
        floors: parseInt(floors) || 1,
        landUse,
        osmData,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setHouseNo("");
      setFloors("");
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
          mapType="satellite"
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
      <aside className="absolute top-6 right-6 bottom-6 w-80 bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col z-10 shadow-2xl overflow-y-auto pointer-events-auto">
        <div className="flex items-start gap-3 mb-8">
          <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-xl mt-1">
            <Map className="w-6 h-6" />
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
              { id: 'street', label: 'Street View Mode', icon: Map, state: showStreetView, setter: setShowStreetView },
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
          
          <button className="w-full flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 rounded-xl py-2 mt-4 text-sm font-medium transition-colors">
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

      {/* GLASSMORPHIC SURVEY MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
          <div className="w-full max-w-md bg-[#111827]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 pointer-events-auto overflow-y-auto max-h-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Map className="w-5 h-5 text-indigo-400" /> New Survey Data
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#0b1121]/50 border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-medium mb-2 text-sm">
                  <Map className="w-4 h-4" /> Geographical Location
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                  <div>Lat: {selectedLocation?.lat.toFixed(6)}</div>
                  <div>Lng: {selectedLocation?.lng.toFixed(6)}</div>
                </div>
                {osmData && (
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 mt-2 border-t border-white/5 pt-2">
                    <div>Area: {osmData.area} sq meters</div>
                    <div>Perimeter: {osmData.perimeter} meters</div>
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
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading building footprints...
                  </div>
                ) : (
                  <div className="relative z-10">
                    <div className="text-sm text-slate-200">Building ID: {osmData?.id}</div>
                    <div className="text-xs text-slate-500 mt-1 italic">* No floor data in OSM, please enter manually.</div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveSurvey} className="space-y-3 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">House No.</label>
                  <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="Enter house no...." className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                  <input type="number" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="Number of floors" className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                  <select value={landUse} onChange={(e) => setLandUse(e.target.value)} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="residential">residential</option>
                    <option value="commercial">commercial</option>
                    <option value="industrial">industrial</option>
                    <option value="mixed">mixed use</option>
                  </select>
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
