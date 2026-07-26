"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import dynamic from "next/dynamic";
import DraggablePanel from "@/components/DraggablePanel";
import { Loader2, Hexagon, Printer, Download, Layers, Map as MapIcon, Settings2, FileEdit, ArrowLeft, Trash2, Edit2, MapPin, Building2, Store, Factory, TreePine, Map, Plus, GripVertical } from "lucide-react";

const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-3 font-medium">Loading Professional Maps...</span>
    </div>
  )
});

// Helper for dynamic icons based on category string
const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase();
  if (cat.includes('residential') || cat.includes('house')) return <Building2 className="w-4 h-4 text-emerald-400" />;
  if (cat.includes('commercial') || cat.includes('retail') || cat.includes('shop')) return <Store className="w-4 h-4 text-blue-400" />;
  if (cat.includes('industrial') || cat.includes('factory')) return <Factory className="w-4 h-4 text-orange-400" />;
  if (cat.includes('open') || cat.includes('park') || cat.includes('green')) return <TreePine className="w-4 h-4 text-green-400" />;
  if (cat.includes('mixed')) return <Layers className="w-4 h-4 text-purple-400" />;
  return <Map className="w-4 h-4 text-slate-400" />; // fallback
};

type QuestionType = 'shortText' | 'multipleChoice' | 'combobox';

interface FormField {
  id: string;
  label: string;
  type: QuestionType;
  options: string[]; // for multiple choice / combobox
  required: boolean;
  visible: boolean;
}

const DEFAULT_SCHEMA: FormField[] = [
  { id: 'houseNo', label: 'House No.', type: 'shortText', options: [], required: false, visible: true },
  { id: 'floors', label: 'Floors', type: 'shortText', options: [], required: true, visible: true },
  { id: 'buildingName', label: 'Building Name', type: 'shortText', options: [], required: false, visible: true },
  { id: 'landUse', label: 'Land Use / Category', type: 'combobox', options: ['Residential', 'Commercial', 'Industrial', 'Mixed Use', 'Open Space'], required: true, visible: true },
  { id: 'condition', label: 'Condition', type: 'multipleChoice', options: ['Good', 'Fair', 'Poor', 'Ruins'], required: false, visible: true },
  { id: 'occupancy', label: 'Occupancy', type: 'multipleChoice', options: ['Occupied', 'Vacant', 'Abandoned'], required: false, visible: true },
];

export default function DashboardProjectPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Schema State
  const [formSchema, setFormSchema] = useState<FormField[]>([]);
  
  // Active Map State
  const [activeBuildingGeom, setActiveBuildingGeom] = useState<any[]>([]);
  const [activeClickLoc, setActiveClickLoc] = useState<{lat: number, lng: number} | null>(null);

  // Modal States
  const [isNewSurveyModalOpen, setIsNewSurveyModalOpen] = useState(false);
  const [viewedSurvey, setViewedSurvey] = useState<any>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  
  // Data State
  const [osmData, setOsmData] = useState<any>(null);
  const [fetchingOsm, setFetchingOsm] = useState(false);
  
  // Dynamic Form Data State
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Map Tools State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    const fetchProjectAndSurveys = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", projectId as string));
        if (projectDoc.exists()) {
          const pData = projectDoc.data();
          setProject({ id: projectDoc.id, ...pData });
          setFormSchema(Array.isArray(pData.formSchema) ? pData.formSchema : DEFAULT_SCHEMA);
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

  // Handle saving the dynamic schema back to the project
  const saveFormSchema = async (newSchema: FormField[]) => {
    setFormSchema(newSchema);
    try {
      await updateDoc(doc(db, "projects", projectId as string), {
        formSchema: newSchema
      });
    } catch (err) {
      console.error("Error saving schema", err);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setActiveClickLoc({ lat, lng });
    setActiveBuildingGeom([]);
    setViewedSurvey(null);
    setIsNewSurveyModalOpen(true);
    setOsmData(null);
    setFetchingOsm(true);
    
    // Clear dynamic form data, populate defaults
    const initialData: Record<string, string> = {};
    (formSchema || []).filter(f => f).forEach(field => {
      if (field.type === 'multipleChoice' && (Array.isArray(field.options) ? field.options : []).length > 0) {
        initialData[field.id] = (Array.isArray(field.options) ? field.options : [])[0];
      } else {
        initialData[field.id] = "";
      }
    });
    
    try {
      const overpassQuery = `[out:json];(way[building](around:30, ${lat}, ${lng});relation[building](around:30, ${lat}, ${lng}););out body geom;`;
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });
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

        // Smart populate logic for legacy standard fields if they exist in schema
        if (tags['addr:housenumber'] && formSchema.find(f => f.id === 'houseNo')) initialData['houseNo'] = tags['addr:housenumber'];
        if (tags['name'] && formSchema.find(f => f.id === 'buildingName')) initialData['buildingName'] = tags['name'];
        if (tags['building:levels'] && formSchema.find(f => f.id === 'floors')) {
          const levels = parseInt(tags['building:levels']);
          initialData['floors'] = !isNaN(levels) ? (levels > 1 ? `G+${levels - 1}` : 'G') : tags['building:levels'];
        }
      } else {
        setOsmData({ id: "Not Found", area: "N/A", tags: {} });
      }
    } catch (err) {
      console.error("OSM Fetch Error", err);
      setOsmData({ id: "Error", area: "N/A", tags: {} });
    } finally {
      setFormData(initialData);
      setFetchingOsm(false);
    }
  };

  const handleSurveyClick = (survey: any, index: string | number) => {
    setIsNewSurveyModalOpen(false);
    setActiveClickLoc(null);
    setActiveBuildingGeom([]);
    
    // Set dynamic form state to edit mode (supporting legacy flat fields)
    const editData: Record<string, string> = {};
    (formSchema || []).filter(f => f).forEach(field => {
      editData[field.id] = (survey.answers && survey.answers[field.id]) 
                           || survey[field.id] 
                           || (field.type === 'multipleChoice' && (Array.isArray(field.options) ? field.options : []).length > 0 ? (Array.isArray(field.options) ? field.options : [])[0] : "");
    });
    setFormData(editData);
    setViewedSurvey({ ...survey, index });
  };

  const handleSaveNewSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClickLoc || !user) return;
    try {
      await addDoc(collection(db, `projects/${projectId}/surveys`), {
        location: activeClickLoc,
        answers: formData,
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
        answers: formData
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

  // Dynamic Analytics Calculations: find the first multiple choice/combobox field to act as the primary category
  const categoryField = (formSchema || []).filter(f => f).find(f => (f.type === 'combobox' || f.type === 'multipleChoice') && f.visible);
  
  const dynamicCounts = surveys.reduce((acc, survey) => {
    if (!categoryField) return acc;
    // Support legacy data
    const ans = (survey.answers && survey.answers[categoryField.id]) || survey[categoryField.id] || 'Uncategorized';
    if (!ans) return acc;
    acc[ans] = (acc[ans] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
      <DraggablePanel initialPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 340 : 1000, y: 24 }} className="z-20 w-80">
        <aside className="bg-[#111827]/95 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh]">
          {/* FIXED DRAG HANDLE */}
          <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors shrink-0 z-10">
            <div className="w-12 h-1 bg-white/20 rounded-full"></div>
          </div>
          
          {/* SCROLLABLE CONTENT */}
          <div className="p-6 pt-2 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-start gap-3 mb-6">
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

            <div className="space-y-3 mb-6 shrink-0">
              <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20">
                <Printer className="w-4 h-4" /> Print Map Layout
              </button>
              <button className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 rounded-xl py-3 text-sm font-medium transition-colors">
                <Download className="w-4 h-4" /> Export Project Data
              </button>
            </div>

            <div className="mb-6 shrink-0">
              <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-3 uppercase">Map Tools</h3>
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
              
              <button onClick={() => setIsBuilderOpen(true)} className="w-full flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 rounded-xl py-2 mt-4 text-sm font-medium transition-colors">
                <Settings2 className="w-4 h-4" /> Form Builder
              </button>
            </div>

            <div className="mt-auto shrink-0">
              <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-3 uppercase">Project Analytics</h3>
              <div className="bg-[#0b1121]/50 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
                <div className="flex items-center gap-2 text-indigo-400 font-medium mb-4 relative z-10">
                  <FileEdit className="w-5 h-5" /> Survey Analytics
                </div>
                <div className="flex justify-between items-end relative z-10 mb-4 border-b border-white/10 pb-4">
                  <span className="text-slate-400 text-sm">Total Surveyed:</span>
                  <span className="text-2xl font-bold text-white">{surveys.length}</span>
                </div>
                
                {categoryField ? (
                  <div className="space-y-3 relative z-10 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">By {categoryField.label}</div>
                    {Object.entries(dynamicCounts).sort((a, b) => b[1] - a[1]).map(([category, count]) => (
                      <div key={category} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2 text-slate-400 truncate pr-2 capitalize">
                          {getCategoryIcon(category)} {category}
                        </span>
                        <span className="font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic relative z-10">Add a Multiple Choice or Combo Box question to see detailed analytics.</div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </DraggablePanel>

      {/* FORM BUILDER MODAL */}
      {isBuilderOpen && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[90vh]">
             <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111827]">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-indigo-400" /> Form Builder
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Design the data schema for this project. Drag fields to reorder (coming soon).</p>
                </div>
                <button onClick={() => setIsBuilderOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10">✕</button>
             </div>
             
             <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
                {(formSchema || []).filter(f => f).map((field, idx) => (
                  <div key={field.id} className={`bg-[#1e293b] border ${field.visible ? 'border-white/10' : 'border-white/5 opacity-60'} rounded-xl p-4 flex gap-4 transition-opacity`}>
                    <div className="text-slate-500 cursor-grab active:cursor-grabbing mt-2">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Question Label</label>
                          <input 
                            type="text" 
                            value={field.label} 
                            onChange={(e) => {
                              const newSchema = [...formSchema];
                              newSchema[idx].label = e.target.value;
                              setFormSchema(newSchema);
                            }}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Answer Type</label>
                          <select 
                            value={field.type}
                            onChange={(e) => {
                              const newSchema = [...formSchema];
                              newSchema[idx].type = e.target.value as QuestionType;
                              if (e.target.value !== 'shortText' && !newSchema[idx].options) {
                                newSchema[idx].options = ['Option 1'];
                              }
                              setFormSchema(newSchema);
                            }}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          >
                            <option value="shortText">Short Answer</option>
                            <option value="multipleChoice">Multiple Choice</option>
                            <option value="combobox">Combo Box (Dropdown + Manual)</option>
                          </select>
                        </div>
                      </div>
                      
                      {(field.type === 'multipleChoice' || field.type === 'combobox') && (
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">Options (comma separated)</label>
                          <input 
                            type="text" 
                            value={(Array.isArray(field.options) ? field.options : []).join(', ')} 
                            onChange={(e) => {
                              const newSchema = [...formSchema];
                              newSchema[idx].options = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                              setFormSchema(newSchema);
                            }}
                            placeholder="e.g. Residential, Commercial"
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-3 pt-2">
                      <button 
                        onClick={() => {
                          const newSchema = [...formSchema];
                          newSchema[idx].visible = !newSchema[idx].visible;
                          setFormSchema(newSchema);
                        }}
                        title={field.visible ? "Hide Question" : "Show Question"}
                        className={`p-1.5 rounded-md ${field.visible ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-400'}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          if(window.confirm('Delete this question? Past survey answers for this question will remain in the database but won\'t be visible.')) {
                            const newSchema = formSchema.filter((_, i) => i !== idx);
                            setFormSchema(newSchema);
                          }
                        }}
                        className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => {
                    const newSchema = [...formSchema, { id: `field_${Date.now()}`, label: 'New Question', type: 'shortText', options: [], required: false, visible: true } as FormField];
                    setFormSchema(newSchema);
                  }}
                  className="w-full border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  <Plus className="w-5 h-5" /> Add Question
                </button>
             </div>
             
             <div className="p-6 border-t border-white/10 bg-[#111827] flex justify-end gap-3">
               <button onClick={() => setIsBuilderOpen(false)} className="px-6 py-2 rounded-lg text-slate-300 hover:text-white transition-colors">Cancel</button>
               <button onClick={() => { saveFormSchema(formSchema); setIsBuilderOpen(false); }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">Save Form Schema</button>
             </div>
          </div>
        </div>
      )}

      {/* DRAGGABLE NEW SURVEY MODAL */}
      {isNewSurveyModalOpen && (
        <DraggablePanel initialPosition={{ x: typeof window !== 'undefined' ? (window.innerWidth / 2) - 200 : 400, y: 100 }} className="z-50 w-full max-w-md">
          <div className="bg-[#111827]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <div className="w-12 h-1 bg-white/20 rounded-full"></div>
            </div>
            <div className="p-6 pt-2 max-h-[85vh] overflow-y-auto custom-scrollbar">
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
                  {(formSchema || []).filter(f => f && f.visible).map(field => (
                    <div key={field.id} className="w-full">
                      <label className="block text-xs font-medium text-slate-400 mb-1">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
                      
                      {field.type === 'shortText' && (
                        <input 
                          type="text" 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                        />
                      )}
                      
                      {field.type === 'multipleChoice' && (
                        <select 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="" disabled>Select option...</option>
                          {(Array.isArray(field.options) ? field.options : []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                      
                      {field.type === 'combobox' && (
                        <>
                          <input 
                            list={`list_${field.id}`}
                            value={formData[field.id] || ''} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                            required={field.required}
                            placeholder="Select or type custom..."
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                          />
                          <datalist id={`list_${field.id}`}>
                            {(Array.isArray(field.options) ? field.options : []).map(opt => <option key={opt} value={opt} />)}
                          </datalist>
                        </>
                      )}
                    </div>
                  ))}
                  <button type="submit" disabled={fetchingOsm} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 mt-4 text-sm font-medium transition-colors disabled:opacity-50">
                    Save Survey
                  </button>
                </form>
              </div>
            </div>
          </div>
        </DraggablePanel>
      )}

      {/* DRAGGABLE VIEW/EDIT SURVEY MODAL */}
      {viewedSurvey && (
        <DraggablePanel initialPosition={{ x: typeof window !== 'undefined' ? (window.innerWidth / 2) - 200 : 400, y: 100 }} className="z-50 w-full max-w-md">
          <div className="bg-[#111827]/95 backdrop-blur-2xl border border-indigo-500/30 rounded-2xl shadow-[0_0_50px_rgba(99,102,241,0.2)] overflow-hidden">
            <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <div className="w-12 h-1 bg-white/20 rounded-full"></div>
            </div>
            <div className="p-6 pt-2 max-h-[85vh] overflow-y-auto custom-scrollbar">
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
                {(formSchema || []).filter(f => f && f.visible).map(field => (
                    <div key={field.id} className="w-full">
                      <label className="block text-xs font-medium text-slate-400 mb-1">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
                      
                      {field.type === 'shortText' && (
                        <input 
                          type="text" 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                        />
                      )}
                      
                      {field.type === 'multipleChoice' && (
                        <select 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="" disabled>Select option...</option>
                          {(Array.isArray(field.options) ? field.options : []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                      
                      {field.type === 'combobox' && (
                        <>
                          <input 
                            list={`list_${field.id}`}
                            value={formData[field.id] || ''} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                            required={field.required}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                          />
                          <datalist id={`list_${field.id}`}>
                            {(Array.isArray(field.options) ? field.options : []).map(opt => <option key={opt} value={opt} />)}
                          </datalist>
                        </>
                      )}
                    </div>
                  ))}
                <button type="submit" className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 mt-4 text-sm font-medium transition-colors">
                  <Edit2 className="w-4 h-4" /> Save Changes
                </button>
              </form>
            </div>
          </div>
        </DraggablePanel>
      )}

    </div>
  );
}
