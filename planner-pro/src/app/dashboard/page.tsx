"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Layers, Search, Download } from "lucide-react";
import { SurveyForm } from "@/components/SurveyForm";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { exportToExcel } from "@/utils/exportToExcel";

// Dynamically import Leaflet wrapper to prevent SSR issues
const MapWrapper = dynamic(() => import("@/components/MapWrapper"), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-slate-100">Loading Map...</div>
});

export default function DashboardPage() {
  const [mapType, setMapType] = useState<string>("satellite"); // Esri free satellite
  const [surveys, setSurveys] = useState<any[]>([]);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [estimatedFloors, setEstimatedFloors] = useState(0);

  // Real-time Firestore listener
  useEffect(() => {
    const q = query(collection(db, "surveys"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const surveyData: any[] = [];
      querySnapshot.forEach((doc) => {
        surveyData.push({ id: doc.id, ...doc.data() });
      });
      setSurveys(surveyData);
    });

    return () => unsubscribe();
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (showSurveyForm) return; // Don't allow multiple forms at once
    setSelectedLocation({ lat, lng });
    // Simulate floor estimation based on elevation data (mocked)
    setEstimatedFloors(Math.floor(Math.random() * 10) + 1);
    setShowSurveyForm(true);
  };

  return (
    <div className="flex-1 relative flex">
      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <MapWrapper 
          surveys={surveys} 
          onMapClick={handleMapClick} 
          mapType={mapType} 
        />

        {/* Survey Form Modal */}
        {showSurveyForm && selectedLocation && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSurveyForm(false)} />
            <div className="relative z-50 w-full max-w-md mx-4">
                <SurveyForm 
                  location={selectedLocation}
                  estimatedFloors={estimatedFloors}
                  onClose={() => setShowSurveyForm(false)}
                  onSaved={() => console.log("Survey saved")}
                />
            </div>
          </div>
        )}

        {/* Custom Map Controls Overlay */}
        <div className="absolute top-4 left-4 z-40 flex gap-2">
          <div className="bg-white rounded-md shadow-md p-1 flex items-center border border-slate-200">
            <Search className="w-5 h-5 text-slate-400 ml-2" />
            <input 
              type="text" 
              placeholder="Search location..." 
              className="border-none outline-none focus:ring-0 text-sm py-2 px-3 w-64 bg-transparent"
            />
          </div>
        </div>

        <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
          <button 
            className="bg-white p-3 rounded-full shadow-md text-slate-700 hover:text-primary transition-colors border border-slate-200"
            onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
            title="Toggle Map Type"
          >
            <Layers className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sidebar for Surveys */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col hidden md:flex z-10">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Project Surveys</h2>
          <button 
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-2 text-sm border border-slate-200"
            onClick={() => exportToExcel(surveys)}
            title="Export to Excel"
          >
            <Download size={16} /> Export
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {surveys.length === 0 ? (
            <div className="text-center text-sm text-slate-500 mt-10">
              <p>No surveys yet.</p>
              <p className="mt-2 text-xs">Click on a building on the map to start a new survey.</p>
            </div>
          ) : (
            surveys.map(survey => (
              <div key={survey.id} className="p-3 border border-slate-100 rounded-md bg-slate-50 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-slate-800">{survey.buildingType}</h4>
                  <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {survey.floors} Floors
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex flex-col gap-1 mt-2">
                  <span>Lat: {survey.location?.lat.toFixed(4)}</span>
                  <span>Lng: {survey.location?.lng.toFixed(4)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
