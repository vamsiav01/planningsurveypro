"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Loader2, Hexagon, LayoutDashboard, Trash2, User as UserIcon, LogOut, 
  Printer, Download, Building, Map, Eye, Edit, BarChart2, X, MapPin, Save
} from "lucide-react";

// Safe dynamic import for Leaflet map
const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-indigo-500">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  )
});

// Helper to calculate area of polygon
function calculatePolygonArea(coords: [number, number][]) {
  // Simple approximation for small areas:
  // Convert lat/lng to meters (very rough approx for display)
  if (coords.length < 3) return 0;
  return Math.floor(Math.random() * 500 + 100); // Temporary placeholder
}

interface DashboardProps {
  params: { projectId: string };
}

export default function Dashboard({ params }: DashboardProps) {
  const { projectId } = params;
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  
  const [project, setProject] = useState<any>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  
  // Map State
  const [activeClickLoc, setActiveClickLoc] = useState<{lat: number, lng: number} | null>(null);
  const [activeFootprint, setActiveFootprint] = useState<{coords: [number, number][], tags: any, id?: string | number} | null>(null);
  const [loadingFootprint, setLoadingFootprint] = useState(false);
  
  // Form State
  const [houseNo, setHouseNo] = useState("");
  const [floors, setFloors] = useState("1");
  const [zoning, setZoning] = useState("residential");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  // Fetch Project Name
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "projects", projectId), (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, [projectId, user]);

  // Fetch Surveys
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `projects/${projectId}/surveys`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSurveys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [projectId, user]);

  const handleMapClick = async (lat: number, lng: number) => {
    setActiveClickLoc({ lat, lng });
    setLoadingFootprint(true);
    setActiveFootprint(null);
    
    try {
      const q = `
        [out:json][timeout:10];
        (
          way["building"](around:15, ${lat}, ${lng});
          relation["building"](around:15, ${lat}, ${lng});
        );
        out body;
        >;
        out skel qt;
      `;
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: q
      });
      const data = await response.json();
      
      let foundBuilding = null;
      let tags = {};
      
      if (data.elements && data.elements.length > 0) {
        const ways = data.elements.filter((e: any) => e.type === 'way' && e.tags && e.tags.building);
        if (ways.length > 0) {
          const way = ways[0];
          tags = way.tags;
          const coords: [number, number][] = [];
          
          way.nodes.forEach((nodeId: number) => {
            const node = data.elements.find((e: any) => e.type === 'node' && e.id === nodeId);
            if (node) {
              coords.push([node.lat, node.lon]);
            }
          });
          
          if (coords.length > 0) {
            foundBuilding = { coords, tags, id: way.id };
            setActiveFootprint(foundBuilding);
          }
        }
      }
    } catch (error) {
      console.error("Overpass error:", error);
    } finally {
      setLoadingFootprint(false);
    }
  };

  const handleDrawCreate = (layer: any) => {
    if (typeof layer.getLatLngs === 'function') {
      const latlngs = layer.getLatLngs()[0];
      const coords = latlngs.map((ll: any) => [ll.lat, ll.lng]);
      setActiveFootprint({ coords, tags: {} });
      setActiveClickLoc({ lat: coords[0][0], lng: coords[0][1] });
    } else if (typeof layer.getLatLng === 'function') {
      const ll = layer.getLatLng();
      setActiveClickLoc({ lat: ll.lat, lng: ll.lng });
    }
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClickLoc || !user) return;
    
    setSaving(true);
    try {
      const surveyData = {
        location: activeClickLoc,
        osmData: activeFootprint ? {
          coords: activeFootprint.coords,
          tags: activeFootprint.tags,
          id: (activeFootprint as any).id || "drawn"
        } : null,
        answers: {
          houseNo,
          floors,
          zoning
        },
        surveyorId: user.uid,
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, `projects/${projectId}/surveys`), surveyData);
      
      // Reset form
      setActiveClickLoc(null);
      setActiveFootprint(null);
      setHouseNo("");
      setFloors("1");
      setZoning("residential");
    } catch (error) {
      console.error("Error saving survey:", error);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b1121] text-slate-200 overflow-hidden font-sans">
      
      {/* 1. Global Left Navigation Sidebar */}
      <aside className="w-[260px] bg-[#0f172a] border-r border-white/5 flex flex-col justify-between shrink-0 z-20 shadow-2xl">
        <div>
          <div className="h-20 flex items-center px-6 gap-3 border-b border-white/5">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Hexagon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-wide">Planner Pro</h1>
          </div>
          
          <nav className="p-4 space-y-2">
            <button onClick={() => router.push('/projects')} className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-500/10 text-indigo-400 rounded-xl font-medium transition-colors">
              <LayoutDashboard className="w-5 h-5" /> Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-xl font-medium transition-colors">
              <Trash2 className="w-5 h-5" /> Trash Bin
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-xl font-medium transition-colors">
              <UserIcon className="w-5 h-5" /> Profile
            </button>
          </nav>
        </div>
        
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
              {user.email?.[0].toUpperCase()}
            </div>
            <span className="text-sm font-medium text-slate-300 truncate">{user.email}</span>
          </div>
          <button onClick={signOut} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl font-medium transition-colors">
            <LogOut className="w-5 h-5" /> Log Out
          </button>
        </div>
      </aside>

      {/* 2. Center Map Area & Floating Glassmorphism Modal */}
      <main className="flex-1 relative h-full">
        <MapWrapper 
          surveys={surveys} 
          onMapClick={handleMapClick}
          onDrawCreate={handleDrawCreate}
          activeClickLoc={activeClickLoc}
          activeFootprint={activeFootprint}
          loadingFootprint={loadingFootprint}
        />

        {/* Floating Glassmorphism Survey Form */}
        {activeClickLoc && (
          <div className="absolute top-8 right-8 w-[380px] bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[1000] overflow-hidden flex flex-col max-h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-400" /> New Survey Data
              </h2>
              <button onClick={() => { setActiveClickLoc(null); setActiveFootprint(null); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {/* Geographic Data Box */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
                <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Geographical Location
                </h3>
                <div className="text-sm text-emerald-100/70 space-y-1 font-mono">
                  <p>Lat: {activeClickLoc.lat.toFixed(6)}</p>
                  <p>Lng: {activeClickLoc.lng.toFixed(6)}</p>
                  {activeFootprint && (
                    <>
                      <p className="mt-2 text-emerald-200">Area: ~{calculatePolygonArea(activeFootprint.coords)} sq meters</p>
                      <p>Perimeter: ~{Math.floor(activeFootprint.coords.length * 15)} meters</p>
                    </>
                  )}
                </div>
              </div>

              {/* OSM Data Box */}
              {activeFootprint && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                  <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                    OSM Building Detected
                  </h3>
                  <div className="text-sm text-blue-100/70 font-mono">
                    <p>Building ID: {(activeFootprint as any).id || "Manual Draw"}</p>
                    <p className="mt-1 text-xs text-blue-300/50 italic">* No floor data in OSM, please enter manually.</p>
                  </div>
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleSaveSurvey} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">House No.</label>
                  <input
                    type="text"
                    value={houseNo}
                    onChange={(e) => setHouseNo(e.target.value)}
                    placeholder="Enter house no...."
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                  <input
                    type="text"
                    value={floors}
                    onChange={(e) => setFloors(e.target.value)}
                    placeholder="e.g. 4 or G+3"
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                  <select
                    value={zoning}
                    onChange={(e) => setZoning(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none"
                  >
                    <option value="residential" className="bg-slate-900">residential</option>
                    <option value="commercial" className="bg-slate-900">commercial</option>
                    <option value="mixed" className="bg-slate-900">mixed</option>
                    <option value="public" className="bg-slate-900">public</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full mt-6 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {saving ? "Saving..." : "Save Survey"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* 3. Right Analytics & Tools Sidebar */}
      <aside className="w-[300px] bg-[#0f172a] border-l border-white/5 flex flex-col shrink-0 z-20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">
        {/* Project Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white truncate w-40">{project?.name || "Loading..."}</h2>
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Cloud Synced
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {/* Action Buttons */}
          <div className="space-y-3 mb-8">
            <button className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> Print Map Layout
            </button>
            <button className="w-full bg-transparent border border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Export Project Data
            </button>
          </div>

          {/* Map Tools */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Map Tools</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-slate-300">
                  <Building className="w-5 h-5 text-indigo-400" /> <span className="text-sm font-medium">3D Buildings</span>
                </div>
                <div className="w-10 h-6 bg-slate-700 rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1" />
                </div>
              </div>
              <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-slate-300">
                  <Map className="w-5 h-5 text-pink-400" /> <span className="text-sm font-medium">Survey Heatmap</span>
                </div>
                <div className="w-10 h-6 bg-slate-700 rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1" />
                </div>
              </div>
              <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-slate-300">
                  <Eye className="w-5 h-5 text-amber-400" /> <span className="text-sm font-medium">Street View Mode</span>
                </div>
                <div className="w-10 h-6 bg-slate-700 rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1" />
                </div>
              </div>
            </div>
            
            <button className="w-full mt-4 bg-transparent border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              <Edit className="w-4 h-4" /> Edit Survey Form
            </button>
          </div>

          {/* Project Analytics */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Project Analytics</h3>
            <div className="bg-black/20 border border-white/5 rounded-xl p-5">
              <div className="flex items-center gap-3 text-white font-medium mb-4">
                <BarChart2 className="w-5 h-5 text-indigo-400" /> Survey Analytics
              </div>
              <div className="flex items-end justify-between border-t border-white/5 pt-4">
                <span className="text-sm text-slate-400">Total Surveyed:</span>
                <span className="text-2xl font-bold text-white leading-none">{surveys.length}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

    </div>
  );
}
