"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, orderBy, arrayUnion, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Loader2, Hexagon, LayoutDashboard, Trash2, User as UserIcon, LogOut, 
  Printer, Download, Building, Map, Eye, Edit, BarChart2, X, MapPin, Save, Trash, ArrowLeft, Link, Check, Plus, GripVertical, Settings2, Lock, Share2, Copy
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

// Helper to calculate area of polygon in square meters using Shoelace formula
function calculatePolygonArea(coords: any[]) {
  if (coords.length < 3) return 0;
  let area = 0;
  // Convert degrees to approximate meters
  const latFactor = 111139;
  const getLat = (c: any) => Array.isArray(c) ? c[0] : c.lat;
  const getLng = (c: any) => Array.isArray(c) ? c[1] : c.lng;

  const lngFactor = 111139 * Math.cos((getLat(coords[0]) * Math.PI) / 180);
  
  for (let i = 0; i < coords.length; i++) {
    let j = (i + 1) % coords.length;
    let xi = getLng(coords[i]) * lngFactor;
    let yi = getLat(coords[i]) * latFactor;
    let xj = getLng(coords[j]) * lngFactor;
    let yj = getLat(coords[j]) * latFactor;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function DashboardContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id') || "";
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
  const [buildingName, setBuildingName] = useState("");
  const [floors, setFloors] = useState("G");
  const [zoning, setZoning] = useState("residential");
  const [condition, setCondition] = useState("good");
  const [roadAccess, setRoadAccess] = useState("paved");
  const [occupants, setOccupants] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dynamic Builder State
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [builderSchema, setBuilderSchema] = useState<any[]>([]);
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, any>>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  const zoningCounts = surveys.reduce((acc, survey) => {
    const z = survey.answers?.zoning || 'unknown';
    acc[z] = (acc[z] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  // Self-heal survey count for legacy projects
  useEffect(() => {
    if (project && project.surveyCount !== surveys.length) {
      updateDoc(doc(db, "projects", projectId), { surveyCount: surveys.length }).catch(console.error);
    }
  }, [surveys.length, project, projectId]);

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

  const resolveBuildingDetails = async (coords: [number, number][], tags: any, lat: number, lng: number) => {
    let fetchedName = tags.name || tags['addr:housename'] || "";
    if (!fetchedName && tags['addr:housenumber'] && tags['addr:street']) {
      fetchedName = `${tags['addr:housenumber']} ${tags['addr:street']}`;
    } else if (!fetchedName && tags['addr:housenumber']) {
      fetchedName = tags['addr:housenumber'];
    }

    let fetchedFloorsNum = 1;
    if (tags.height) {
      // Estimate floors from height (approx 3.5m per floor for more accuracy)
      fetchedFloorsNum = Math.max(1, Math.round(tags.height / 3.5));
    } else if (tags['building:levels']) {
      fetchedFloorsNum = parseInt(tags['building:levels']) || 1;
    } else if (tags.building) {
      // Smart AI Heuristic: Guess floors based on building type if no height is provided
      const bType = String(tags.building).toLowerCase();
      if (bType === 'apartments') fetchedFloorsNum = 4; // Apartments usually G+3
      else if (['commercial', 'office', 'hospital', 'hotel', 'retail'].includes(bType)) fetchedFloorsNum = 3; // G+2
      else if (bType === 'school' || bType === 'university') fetchedFloorsNum = 2; // G+1
    }

    let fetchedFloors = "G";
    if (fetchedFloorsNum === 2) fetchedFloors = "G+1";
    else if (fetchedFloorsNum === 3) fetchedFloors = "G+2";
    else if (fetchedFloorsNum === 4) fetchedFloors = "G+3";
    else if (fetchedFloorsNum >= 5) fetchedFloors = "G+4+";

    const bType = String(tags.building || '').toLowerCase();
    let fetchedZoning = "residential";
    if (['commercial', 'retail', 'office', 'supermarket'].includes(bType)) fetchedZoning = 'commercial';
    else if (['industrial', 'warehouse', 'factory'].includes(bType)) fetchedZoning = 'industrial';
    else if (['public', 'school', 'hospital', 'civic', 'government'].includes(bType)) fetchedZoning = 'public';

    // TRICK: Reverse geocode to find name from online sources (Nominatim)
    if (!fetchedName) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (data && data.address) {
          const a = data.address;
          if (data.name) fetchedName = data.name;
          else if (a.amenity) fetchedName = a.amenity;
          else if (a.shop) fetchedName = a.shop;
          else if (a.building) fetchedName = a.building;
          else if (a.house_number && a.road) fetchedName = `${a.house_number} ${a.road}`;
          else if (a.road) fetchedName = `Building on ${a.road}`;
        }
      } catch (e) {
        console.error("Nominatim error:", e);
      }
    }
    
    return { fetchedName, fetchedFloors, fetchedZoning };
  };

  const handleMapClick = async (lat: number, lng: number, preFetchedFootprint?: any) => {
    // Reset edit mode when clicking a new spot
    setSelectedSurveyId(null);
    setHouseNo("");
    setBuildingName("");
    setFloors("G");
    setZoning("residential");
    setCondition("good");
    setRoadAccess("paved");
    setOccupants("");
    setYearBuilt("");
    setDynamicAnswers({});

    setActiveClickLoc({ lat, lng });

    if (preFetchedFootprint) {
      setActiveFootprint(preFetchedFootprint);
      setLoadingFootprint(true);
      const { fetchedName, fetchedFloors, fetchedZoning } = await resolveBuildingDetails(
        preFetchedFootprint.coords || [], 
        preFetchedFootprint.tags || {}, 
        lat, lng
      );
      if (fetchedName) setBuildingName(fetchedName);
      if (fetchedFloors) setFloors(fetchedFloors);
      if (fetchedZoning) setZoning(fetchedZoning);
      setLoadingFootprint(false);
      return;
    }

    setLoadingFootprint(true);
    setActiveFootprint(null);
    
    try {
      const q = `
        [out:json][timeout:10];
        (
          way["building"](around:25, ${lat}, ${lng});
          relation["building"](around:25, ${lat}, ${lng});
          way["building:part"](around:25, ${lat}, ${lng});
          relation["building:part"](around:25, ${lat}, ${lng});
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
      let tags: any = {};
      
      if (data.elements && data.elements.length > 0) {
        const ways = data.elements.filter((e: any) => e.type === 'way' && e.tags && (e.tags.building || e.tags['building:part']));
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
            
            const { fetchedName, fetchedFloors, fetchedZoning } = await resolveBuildingDetails(coords, tags, lat, lng);
            if (fetchedName) setBuildingName(fetchedName);
            if (fetchedFloors) setFloors(fetchedFloors);
            if (fetchedZoning) setZoning(fetchedZoning);
          }
        }
      }

      // TRICK: If overpass fails to find a polygon, detect as building using a synthetic square
      if (!foundBuilding) {
         const { fetchedName, fetchedFloors, fetchedZoning } = await resolveBuildingDetails([], {}, lat, lng);
         
         // Create a 10x10m square footprint trick so every building can be detected and tracked
         const latOffset = 0.000045; // roughly 5m
         const lngOffset = 0.000045 / Math.cos(lat * Math.PI / 180);
         const trickCoords: [number, number][] = [
           [lat + latOffset, lng - lngOffset],
           [lat + latOffset, lng + lngOffset],
           [lat - latOffset, lng + lngOffset],
           [lat - latOffset, lng - lngOffset]
         ];
         setActiveFootprint({ coords: trickCoords, tags: { building: 'yes', source: 'synthetic_trick' }, id: 'generated-' + Date.now() });
         
         if (fetchedName) setBuildingName(fetchedName);
         if (fetchedFloors) setFloors(fetchedFloors);
         if (fetchedZoning) setZoning(fetchedZoning);
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
    setActiveClickLoc(survey.location || survey.loc || {lat: 0, lng: 0});
    if (survey.osmData) {
      setActiveFootprint(survey.osmData);
    } else {
      setActiveFootprint(null);
    }

    // Fallback to legacy format if answers object is missing
    const ans = survey.answers || survey;

    setHouseNo(ans.houseNo || "");
    setBuildingName(ans.buildingName || "");
    setFloors(ans.floors || "G");
    setZoning(ans.zoning || "residential");
    setCondition(ans.condition || "good");
    setRoadAccess(ans.roadAccess || "paved");
    setOccupants(ans.occupants || "");
    setYearBuilt(ans.yearBuilt || "");
    setDynamicAnswers(ans.dynamic || {});
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
      await updateDoc(doc(db, "projects", projectId), { surveyCount: increment(-1) });
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
    setBuildingName("");
    setFloors("G");
    setZoning("residential");
    setCondition("good");
    setRoadAccess("paved");
    setOccupants("");
    setYearBuilt("");
    setDynamicAnswers({});
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClickLoc || !user) return;
    
    setSaving(true);
    try {
      const surveyData = {
        location: activeClickLoc,
        osmData: activeFootprint ? {
          coords: activeFootprint.coords.map((c: any) => ({ 
            lat: Array.isArray(c) ? c[0] : c.lat, 
            lng: Array.isArray(c) ? c[1] : c.lng 
          })),
          tags: activeFootprint.tags,
          id: (activeFootprint as any).id || "drawn"
        } : null,
        answers: {
          houseNo,
          buildingName,
          floors,
          zoning,
          condition,
          roadAccess,
          occupants,
          yearBuilt,
          dynamic: dynamicAnswers
        },
        surveyorId: user.uid,
        updatedAt: serverTimestamp()
      };

      if (selectedSurveyId) {
        await updateDoc(doc(db, `projects/${projectId}/surveys`, selectedSurveyId), surveyData);
      } else {
        (surveyData as any).createdAt = serverTimestamp();
        await addDoc(collection(db, `projects/${projectId}/surveys`), surveyData);
        // Increment project survey count
        await updateDoc(doc(db, "projects", projectId), { surveyCount: increment(1) });
      }
      
      closeForm();
    } catch (error: any) {
      console.error("Error saving survey:", error);
      alert("Error saving survey: " + (error.message || error.toString()));
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
              navigator.clipboard.writeText(currentUrl);
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
          <div className="absolute top-8 right-8 w-[400px] bg-white/5 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl shadow-black/50 z-[1000] overflow-hidden flex flex-col max-h-[calc(100vh-64px)]">
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
                    <label className="block text-xs font-medium text-slate-400 mb-1">House No. / Block</label>
                    <input type="text" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="e.g. 101" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Building Name</label>
                    <input type="text" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Landmark Towers" className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Floors</label>
                  <select value={floors} onChange={(e) => setFloors(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none">
                    <option value="G" className="bg-slate-900">G (Ground Only)</option>
                    <option value="G+1" className="bg-slate-900">G+1 (2 Floors)</option>
                    <option value="G+2" className="bg-slate-900">G+2 (3 Floors)</option>
                    <option value="G+3" className="bg-slate-900">G+3 (4 Floors)</option>
                    <option value="G+4+" className="bg-slate-900">G+4 or higher</option>
                  </select>
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

                {/* Dynamic Custom Fields */}
                {project?.formSchema?.length > 0 && (
                  <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Settings2 className="w-4 h-4" /> Custom Fields
                    </h3>
                    {project.formSchema.map((field: any) => (
                      <div key={field.id} className={field.type !== 'short_answer' && field.type !== 'number' ? 'col-span-1' : ''}>
                        <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
                        {field.type === 'short_answer' && (
                          <input type="text" value={dynamicAnswers[field.id] || ""} onChange={(e) => setDynamicAnswers({...dynamicAnswers, [field.id]: e.target.value})} className="w-full bg-black/10 backdrop-blur border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                        )}
                        {field.type === 'number' && (
                          <input type="number" value={dynamicAnswers[field.id] || ""} onChange={(e) => setDynamicAnswers({...dynamicAnswers, [field.id]: e.target.value})} className="w-full bg-black/10 backdrop-blur border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" />
                        )}
                        {field.type === 'dropdown' && (
                          <select value={dynamicAnswers[field.id] || ""} onChange={(e) => setDynamicAnswers({...dynamicAnswers, [field.id]: e.target.value})} className="w-full bg-black/10 backdrop-blur border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all appearance-none">
                            <option value="" className="bg-slate-900">Select...</option>
                            {field.options?.split(',').map((opt: string) => opt.trim()).filter(Boolean).map((opt: string) => (
                              <option key={opt} value={opt} className="bg-slate-900">{opt}</option>
                            ))}
                          </select>
                        )}
                        {field.type === 'combobox' && (
                          <>
                            <input list={`list-${field.id}`} value={dynamicAnswers[field.id] || ""} onChange={(e) => setDynamicAnswers({...dynamicAnswers, [field.id]: e.target.value})} className="w-full bg-black/10 backdrop-blur border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-black/40 transition-all" placeholder="Select or type..." />
                            <datalist id={`list-${field.id}`}>
                              {field.options?.split(',').map((opt: string) => opt.trim()).filter(Boolean).map((opt: string) => (
                                <option key={opt} value={opt} />
                              ))}
                            </datalist>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
            
            <div className="mt-auto pt-4">
              <button 
                onClick={() => { setBuilderSchema(project?.formSchema || []); setShowFormBuilder(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Settings2 className="w-4 h-4" /> Edit Survey Form
              </button>
              <button 
                onClick={() => setShowShareModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 mt-3 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-sm font-medium transition-colors"
              >
                <Share2 className="w-4 h-4" /> Share Project
              </button>
            </div>
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
                      {survey.answers?.buildingName || survey.answers?.houseNo || "Survey"}
                    </span>
                    <span className="text-xs text-emerald-400 font-medium capitalize">
                      {survey.answers?.floors} • {survey.answers?.zoning || 'Residential'}
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

      {/* Form Builder Modal */}
      {showFormBuilder && (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-white/5 backdrop-blur-3xl border border-white/20 rounded-3xl w-[600px] shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-indigo-400" /> Form Builder
                </h2>
                <p className="text-sm text-slate-400 mt-1">Design the data schema for this project. Drag fields to reorder (coming soon).</p>
              </div>
              <button onClick={() => setShowFormBuilder(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              
              {/* SYSTEM FIELDS (LOCKED) */}
              <div className="bg-black/20 border border-white/5 rounded-xl p-4 opacity-70">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">
                  <Lock className="w-3.5 h-3.5" /> System Locked Fields
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {["House No", "Building Name", "Floors", "Land Use / Zoning", "Condition", "Road Access", "Occupants", "Year Built"].map(f => (
                    <div key={f} className="text-sm font-medium text-slate-400 bg-white/5 px-3 py-2 rounded-lg">{f}</div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3 italic">These fields are required by the 3D map engine and cannot be removed.</p>
              </div>

              {builderSchema.map((field, index) => (
                <div key={field.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-start group">
                  <div className="text-slate-600 mt-2 cursor-grab">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Question Label</label>
                        <input type="text" value={field.label} onChange={(e) => {
                          const newSchema = [...builderSchema];
                          newSchema[index].label = e.target.value;
                          setBuilderSchema(newSchema);
                        }} className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:border-indigo-500 transition-all outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Answer Type</label>
                        <select value={field.type} onChange={(e) => {
                          const newSchema = [...builderSchema];
                          newSchema[index].type = e.target.value;
                          setBuilderSchema(newSchema);
                        }} className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:border-indigo-500 transition-all outline-none appearance-none">
                          <option value="short_answer" className="bg-slate-900">Short Answer</option>
                          <option value="number" className="bg-slate-900">Number</option>
                          <option value="dropdown" className="bg-slate-900">Dropdown Select</option>
                          <option value="combobox" className="bg-slate-900">Dropdown (Manual Typing)</option>
                        </select>
                      </div>
                    </div>
                    {(field.type === 'dropdown' || field.type === 'combobox') && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Options (comma separated)</label>
                        <input type="text" value={field.options || ""} onChange={(e) => {
                          const newSchema = [...builderSchema];
                          newSchema[index].options = e.target.value;
                          setBuilderSchema(newSchema);
                        }} placeholder="e.g. Yes, No, Maybe" className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:border-indigo-500 transition-all outline-none" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg hover:bg-indigo-500/20 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => {
                      const newSchema = [...builderSchema];
                      newSchema.splice(index, 1);
                      setBuilderSchema(newSchema);
                    }} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              
              <button type="button" onClick={() => {
                setBuilderSchema([...builderSchema, { id: 'field_' + Date.now(), label: 'New Question', type: 'short_answer' }]);
              }} className="w-full py-4 border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-xl text-indigo-400 font-medium flex items-center justify-center gap-2 transition-all">
                <Plus className="w-4 h-4" /> Add Custom Field
              </button>
            </div>

            <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3 justify-end">
              <button onClick={() => setShowFormBuilder(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={async () => {
                await updateDoc(doc(db, "projects", projectId), { formSchema: builderSchema });
                setShowFormBuilder(false);
              }} className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2">
                <Save className="w-4 h-4" /> Save Form Schema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Project Modal */}
      {showShareModal && (
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm z-[3000] flex items-center justify-center">
          <div className="bg-white/5 backdrop-blur-3xl border border-white/20 rounded-3xl w-[500px] shadow-2xl shadow-black/50 overflow-hidden">
            <div className="p-8 text-center relative">
              <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Share2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Share Project</h2>
              <p className="text-sm text-slate-400 mb-8">Invite your team to collaborate on this project.</p>
              
              <div className="text-left mb-6">
                <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Project Code</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-4 text-center overflow-hidden">
                    <span className="text-lg truncate break-all font-mono font-bold text-emerald-400 block">{projectId}</span>
                  </div>
                  <div className="flex gap-2 h-full shrink-0">
                    <button onClick={() => {
                      navigator.clipboard.writeText(projectId);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }} className="h-full px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white flex flex-col items-center justify-center transition-colors">
                      <Copy className="w-5 h-5 mb-1" />
                      <span className="text-[10px] uppercase font-bold">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'Join my project on Planner Pro',
                          text: `Use my project code to join: ${projectId}`,
                        }).catch(console.error);
                      } else {
                        alert('Share not supported on this browser. Use copy instead.');
                      }
                    }} className="h-full px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400 flex flex-col items-center justify-center transition-colors">
                      <Share2 className="w-5 h-5 mb-1" />
                      <span className="text-[10px] uppercase font-bold">Share</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Teammates can paste this code into the &quot;Join Project&quot; card on their Home screen.</p>
              </div>

              <div className="text-left mb-8">
                <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Direct Link</label>
                <div className="flex items-center gap-3">
                  <input type="text" readOnly value={currentUrl} className="flex-1 bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm text-slate-300 font-mono focus:outline-none" />
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => {
                      navigator.clipboard.writeText(currentUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }} className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-colors">
                      <Copy className="w-5 h-5" />
                    </button>
                    <button onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'Join my project on Planner Pro',
                          url: currentUrl,
                        }).catch(console.error);
                      } else {
                        alert('Share not supported on this browser. Use copy instead.');
                      }
                    }} className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400 transition-colors">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={() => setShowShareModal(false)} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold tracking-widest uppercase transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b1121] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
