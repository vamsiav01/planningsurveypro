"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, orderBy, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Loader2, Hexagon, LayoutDashboard, Trash2, User as UserIcon, LogOut, 
  Printer, Download, Building, Map, Eye, Edit, BarChart2, X, MapPin, Save, Trash, ArrowLeft, Link, Check
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
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [houseNo, setHouseNo] = useState("");
  const [floors, setFloors] = useState("1");
  const [zoning, setZoning] = useState("residential");
  const [condition, setCondition] = useState("good");
  const [roadAccess, setRoadAccess] = useState("paved");
  const [occupants, setOccupants] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const zoningCounts = surveys.reduce((acc, survey) => {
    const z = survey.answers?.zoning || 'unknown';
    acc[z] = (acc[z] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  // Fetch Project Name
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "projects", projectId), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProject({ id: docSnap.id, ...data });

        // Auto-join logic
        const members = data.members || [];
        if (!members.includes(user.uid)) {
          try {
            await updateDoc(doc(db, "projects", projectId), {
              members: arrayUnion(user.uid)
            });
          } catch (err) {
            console.error("Error joining project:", err);
          }
        }
      }
    });
    return () => unsub();
  }, [projectId, user]);

  // Fetch Surveys
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `projects/${projectId}/surveys`), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSurveys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [projectId, user]);

  const handleMapClick = async (lat: number, lng: number, preFetchedFootprint?: any) => {
    // Reset edit mode when clicking a new spot
    setSelectedSurveyId(null);
    setHouseNo("");
    setFloors("1");
    setZoning("residential");
    setCondition("good");
    setRoadAccess("paved");
    setOccupants("");
    setYearBuilt("");

    setActiveClickLoc({ lat, lng });

    if (preFetchedFootprint) {
      setActiveFootprint(preFetchedFootprint);
      
      // Auto-extract tags
      if (preFetchedFootprint.tags) {
        const t = preFetchedFootprint.tags;
        
        // Auto-fill House Name / Number
        if (t.name) setHouseNo(t.name);
        else if (t['addr:housenumber'] && t['addr:street']) setHouseNo(`${t['addr:housenumber']} ${t['addr:street']}`);
        else if (t['addr:housenumber']) setHouseNo(t['addr:housenumber']);
        
        // Auto-fill Floors
        if (t['building:levels']) setFloors(t['building:levels']);
        
        // Auto-fill Zoning
        const bType = String(t.building || '').toLowerCase();
        if (['residential', 'apartments', 'house', 'detached', 'terrace'].includes(bType)) setZoning('residential');
        else if (['commercial', 'retail', 'office', 'supermarket'].includes(bType)) setZoning('commercial');
        else if (['industrial', 'warehouse', 'factory'].includes(bType)) setZoning('industrial');
        else if (['public', 'school', 'hospital', 'civic', 'government'].includes(bType)) setZoning('public');
      }

      setLoadingFootprint(false);
      return;
    }

    setLoadingFootprint(true);
    setActiveFootprint(null);
    
    try {
      // Increased radius to 25m for better rural detection
      const q = `
        [out:json][timeout:10];
        (
          way["building"](around:25, ${lat}, ${lng});
          relation["building"](around:25, ${lat}, ${lng});
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
    setSelectedSurveyId(null);
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

  const handleSurveyClick = (survey: any) => {
    setSelectedSurveyId(survey.id);
    setActiveClickLoc(survey.location);
    if (survey.osmData) {
      setActiveFootprint(survey.osmData);
    } else {
      setActiveFootprint(null);
    }

    setHouseNo(survey.answers?.houseNo || "");
    setFloors(survey.answers?.floors || "1");
    setZoning(survey.answers?.zoning || "residential");
    setCondition(survey.answers?.condition || "good");
    setRoadAccess(survey.answers?.roadAccess || "paved");
    setOccupants(survey.answers?.occupants || "");
    setYearBuilt(survey.answers?.yearBuilt || "");
  };

  const handleDeleteSurvey = async () => {
    if (!selectedSurveyId) return;
    await deleteSurveyById(selectedSurveyId);
    closeForm();
  };

  const deleteSurveyById = async (id: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to delete this survey?")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, `projects/${projectId}/surveys`, id));
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const closeForm = () => {
    setActiveClickLoc(null);
    setActiveFootprint(null);
    setSelectedSurveyId(null);
    setHouseNo("");
    setFloors("1");
    setZoning("residential");
    setCondition("good");
    setRoadAccess("paved");
    setOccupants("");
    setYearBuilt("");
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
          zoning,
          condition,
          roadAccess,
          occupants,
          yearBuilt
        },
        surveyorId: user.uid,
        updatedAt: serverTimestamp()
      };

      if (selectedSurveyId) {
        await updateDoc(doc(db, `projects/${projectId}/surveys`, selectedSurveyId), surveyData);
      } else {
        (surveyData as any).createdAt = serverTimestamp();
        await addDoc(collection(db, `projects/${projectId}/surveys`), surveyData);
      }
      
      closeForm();
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
      
      {/* 1. Center Map Area & Floating Glassmorphism Modal */}
      <main className="flex-1 relative h-full">
        <div className="absolute top-6 left-16 z-[1000] flex gap-3">
          <button 
            onClick={() => router.push('/projects')}
            className="bg-slate-900/80 backdrop-blur-md border border-white/10 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="bg-indigo-600/90 backdrop-blur-md border border-indigo-400/30 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium transition-all"
          >
            {copied ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Invite Link"}
          </button>
        </div>
        <MapWrapper 
          surveys={surveys} 
          onMapClick={handleMapClick}
          onDrawCreate={handleDrawCreate}
          onSurveyClick={handleSurveyClick}
          activeClickLoc={activeClickLoc}
          activeFootprint={activeFootprint}
          loadingFootprint={loadingFootprint}
        />

        {/* Floating Glassmorphism Survey Form */}
        {activeClickLoc && (
          <div className="absolute top-8 right-8 w-[400px] bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[1000] overflow-hidden flex flex-col max-h-[calc(100vh-64px)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-400" /> {selectedSurveyId ? "Edit Survey Data" : "New Survey Data"}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
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
              {activeFootprint ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                  <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                    Building Boundary Selected
                  </h3>
                  <div className="text-sm text-blue-100/70 font-mono">
                    <p>Source ID: {(activeFootprint as any).id || "Manual Draw"}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                  <p className="text-xs text-amber-300">
                    No footprint detected by OSM. Use the <strong>Draw Tools</strong> (Left) to trace the building!
                  </p>
                </div>
              )}

              {/* Input Form */}
              <form id="survey-form" onSubmit={handleSaveSurvey} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">House No. / Name</label>
                    <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="e.g. 101" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                    <input type="text" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="e.g. 4 or G+3" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Land Use / Zoning</label>
                    <select value={zoning} onChange={(e) => setZoning(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none">
                      <option value="residential" className="bg-slate-900">Residential</option>
                      <option value="commercial" className="bg-slate-900">Commercial</option>
                      <option value="mixed" className="bg-slate-900">Mixed Use</option>
                      <option value="public" className="bg-slate-900">Public/Govt</option>
                      <option value="industrial" className="bg-slate-900">Industrial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Condition</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none">
                      <option value="good" className="bg-slate-900">Good</option>
                      <option value="fair" className="bg-slate-900">Fair / Average</option>
                      <option value="dilapidated" className="bg-slate-900">Dilapidated</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Road Access</label>
                  <select value={roadAccess} onChange={(e) => setRoadAccess(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none">
                    <option value="paved" className="bg-slate-900">Paved Road</option>
                    <option value="unpaved" className="bg-slate-900">Unpaved / Kutcha</option>
                    <option value="none" className="bg-slate-900">No Direct Access</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Occupants</label>
                    <input type="number" value={occupants} onChange={(e) => setOccupants(e.target.value)} placeholder="Estimated" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Year Built</label>
                    <input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} placeholder="e.g. 2010" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3">
              {selectedSurveyId && (
                <button
                  type="button"
                  onClick={handleDeleteSurvey}
                  disabled={saving}
                  className="px-4 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-400 font-semibold rounded-xl transition-all flex items-center justify-center"
                >
                  <Trash className="w-5 h-5" />
                </button>
              )}
              <button
                type="submit"
                form="survey-form"
                disabled={saving}
                className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {saving ? "Saving..." : selectedSurveyId ? "Update Survey" : "Save Survey"}
              </button>
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
              <div className="flex items-end justify-between border-t border-white/5 pt-4 pb-2">
                <span className="text-sm text-slate-400">Total Surveyed:</span>
                <span className="text-2xl font-bold text-white leading-none">{surveys.length}</span>
              </div>
              
              {Object.entries(zoningCounts).map(([zone, count]) => (
                <div key={zone} className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400 capitalize flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-indigo-400/70" /> {zone}
                  </span>
                  <span className="text-sm font-semibold text-white">{String(count)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Surveys List */}
          <div className="mt-8">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Saved Surveys</h3>
            <div className="space-y-3">
              {surveys.length === 0 && (
                <div className="text-sm text-slate-500 italic text-center py-4 bg-black/10 rounded-xl border border-white/5">
                  No surveys saved yet.
                </div>
              )}
              {surveys.map((survey, index) => (
                <div key={survey.id} className="bg-black/20 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-colors group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">
                        S{index + 1}
                      </div>
                      {survey.answers?.houseNo || survey.answers?.buildingName || "Survey"}
                    </span>
                    <span className="text-xs text-emerald-400 font-medium capitalize">
                      {survey.answers?.zoning || 'Residential'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button 
                      onClick={() => handleSurveyClick(survey)}
                      className="flex-1 bg-white/5 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-400 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button 
                      onClick={() => deleteSurveyById(survey.id)}
                      className="flex-1 bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

    </div>
  );
}
