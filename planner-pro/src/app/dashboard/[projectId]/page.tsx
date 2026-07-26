"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, ArrowLeft, Save, Trash2, X } from "lucide-react";

// Safe dynamic import for Leaflet map
const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-indigo-500">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  )
});

interface DashboardProps {
  params: Promise<{ projectId: string }>;
}

export default function Dashboard({ params }: DashboardProps) {
  const { projectId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [surveys, setSurveys] = useState<any[]>([]);
  const [activeClickLoc, setActiveClickLoc] = useState<{lat: number, lng: number} | null>(null);
  const [activeOsmTags, setActiveOsmTags] = useState<any>({});
  
  // Form State
  const [buildingName, setBuildingName] = useState("");
  const [floors, setFloors] = useState("G");
  const [saving, setSaving] = useState(false);
  
  // Selected Survey State (for editing)
  const [selectedSurvey, setSelectedSurvey] = useState<any | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `projects/${projectId}/surveys`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSurveys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user, projectId]);

  const handleMapClick = (lat: number, lng: number, tags: any) => {
    setActiveClickLoc({ lat, lng });
    setActiveOsmTags(tags);
    setSelectedSurvey(null);
    
    // Auto-fill form from OSM tags
    setBuildingName(tags.name || "");
    if (tags['building:levels']) {
      const levels = parseInt(tags['building:levels']);
      setFloors(!isNaN(levels) ? (levels > 1 ? `G+${levels - 1}` : 'G') : 'G');
    } else {
      setFloors("G");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClickLoc && !selectedSurvey) return;
    setSaving(true);
    
    try {
      const answers = { buildingName, floors };
      
      if (selectedSurvey) {
        await updateDoc(doc(db, `projects/${projectId}/surveys`, selectedSurvey.id), {
          answers
        });
        setSelectedSurvey(null);
      } else {
        await addDoc(collection(db, `projects/${projectId}/surveys`), {
          location: activeClickLoc,
          answers,
          osmData: {
            tags: activeOsmTags,
            coords: activeOsmTags.building ? null : null // The map component doesn't pass coords up yet, we'll fix this below
          },
          createdAt: serverTimestamp()
        });
        setActiveClickLoc(null);
      }
      
      // Update project timestamp
      await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
    } catch (error) {
      console.error(error);
      alert("Failed to save survey.");
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!selectedSurvey) return;
    if (window.confirm("Delete this survey record?")) {
      try {
        await deleteDoc(doc(db, `projects/${projectId}/surveys`, selectedSurvey.id));
        await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
        setSelectedSurvey(null);
      } catch (error) {
        console.error(error);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-[#0b1121] overflow-hidden text-slate-200">
      {/* Sidebar Form */}
      <div className="w-[400px] h-full flex flex-col bg-[#111827] border-r border-white/5 shadow-2xl z-20">
        <div className="h-16 flex items-center px-4 border-b border-white/5 shrink-0">
          <button 
            onClick={() => router.push("/projects")}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors mr-2"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <h2 className="font-semibold text-white truncate">Project Editor</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {(!activeClickLoc && !selectedSurvey) ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
              <p className="mb-4 text-4xl">📍</p>
              <h3 className="font-medium text-slate-300 mb-2">Select a Location</h3>
              <p className="text-sm">Click anywhere on the map to detect a building footprint and start a survey.</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                <h3 className="font-semibold text-white">
                  {selectedSurvey ? "Edit Survey" : "New Survey"}
                </h3>
                <button 
                  type="button"
                  onClick={() => { setActiveClickLoc(null); setSelectedSurvey(null); }}
                  className="p-1.5 hover:bg-white/5 text-slate-400 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Building Name</label>
                <input
                  type="text"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="Enter building name"
                  className="w-full bg-[#0f172a] border border-white/5 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Number of Floors</label>
                <select
                  value={floors}
                  onChange={(e) => setFloors(e.target.value)}
                  className="w-full bg-[#0f172a] border border-white/5 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="G">G (Ground Only) - Green</option>
                  <option value="G+1">G+1 - Blue</option>
                  <option value="G+2">G+2 - Yellow</option>
                  <option value="G+3">G+3 - Orange</option>
                  <option value="G+4">G+4+ - Red</option>
                </select>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Record</>}
                </button>
                
                {selectedSurvey && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors"
                    title="Delete Record"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 h-full relative z-0">
        <MapWrapper 
          surveys={surveys}
          activeClickLoc={activeClickLoc}
          onMapClick={handleMapClick}
        />
      </div>
    </div>
  );
}
