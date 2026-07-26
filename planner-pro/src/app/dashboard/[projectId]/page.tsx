"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import dynamic from "next/dynamic";
import DraggablePanel from "@/components/DraggablePanel";
import { SafeErrorBoundary } from "@/components/SafeErrorBoundary";
import { Loader2, Hexagon, Printer, Download, Layers, Map as MapIcon, Settings2, FileEdit, ArrowLeft, Trash2, Edit2, MapPin, Building2, Store, Factory, TreePine, Map as LucideMap, Plus, GripVertical, CheckCircle2, Share2, Users, Copy, Link, Check, X } from "lucide-react";
import * as xlsx from 'xlsx';

// Dynamic import of MapWrapper with explicit error handling and timeout
const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-3 font-medium">Initializing Map Engine...</span>
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
  return <LucideMap className="w-4 h-4 text-slate-400" />; // fallback
};

type QuestionType = 'shortText' | 'longText' | 'number' | 'date' | 'checkbox' | 'multipleChoice' | 'combobox';

interface FormField {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[]; // for multiple choice / combobox
  required: boolean;
  visible: boolean;
  showInAnalytics?: boolean;
}

const DEFAULT_SCHEMA: FormField[] = [
  { id: 'buildingName', label: 'Building Name', type: 'shortText', options: [], required: false, visible: true },
  { id: 'houseNo', label: 'House No. / Plot No.', type: 'shortText', options: [], required: false, visible: true },
  { id: 'landUse', label: 'Land Use / Category', type: 'multipleChoice', options: ['Residential', 'Commercial', 'Industrial', 'Mixed Use', 'Public/Semi-Public', 'Open Space'], required: true, visible: true, showInAnalytics: true },
  { id: 'floors', label: 'Number of Floors', type: 'multipleChoice', options: ['G', 'G+1', 'G+2', 'G+3', 'G+4', 'G+5', 'G+6', 'G+7', 'G+8', 'G+9', 'G+10', 'G+15', 'G+20'], required: true, visible: true },
  { id: 'structureType', label: 'Structural Type', type: 'multipleChoice', options: ['RCC (Concrete)', 'Load Bearing', 'Temporary / Kutcha', 'Wooden / Heritage'], required: false, visible: true, showInAnalytics: true },
  { id: 'condition', label: 'Building Condition', type: 'multipleChoice', options: ['Good', 'Fair', 'Poor', 'Dilapidated / Ruins'], required: false, visible: true, showInAnalytics: true },
  { id: 'occupancy', label: 'Occupancy Status', type: 'multipleChoice', options: ['Fully Occupied', 'Partially Occupied', 'Vacant', 'Under Construction'], required: false, visible: true, showInAnalytics: true },
  { id: 'roadWidth', label: 'Approach Road Width (m)', type: 'number', options: [], required: false, visible: true },
  { id: 'hasParking', label: 'Has Dedicated Parking?', type: 'checkbox', options: [], required: false, visible: true },
  { id: 'remarks', label: 'Inspector Remarks / Notes', type: 'longText', options: [], required: false, visible: true },
];

export default function DashboardProjectPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Primary Data States
  const [project, setProject] = useState<any>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  
  // Loading & Error States
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Map Tools State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  // Sharing State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Safely initialize and fetch data with strict timeouts
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
      return;
    }

    if (!projectId) {
      setLoadError("Invalid Project ID");
      setIsDataLoading(false);
      return;
    }

    let isMounted = true;
    
    // Safety timeout: if Firestore takes longer than 5 seconds, force UI to load anyway
    const safetyTimeout = setTimeout(() => {
      if (isMounted && isDataLoading) {
        setIsDataLoading(false);
        if (!project) setLoadError("Data sync delayed. Showing local cache if available.");
      }
    }, 5000);

    const initDashboard = async () => {
      try {
        // Fetch Project Document
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);
        
        if (!isMounted) return;
        
        if (!projectDoc.exists()) {
          router.push("/projects");
          return;
        }

        const pData = projectDoc.data();
        setProject({ id: projectDoc.id, ...pData });
        
        // Ensure valid schema
        let loadedSchema = Array.isArray(pData.formSchema) ? pData.formSchema : DEFAULT_SCHEMA;
        setFormSchema(loadedSchema);
        
        // Auto-join logic
        if (pData.userId !== user.uid && user.email && !(pData.collaborators || []).includes(user.email)) {
             const newCollaborators = [...(pData.collaborators || []), user.email];
             await updateDoc(projectRef, { collaborators: newCollaborators });
             setProject({ id: projectDoc.id, ...pData, collaborators: newCollaborators });
        }

        setIsDataLoading(false);
        clearTimeout(safetyTimeout);

      } catch (err: any) {
        if (!isMounted) return;
        console.error("Dashboard Init Error:", err);
        setLoadError(err.message || "Failed to load project");
        setIsDataLoading(false);
      }
    };

    initDashboard();

    // Subscribe to Surveys
    let unsubscribeSurveys = () => {};
    try {
      const q = query(collection(db, `projects/${projectId}/surveys`));
      unsubscribeSurveys = onSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        const loadedSurveys: any[] = [];
        snapshot.forEach((doc) => {
          loadedSurveys.push({ id: doc.id, ...doc.data() });
        });
        setSurveys(loadedSurveys);
        // If we are still strictly loading the first snapshot, clear it
        if (isDataLoading) {
           setIsDataLoading(false);
           clearTimeout(safetyTimeout);
        }
      }, (err) => {
        console.error("Survey Snapshot Error:", err);
      });
    } catch (e) {
      console.error("Survey Query Setup Error:", e);
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      unsubscribeSurveys();
    };
  }, [projectId, user, authLoading, router]);

  const handleExport = () => {
    if (!surveys || surveys.length === 0) {
      alert("No data to export.");
      return;
    }

    const formattedData = surveys.map(survey => {
      const row: any = {
        "Survey ID": survey.id,
        "Latitude": survey.location?.lat || "",
        "Longitude": survey.location?.lng || ""
      };
      formSchema.forEach(f => {
        row[f.label] = survey.answers?.[f.id] || survey[f.id] || "";
      });
      row["Created At"] = survey.createdAt?.seconds ? new Date(survey.createdAt.seconds * 1000).toLocaleString() : "";
      return row;
    });

    const ws = xlsx.utils.json_to_sheet(formattedData);
    if (formattedData.length > 0) {
      ws['!cols'] = Object.keys(formattedData[0]).map(key => ({ wch: Math.max(key.length + 2, 15) }));
    }
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Surveys");
    xlsx.writeFile(wb, `${project?.name || 'Project'}_Data.xlsx`);
  };

  const saveFormSchema = async (newSchema: FormField[]) => {
    setFormSchema(newSchema);
    try {
      await updateDoc(doc(db, "projects", projectId), {
        formSchema: newSchema,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving schema", err);
    }
  };

  const copyToClipboard = (text: string, type: 'link' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleRemoveCollaborator = async (email: string) => {
    if (!project) return;
    try {
      const newCollaborators = (project.collaborators || []).filter((e: string) => e !== email);
      await updateDoc(doc(db, "projects", projectId), {
        collaborators: newCollaborators
      });
      setProject({ ...project, collaborators: newCollaborators });
    } catch (err) {
      console.error("Error removing collaborator", err);
      alert("Failed to remove collaborator.");
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setActiveClickLoc({ lat, lng });
    setActiveBuildingGeom([]);
    setViewedSurvey(null);
    setIsNewSurveyModalOpen(true);
    setOsmData(null);
    setFetchingOsm(true);
    
    const initialData: Record<string, string> = {};
    (formSchema || []).filter(f => f).forEach(field => {
      initialData[field.id] = field.type === 'multipleChoice' && Array.isArray(field.options) && field.options.length > 0 
        ? field.options[0] 
        : "";
    });
    setFormData(initialData);
    
    // Auto Footprint Detection via Overpass
    try {
      // Extremely optimized overpass query around specific point (radius 15 meters)
      const overpassQuery = `[out:json][timeout:10];(way[building](around:15, ${lat}, ${lng});relation[building](around:15, ${lat}, ${lng}););out body geom;`;
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
          approxArea = Math.round(w * h * 0.7); // Roughly approximate polygon area from bounds
        }

        setOsmData({
          id: `${building.type}/${building.id}`,
          area: approxArea > 0 ? approxArea : "Unknown",
          tags: tags
        });

        // Smart fill
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
    
    const editData: Record<string, string> = {};
    (formSchema || []).filter(f => f).forEach(field => {
      editData[field.id] = (survey.answers && survey.answers[field.id]) 
                           || survey[field.id] 
                           || (field.type === 'multipleChoice' && Array.isArray(field.options) && field.options.length > 0 ? field.options[0] : "");
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
      await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
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
      await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
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
        await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
        setViewedSurvey(null);
      } catch (error) {
        console.error("Error deleting survey:", error);
      }
    }
  };

  // ----------------------------------------------------
  // RENDER SAFETY CHECKS
  // ----------------------------------------------------
  if (authLoading || (isDataLoading && !loadError)) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-slate-400 font-medium animate-pulse">Initializing Secure Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#0b1121] overflow-hidden font-sans">
      
      {/* ABSOLUTE FULL-SCREEN MAP - NOW WRAPPED IN SAFE BOUNDARY */}
      <div className="absolute inset-0 z-0">
        <SafeErrorBoundary componentName="Main Map Canvas">
          <MapWrapper 
            surveys={surveys} 
            onMapClick={handleMapClick} 
            onSurveyClick={handleSurveyClick}
            activeBuildingGeom={activeBuildingGeom}
            activeClickLoc={activeClickLoc || undefined}
            showHeatmap={showHeatmap}
            showMarkers={showMarkers}
          />
        </SafeErrorBoundary>
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
          <div className="bg-indigo-600 rounded-lg p-1.5 shadow-lg shadow-indigo-600/30">
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Planning Survey Pro</h1>
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
            
            {loadError && (
              <div className="bg-red-500/20 text-red-400 text-xs p-3 rounded-lg border border-red-500/30 mb-4">
                ⚠️ {loadError}
              </div>
            )}

            <div className="flex items-center gap-6">
              <Link href="/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <span className="text-sm font-medium text-slate-300">{profile?.name || user?.displayName || "User"}</span>
                {profile?.photoURL || user?.photoURL ? (
                  <img src={profile?.photoURL || user?.photoURL} alt="Profile" className="w-9 h-9 rounded-full object-cover border-2 border-indigo-500/30" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
                    {(profile?.name || user?.displayName || "U")[0].toUpperCase()}
                  </div>
                )}
              </Link>
            </div>
            
            <div className="flex items-start gap-3 mb-6 mt-4">
              <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-xl mt-1">
                <MapIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white truncate w-52">{project?.name || "Untitled Project"}</h2>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Active Sync
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-6 shrink-0">
              <button 
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="w-4 h-4" /> Export Data to Excel
              </button>
            </div>

            <div className="mb-6 shrink-0">
              <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-3 uppercase">Map Control Panel</h3>
              <div className="space-y-1">
                {[
                  { id: 'markers', label: 'Toggle Survey Markers', icon: MapPin, state: showMarkers, setter: setShowMarkers },
                  { id: 'heat', label: 'Toggle Heatmap Mode', icon: Hexagon, state: showHeatmap, setter: setShowHeatmap },
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
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => setIsBuilderOpen(true)} className="flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 rounded-xl py-2 text-sm font-medium transition-colors">
                  <Settings2 className="w-4 h-4" /> Form Editor
                </button>
                <button onClick={() => setIsShareModalOpen(true)} className="flex items-center justify-center gap-2 text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:bg-purple-500/10 rounded-xl py-2 text-sm font-medium transition-colors">
                  <Share2 className="w-4 h-4" /> Sharing
                </button>
              </div>
            </div>

            <div className="mt-auto shrink-0">
              <h3 className="text-xs font-bold tracking-wider text-slate-500 mb-3 uppercase">Live Analytics</h3>
              <div className="bg-[#0b1121]/50 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
                <div className="flex justify-between items-end relative z-10 mb-4 border-b border-white/10 pb-4">
                  <span className="text-slate-400 text-sm">Total Logged:</span>
                  <span className="text-2xl font-bold text-white">{surveys.length}</span>
                </div>
                
                {(() => {
                  const analyticsFields = (formSchema || []).filter(f => f && (f.type === 'combobox' || f.type === 'multipleChoice') && f.visible && f.showInAnalytics !== false);
                  if (analyticsFields.length === 0) {
                    return <div className="text-xs text-slate-500 italic relative z-10">Add a Dropdown question to unlock detailed stats.</div>;
                  }
                  return (
                    <div className="space-y-6 relative z-10 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar pb-4">
                      {analyticsFields.map(field => {
                        const counts = surveys.reduce((acc, survey) => {
                          const ans = (survey.answers && survey.answers[field.id]) || survey[field.id];
                          if (!ans) return acc;
                          acc[ans] = (acc[ans] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        return (
                          <div key={field.id} className="space-y-3">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2 pb-1 border-b border-indigo-500/20">By {field.label}</div>
                            {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([category, count]) => (
                              <div key={category} className="flex justify-between items-center text-sm">
                                <span className="flex items-center gap-2 text-slate-300 truncate pr-2 capitalize">
                                  {getCategoryIcon(category)} {category}
                                </span>
                                <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">{count}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </aside>
      </DraggablePanel>

      {/* FORM BUILDER MODAL */}
      {isBuilderOpen && (
        <SafeErrorBoundary componentName="Form Builder Modal">
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-2xl bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
             <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111827]">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-indigo-400" /> Form Data Schema
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Design the fields collected for every map ping.</p>
                </div>
                <button onClick={() => setIsBuilderOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10">✕</button>
             </div>
             
             <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
                {(formSchema || []).filter(f => f).map((field, idx) => (
                  <div key={field.id} className={`bg-[#1e293b] border ${field.visible ? 'border-white/10' : 'border-red-500/30 bg-red-500/5'} rounded-xl p-4 flex gap-4 transition-all`}>
                    <div className="text-slate-500 mt-2">
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
                          <label className="block text-xs font-medium text-slate-400 mb-1">Response Type</label>
                          <select 
                            value={field.type}
                            onChange={(e) => {
                              const newSchema = [...formSchema];
                              newSchema[idx].type = e.target.value as QuestionType;
                              if (e.target.value !== 'shortText' && !newSchema[idx].options) {
                                newSchema[idx].options = ['Option A', 'Option B'];
                              }
                              setFormSchema(newSchema);
                            }}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          >
                            <option value="shortText">Short Text</option>
                            <option value="longText">Paragraph</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="checkbox">Checkbox (Yes/No)</option>
                            <option value="multipleChoice">Multiple Choice</option>
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
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-3 pt-2 border-l border-white/5 pl-4">
                      <button 
                        onClick={() => {
                          const newSchema = [...formSchema];
                          newSchema[idx].visible = !newSchema[idx].visible;
                          setFormSchema(newSchema);
                        }}
                        title={field.visible ? "Hide Question" : "Show Question"}
                        className={`p-1.5 rounded-md ${field.visible ? 'bg-indigo-500/20 text-indigo-400' : 'bg-red-500/20 text-red-400'}`}
                      >
                        {field.visible ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
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
               <button onClick={() => { saveFormSchema(formSchema); setIsBuilderOpen(false); }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg transition-colors">Save Schema</button>
             </div>
          </div>
        </div>
        </SafeErrorBoundary>
      )}

      {/* SHARE MODAL */}
      {isShareModalOpen && (
        <SafeErrorBoundary componentName="Share Project Modal">
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#111827]">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-purple-500" /> Share Project
                </h2>
                <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-400 mb-6">
                  Share this project code or direct link with your team. Anyone with the code can join and collaborate instantly!
                </p>
                <div className="space-y-4 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Direct Invite Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/${projectId}`}
                        readOnly
                        className="flex-1 bg-[#0b1121] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-400 truncate focus:outline-none"
                      />
                      <button
                        onClick={() => copyToClipboard(`${window.location.origin}/dashboard/${projectId}`, 'link')}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 flex items-center gap-2"
                      >
                        {copiedLink ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />} Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SafeErrorBoundary>
      )}

      {/* DRAGGABLE DATA ENTRY MODAL (NEW OR EDIT) */}
      {(isNewSurveyModalOpen || viewedSurvey) && (
        <SafeErrorBoundary componentName="Data Entry Modal">
          <DraggablePanel initialPosition={{ x: 40, y: 100 }} className="z-50 w-full max-w-md">
            <div className="bg-[#111827]/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden">
            <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-indigo-500/10 flex items-center justify-center hover:bg-indigo-500/20 transition-colors border-b border-indigo-500/30">
              <div className="w-12 h-1 bg-indigo-500/50 rounded-full"></div>
            </div>
            <div className="p-6 pt-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                  {viewedSurvey ? <Edit2 className="w-5 h-5 text-indigo-400" /> : <MapIcon className="w-5 h-5 text-emerald-400" />}
                  {viewedSurvey ? "Edit Survey Data" : "Log New Survey"}
                </h2>
                <button onClick={() => { setIsNewSurveyModalOpen(false); setViewedSurvey(null); setActiveBuildingGeom([]); setActiveClickLoc(null); }} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Geo Info */}
                {!viewedSurvey && activeClickLoc && (
                  <div className="bg-[#0b1121] border border-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 font-medium mb-2 text-sm">
                      <MapPin className="w-4 h-4" /> Captured Coordinates
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 font-mono">
                      <div>{activeClickLoc.lat.toFixed(6)}</div>
                      <div>{activeClickLoc.lng.toFixed(6)}</div>
                    </div>
                  </div>
                )}

                {/* Overpass Footprint Info */}
                {!viewedSurvey && (
                  <div className="bg-[#0b1121] border border-blue-500/20 rounded-xl p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
                    <div className="flex items-center gap-2 text-blue-400 font-medium mb-1 text-sm relative z-10">
                      <Hexagon className="w-4 h-4" /> AI Footprint Detection
                    </div>
                    {fetchingOsm ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 relative z-10">
                        <Loader2 className="w-3 h-3 animate-spin" /> Scanning OSM Database...
                      </div>
                    ) : (
                      <div className="relative z-10 mt-2">
                        {osmData?.id === "Not Found" ? (
                          <div className="text-xs text-amber-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> No footprint extracted.</div>
                        ) : (
                          <div className="text-sm text-slate-200 font-mono">Target: {osmData?.id} <br/> Area: {osmData?.area} sq/m</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Dynamic Form */}
                <form onSubmit={viewedSurvey ? handleUpdateSurvey : handleSaveNewSurvey} className="space-y-4 mt-6">
                  {(formSchema || []).filter(f => f && f.visible).map(field => (
                    <div key={field.id} className="w-full">
                      <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
                      
                      {field.type === 'shortText' && (
                        <input type="text" value={formData[field.id] || ''} onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      )}
                      
                      {field.type === 'longText' && (
                        <textarea value={formData[field.id] || ''} onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} rows={3} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-y" />
                      )}

                      {field.type === 'number' && (
                        <input type="number" value={formData[field.id] || ''} onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      )}

                      {(field.type === 'multipleChoice' || field.type === 'combobox') && (
                        <select value={formData[field.id] || ''} onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                          <option value="">Select Option...</option>
                          {(Array.isArray(field.options) ? field.options : []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}

                  <div className="pt-4 flex items-center justify-between gap-3 border-t border-white/10">
                    {viewedSurvey && (
                      <button type="button" onClick={handleDeleteSurvey} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                    <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-bold shadow-lg shadow-indigo-600/20 transition-colors">
                      {viewedSurvey ? "Update Data" : "Save Survey Log"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            </div>
          </DraggablePanel>
        </SafeErrorBoundary>
      )}
    </div>
  );
}
