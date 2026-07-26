"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import dynamic from "next/dynamic";
import DraggablePanel from "@/components/DraggablePanel";
import { SafeErrorBoundary } from "@/components/SafeErrorBoundary";
import { Loader2, Hexagon, Printer, Download, Layers, Map as MapIcon, Settings2, FileEdit, ArrowLeft, Trash2, Edit2, MapPin, Building2, Store, Factory, TreePine, Map, Plus, GripVertical, CheckCircle2, Share2, Users, Copy, Link, Check, X } from "lucide-react";
import * as xlsx from 'xlsx';

const MapWrapper = dynamic(() => import("@/components/MapWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-3 font-medium">Loading Professional Maps...</span>
    </div>
  )
});

const MapboxWrapper = dynamic(() => import("@/components/MapboxWrapper"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0b1121] text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <span className="ml-3 font-medium">Loading Mapbox AI Models...</span>
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
  { id: 'houseNo', label: 'House No. / Plot No.', type: 'shortText', options: [], required: false, visible: true },
  { id: 'buildingName', label: 'Building Name', type: 'shortText', options: [], required: false, visible: true },
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

  // Sharing State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sharing, setSharing] = useState(false);

  // Mapbox BYOK State
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isMapboxModalOpen, setIsMapboxModalOpen] = useState(false);
  const [tempToken, setTempToken] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    const fetchProjectAndSurveys = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().mapboxToken) {
          setMapboxToken(userDoc.data().mapboxToken);
        }

        const projectDoc = await getDoc(doc(db, "projects", projectId as string));
        if (projectDoc.exists()) {
          const pData = projectDoc.data();
          setProject({ id: projectDoc.id, ...pData });
          let loadedSchema = Array.isArray(pData.formSchema) ? pData.formSchema : DEFAULT_SCHEMA;
          
          // Hotfix to instantly upgrade existing projects with the new Floor format and visible dropdowns
          loadedSchema = loadedSchema.map((f: FormField) => {
            if (f.id === 'floors' && f.type === 'number') {
              return { ...f, type: 'multipleChoice', options: ['G', 'G+1', 'G+2', 'G+3', 'G+4', 'G+5', 'G+6', 'G+7', 'G+8', 'G+9', 'G+10'] };
            }
            if (f.id === 'landUse' && f.type === 'combobox') {
              return { ...f, type: 'multipleChoice' };
            }
            return f;
          });
          
          setFormSchema(loadedSchema);
          
          // Magic Link Joining Logic: Automatically add user to collaborators if they have the link
          if (pData.userId !== user.uid && user.email && !(pData.collaborators || []).includes(user.email)) {
             const newCollaborators = [...(pData.collaborators || []), user.email];
             await updateDoc(doc(db, "projects", projectId as string), { collaborators: newCollaborators });
             setProject({ id: projectDoc.id, ...pData, collaborators: newCollaborators });
          }
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
        const val = survey.answers?.[f.id] || survey[f.id] || "";
        row[f.label] = val;
      });
      
      row["Created At"] = survey.createdAt?.seconds ? new Date(survey.createdAt.seconds * 1000).toLocaleString() : "";
      return row;
    });

    const ws = xlsx.utils.json_to_sheet(formattedData);
    
    // Auto-size columns for neat formatting
    if (formattedData.length > 0) {
      const colWidths = Object.keys(formattedData[0]).map(key => ({ 
        wch: Math.max(key.length + 2, 15) 
      }));
      ws['!cols'] = colWidths;
    }
    
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Surveys");
    
    xlsx.writeFile(wb, `${project?.name || 'Project'}_Data.xlsx`);
  };

  const saveFormSchema = async (newSchema: FormField[]) => {
    setFormSchema(newSchema);
    try {
      await updateDoc(doc(db, "projects", projectId as string), {
        formSchema: newSchema,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving schema", err);
    }
  };

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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
      await updateDoc(doc(db, "projects", projectId as string), {
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

  const handleAutoBuildingClick = (geom: any[], tags: any, lat: number, lng: number) => {
    setActiveClickLoc({ lat, lng });
    setActiveBuildingGeom(geom);
    setViewedSurvey(null);
    setIsNewSurveyModalOpen(true);
    setFetchingOsm(false);

    // Clear dynamic form data, populate defaults
    const initialData: Record<string, string> = {};
    (formSchema || []).filter(f => f).forEach(field => {
      if (field.type === 'multipleChoice' && (Array.isArray(field.options) ? field.options : []).length > 0) {
        initialData[field.id] = (Array.isArray(field.options) ? field.options : [])[0];
      } else {
        initialData[field.id] = "";
      }
    });

    let approxArea = 0;
    if (geom && geom.length > 0) {
      const lats = geom.map(p => p[0]);
      const lons = geom.map(p => p[1]);
      const h = (Math.max(...lats) - Math.min(...lats)) * 111320;
      const w = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos(lat * Math.PI / 180);
      approxArea = Math.round(w * h * 0.7);
    }

    setOsmData({
      id: "Auto-Detected",
      area: approxArea > 0 ? approxArea : "Unknown",
      tags: tags
    });

    if (tags['addr:housenumber'] && formSchema.find(f => f.id === 'houseNo')) initialData['houseNo'] = tags['addr:housenumber'];
    if (tags['name'] && formSchema.find(f => f.id === 'buildingName')) initialData['buildingName'] = tags['name'];
    if (tags['building:levels'] && formSchema.find(f => f.id === 'floors')) {
      const levels = parseInt(tags['building:levels']);
      initialData['floors'] = !isNaN(levels) ? (levels > 1 ? `G+${levels - 1}` : 'G') : tags['building:levels'];
    }

    setFormData(initialData);
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
      // Touch project
      await updateDoc(doc(db, "projects", projectId as string), { updatedAt: serverTimestamp() });
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
      // Touch project
      await updateDoc(doc(db, "projects", projectId as string), { updatedAt: serverTimestamp() });
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
        // Touch project
        await updateDoc(doc(db, "projects", projectId as string), { updatedAt: serverTimestamp() });
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

  // Dynamic Analytics Calculation is now done inline for all categorical fields

  return (
    <div className="relative w-screen h-screen bg-[#0b1121] overflow-hidden font-sans">
      
      {/* ABSOLUTE FULL-SCREEN MAP */}
      <div className="absolute inset-0 z-0">
        {mapboxToken ? (
          <MapboxWrapper 
            mapboxToken={mapboxToken}
            surveys={surveys} 
            onMapClick={handleMapClick} 
            onSurveyClick={handleSurveyClick}
            onAutoBuildingClick={handleAutoBuildingClick}
            activeBuildingGeom={activeBuildingGeom}
            activeClickLoc={activeClickLoc || undefined}
            showHeatmap={showHeatmap}
            showMarkers={showMarkers}
          />
        ) : (
          <MapWrapper 
            surveys={surveys} 
            onMapClick={handleMapClick} 
            onSurveyClick={handleSurveyClick}
            onAutoBuildingClick={handleAutoBuildingClick}
            activeBuildingGeom={activeBuildingGeom}
            activeClickLoc={activeClickLoc || undefined}
            showHeatmap={showHeatmap}
            showMarkers={showMarkers}
          />
        )}
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
              <button 
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 rounded-xl py-3 text-sm font-medium transition-colors"
              >
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
              
              {!mapboxToken && (
                <button 
                  onClick={() => setIsMapboxModalOpen(true)}
                  className="w-full mt-3 flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl py-2 text-xs font-bold transition-all"
                >
                  <MapIcon className="w-3.5 h-3.5" /> Upgrade to Mapbox (Pro Footprints)
                </button>
              )}
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => setIsBuilderOpen(true)} className="flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 rounded-xl py-2 text-sm font-medium transition-colors">
                  <Settings2 className="w-4 h-4" /> Form Builder
                </button>
                <button onClick={() => setIsShareModalOpen(true)} className="flex items-center justify-center gap-2 text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:bg-purple-500/10 rounded-xl py-2 text-sm font-medium transition-colors">
                  <Share2 className="w-4 h-4" /> Share
                </button>
              </div>
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
                
                {(() => {
                  const analyticsFields = (formSchema || []).filter(f => f && (f.type === 'combobox' || f.type === 'multipleChoice') && f.visible && f.showInAnalytics !== false);
                  
                  if (analyticsFields.length === 0) {
                    return <div className="text-xs text-slate-500 italic relative z-10">Add a Multiple Choice or Combo Box question to see detailed analytics.</div>;
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
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-transparent p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-black/60 border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.1)] overflow-hidden pointer-events-auto flex flex-col max-h-[90vh]">
             <div className="p-6 border-b border-white/10 flex justify-between items-center bg-transparent">
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
                            <option value="shortText" className="bg-[#0b1121] text-white">Short Answer</option>
                            <option value="longText" className="bg-[#0b1121] text-white">Paragraph / Long Text</option>
                            <option value="number" className="bg-[#0b1121] text-white">Number</option>
                            <option value="date" className="bg-[#0b1121] text-white">Date</option>
                            <option value="checkbox" className="bg-[#0b1121] text-white">Checkbox (Yes/No)</option>
                            <option value="multipleChoice" className="bg-[#0b1121] text-white">Multiple Choice / Dropdown</option>
                            <option value="combobox" className="bg-[#0b1121] text-white">Combo Box (Typable List)</option>
                          </select>
                        </div>
                      </div>
                      
                      {(field.type === 'multipleChoice' || field.type === 'combobox') && (
                        <div className="flex gap-4">
                          <div className="flex-1">
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
                          <div className="flex items-end mb-2">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-400">
                              <input 
                                type="checkbox" 
                                checked={field.showInAnalytics !== false}
                                onChange={(e) => {
                                  const newSchema = [...formSchema];
                                  newSchema[idx].showInAnalytics = e.target.checked;
                                  setFormSchema(newSchema);
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-[#0b1121] text-indigo-500 focus:ring-indigo-500/50"
                              />
                              Show in Analytics
                            </label>
                          </div>
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
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Project Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={projectId}
                        readOnly
                        className="flex-1 bg-[#0b1121] border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none"
                      />
                      <button
                        onClick={() => copyToClipboard(projectId as string, 'code')}
                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 flex items-center gap-2"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

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

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4" /> Current Collaborators
                  </h3>
                  
                  <div className="bg-[#0b1121] border border-white/5 rounded-xl divide-y divide-white/5">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                          O
                        </div>
                        <div className="text-sm">
                          <p className="text-white font-medium">Owner</p>
                          <p className="text-xs text-slate-500">Project Creator</p>
                        </div>
                      </div>
                    </div>

                    {(project?.collaborators || []).map((email: string) => (
                      <div key={email} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                            {email.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-sm truncate max-w-[180px]">
                            <p className="text-slate-300 truncate">{email}</p>
                            <p className="text-xs text-slate-500">Editor</p>
                          </div>
                        </div>
                        {project?.userId === user?.uid && (
                          <button 
                            onClick={() => handleRemoveCollaborator(email)}
                            className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-colors"
                            title="Remove access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SafeErrorBoundary>
      )}

      {/* DRAGGABLE NEW SURVEY MODAL */}
      {isNewSurveyModalOpen && (
        <SafeErrorBoundary componentName="New Survey Modal">
          <DraggablePanel initialPosition={{ x: 40, y: 100 }} className="z-50 w-full max-w-md">
            <div className="bg-black/60 border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.05)] overflow-hidden">
            <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <div className="w-12 h-1 bg-white/30 rounded-full"></div>
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

                      {field.type === 'longText' && (
                        <textarea 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          rows={3}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-y" 
                        />
                      )}

                      {field.type === 'number' && (
                        <input 
                          type="number" 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                        />
                      )}

                      {field.type === 'date' && (
                        <input 
                          type="date" 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]" 
                        />
                      )}

                      {field.type === 'checkbox' && (
                        <label className="flex items-center gap-3 cursor-pointer py-1">
                          <input 
                            type="checkbox" 
                            checked={formData[field.id] === 'true'} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.checked ? 'true' : 'false'})} 
                            required={field.required && formData[field.id] !== 'true'}
                            className="w-4 h-4 rounded border-white/20 bg-[#0b1121] text-indigo-500 focus:ring-indigo-500/50" 
                          />
                          <span className="text-sm text-slate-300">Yes</span>
                        </label>
                      )}
                      
                      {field.type === 'multipleChoice' && (
                        <select 
                          value={formData[field.id] || ''} 
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                          required={field.required}
                          className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="" disabled className="bg-[#0b1121] text-slate-400">Select option...</option>
                          {(Array.isArray(field.options) ? field.options : []).map(opt => <option key={opt} value={opt} className="bg-[#0b1121] text-white">{opt}</option>)}
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
        </SafeErrorBoundary>
      )}

      {/* DRAGGABLE VIEW/EDIT SURVEY MODAL */}
      {viewedSurvey && (
        <SafeErrorBoundary componentName="Edit Survey Modal">
          <DraggablePanel initialPosition={{ x: 40, y: 100 }} className="z-50 w-full max-w-md">
            <div className="bg-black/60 border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="drag-handle cursor-grab active:cursor-grabbing w-full h-8 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                <div className="w-12 h-1 bg-white/30 rounded-full"></div>
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

                        {field.type === 'longText' && (
                          <textarea 
                            value={formData[field.id] || ''} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                            required={field.required}
                            rows={3}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-y" 
                          />
                        )}

                        {field.type === 'number' && (
                          <input 
                            type="number" 
                            value={formData[field.id] || ''} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                            required={field.required}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                          />
                        )}

                        {field.type === 'date' && (
                          <input 
                            type="date" 
                            value={formData[field.id] || ''} 
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.value})} 
                            required={field.required}
                            className="w-full bg-[#0b1121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]" 
                          />
                        )}

                        {field.type === 'checkbox' && (
                          <label className="flex items-center gap-3 cursor-pointer py-1">
                            <input 
                              type="checkbox" 
                              checked={formData[field.id] === 'true'} 
                              onChange={(e) => setFormData({...formData, [field.id]: e.target.checked ? 'true' : 'false'})} 
                              required={field.required && formData[field.id] !== 'true'}
                              className="w-4 h-4 rounded border-white/20 bg-[#0b1121] text-indigo-500 focus:ring-indigo-500/50" 
                            />
                            <span className="text-sm text-slate-300">Yes</span>
                          </label>
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
        </SafeErrorBoundary>
      )}

      {/* MAPBOX TOKEN MODAL */}
      {isMapboxModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl relative overflow-hidden">
            <h3 className="text-xl font-bold text-white mb-2">Upgrade to Pro Footprints</h3>
            <p className="text-sm text-slate-400 mb-6">OpenStreetMap is missing some buildings. Connect a free Mapbox account to unlock AI-generated 3D footprints for almost every building on Earth.</p>
            
            <ol className="text-xs text-slate-300 list-decimal list-inside space-y-2 mb-6">
              <li>Go to <a href="https://account.mapbox.com" target="_blank" className="text-indigo-400 underline">mapbox.com</a> and create a free account.</li>
              <li>Copy your Default Public Token (starts with `pk.eyJ...`).</li>
              <li>Paste it here. It will be saved securely to your profile.</li>
            </ol>
            
            <input 
              type="text" 
              value={tempToken}
              onChange={e => setTempToken(e.target.value)}
              placeholder="pk.eyJ..."
              className="w-full bg-[#0b1121] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors mb-6 font-mono text-sm"
            />
            
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsMapboxModalOpen(false)} className="px-5 py-2.5 rounded-xl text-slate-400 hover:text-white font-medium transition-colors text-sm">Cancel</button>
              <button 
                onClick={async () => {
                  if(!tempToken || !user) return;
                  try {
                    await updateDoc(doc(db, "users", user.uid), { mapboxToken: tempToken });
                  } catch (err) {
                    await setDoc(doc(db, "users", user.uid), { mapboxToken: tempToken }, { merge: true });
                  }
                  setMapboxToken(tempToken);
                  setIsMapboxModalOpen(false);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/25 flex items-center gap-2"
              >
                Save Token & Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
