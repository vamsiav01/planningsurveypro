"use client";

import { useState } from "react";
import { X, Save, Building2, MapPin } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";

interface SurveyFormProps {
  location: { lat: number; lng: number };
  estimatedFloors: number;
  onClose: () => void;
  onSaved: () => void;
}

export function SurveyForm({ location, estimatedFloors, onClose, onSaved }: SurveyFormProps) {
  const { user } = useAuth();
  const [buildingType, setBuildingType] = useState("Residential");
  const [floors, setFloors] = useState(estimatedFloors.toString());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setError("");
    
    try {
      await addDoc(collection(db, "surveys"), {
        userId: user.uid,
        location,
        buildingType,
        floors: parseInt(floors, 10),
        notes,
        createdAt: serverTimestamp(),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save survey.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-2xl p-6 w-full max-w-md animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-slate-800">New Survey</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
          <X size={20} />
        </button>
      </div>

      {error && <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}

      <div className="mb-6 p-3 bg-slate-50 rounded-md border border-slate-100 flex flex-col gap-2 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          <span>Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-indigo-500" />
          <span>Estimated Floors: {estimatedFloors} (auto-detected)</span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="input-group">
          <label className="input-label">Building Type</label>
          <select 
            className="input-field" 
            value={buildingType} 
            onChange={(e) => setBuildingType(e.target.value)}
          >
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
            <option>Mixed Use</option>
            <option>Other</option>
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">Actual Floors (verify)</label>
          <input 
            type="number" 
            className="input-field"
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
            min={1}
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">Field Notes</label>
          <textarea 
            className="input-field min-h-[100px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional observations..."
          />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : <><Save size={18} /> Save Survey</>}
          </button>
        </div>
      </form>
    </div>
  );
}
