"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2, LayoutDashboard, Trash2, User as UserIcon, Hexagon, LogOut, Mail, Clock, Key, Shield, CheckCircle2, Download, BookOpen, Save, RefreshCw, Database } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [profileData, setProfileData] = useState({
    fullName: "",
    scholarNumber: "",
    branch: "B. Planning",
    program: "Bachelor",
    section: "NA",
    year: "3",
    semester: "5"
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    } else if (user) {
      const fetchProjects = async () => {
        try {
          const q = query(collection(db, "projects"), where("userId", "==", user.uid), where("isDeleted", "==", false));
          const querySnapshot = await getDocs(q);
          const loaded: any[] = [];
          querySnapshot.forEach((d) => loaded.push({ id: d.id, ...d.data() }));
          setProjects(loaded);
        } catch (e) {
          console.error(e);
        }
      };

      const fetchProfile = async () => {
        try {
          const docSnap = await getDoc(doc(db, "users", user.uid));
          if (docSnap.exists()) {
            setProfileData(prev => ({ ...prev, ...docSnap.data() }));
          }
        } catch (e) {
          console.error(e);
        }
      };

      fetchProjects();
      fetchProfile();
    }
  }, [user, authLoading, router]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), profileData, { merge: true });
      alert("Profile saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Error saving profile");
    }
    setSaving(false);
  };

  const handleSyncNow = () => {
    window.location.reload();
  };

  const handleResetAppData = async () => {
    if (window.confirm("⚠️ WARNING: This will immediately move ALL your active projects to the Trash Bin. Are you sure?")) {
      if (!user) return;
      try {
        const q = query(collection(db, "projects"), where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(async (d) => {
          await updateDoc(doc(db, "projects", d.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
          });
        });
        alert("App Data Reset! All projects moved to Trash.");
        window.location.reload();
      } catch (e) {
        console.error(e);
        alert("Failed to reset app data.");
      }
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
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
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800/50 flex flex-col z-20 shadow-2xl">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-indigo-600 rounded-lg p-1.5 shadow-lg shadow-indigo-600/30">
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Planning Survey Pro</h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-2">
          <button onClick={() => router.push('/projects')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button onClick={() => router.push('/trash')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <Trash2 className="w-5 h-5" /> Trash Bin
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 text-indigo-400 font-medium transition-colors">
            <UserIcon className="w-5 h-5" /> Profile
          </button>
          <a 
            href="/PlanningSurveyPro.apk"
            download="PlanningSurveyPro.apk"
            className="w-full mt-4 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl py-3 px-4 text-sm font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]"
          >
            <Download className="w-4 h-4" /> Download APK
          </a>
        </nav>

        <div className="p-4 border-t border-slate-800/50">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium truncate max-w-[120px]">{user?.email}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" /> Log Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#090b14]">
        <div className="max-w-xl mx-auto space-y-4 pb-12">
          
          <div className="flex items-center justify-between mb-2 mt-4">
            <h2 className="text-xl font-bold text-white">My Profile</h2>
          </div>
          <p className="text-xs text-slate-400 mb-6">Manage your personal information, account, and backup settings.</p>
          
          {/* PROFILE HEADER CARD */}
          <div className="bg-[#121622] border border-white/5 rounded-2xl p-8 flex flex-col items-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="w-20 h-20 rounded-full bg-indigo-600/20 flex items-center justify-center text-3xl font-bold text-indigo-400 shadow-xl border-2 border-indigo-500/30 z-10 mb-4 overflow-hidden">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            
            <h3 className="text-lg font-bold text-white tracking-widest uppercase z-10">
              {profileData.fullName || user?.email?.split('@')[0]}
            </h3>
            {profileData.scholarNumber && (
              <p className="text-slate-400 text-xs mt-1 z-10 font-mono">Scholar No: {profileData.scholarNumber}</p>
            )}
            
            <div className="flex gap-2 mt-4 z-10 flex-wrap justify-center">
              {profileData.program && <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">{profileData.program}</span>}
              {profileData.branch && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">{profileData.branch}</span>}
              <span className="bg-orange-500/20 text-orange-400 border border-orange-500/20 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Active
              </span>
            </div>
          </div>

          {/* ACTIVE PROJECTS CARD */}
          <div className="bg-[#121622] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-white">Active Projects Summary</h3>
            </div>
            
            <div className="space-y-2">
              {projects.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No active projects found.</p>
              ) : (
                projects.map((proj, idx) => (
                  <div key={proj.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-red-500', 'bg-purple-500'][idx % 5]}`}></div>
                      <span className="text-xs font-semibold text-slate-200">{proj.name}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">100%</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* PERSONAL INFORMATION CARD */}
          <div className="bg-[#121622] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <UserIcon className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-white">Personal Information</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({...profileData, fullName: e.target.value})}
                  className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scholar Number</label>
                <input 
                  type="text" 
                  value={profileData.scholarNumber}
                  onChange={(e) => setProfileData({...profileData, scholarNumber: e.target.value})}
                  className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter scholar number"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Branch</label>
                <select 
                  value={profileData.branch}
                  onChange={(e) => setProfileData({...profileData, branch: e.target.value})}
                  className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option>B. Planning</option>
                  <option>M. Planning</option>
                  <option>Architecture</option>
                  <option>Civil Engineering</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Program</label>
                <select 
                  value={profileData.program}
                  onChange={(e) => setProfileData({...profileData, program: e.target.value})}
                  className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option>Bachelor</option>
                  <option>Master</option>
                  <option>PhD</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Section</label>
                  <select 
                    value={profileData.section}
                    onChange={(e) => setProfileData({...profileData, section: e.target.value})}
                    className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option>NA</option>
                    <option>A</option>
                    <option>B</option>
                    <option>C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Year</label>
                  <select 
                    value={profileData.year}
                    onChange={(e) => setProfileData({...profileData, year: e.target.value})}
                    className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                    <option>5</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Semester</label>
                <select 
                  value={profileData.semester}
                  onChange={(e) => setProfileData({...profileData, semester: e.target.value})}
                  className="w-full bg-[#090b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                  <option>5</option>
                  <option>6</option>
                  <option>7</option>
                  <option>8</option>
                </select>
              </div>
              
              <button 
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>

          {/* ACCOUNT & BACKUP CARD */}
          <div className="bg-[#121622] border border-white/5 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-white">Account & Backup</h3>
            </div>
            
            <div className="bg-[#090b14] border border-white/5 rounded-xl p-4 flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">{user?.email?.split('@')[0]}</h4>
                  <p className="text-[10px] text-slate-400">{user?.email}</p>
                </div>
              </div>
              <div className="bg-emerald-500/10 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-500/20 uppercase tracking-wider">
                Connected
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 mb-6 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Account active since {user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unknown'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleSyncNow}
                className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-emerald-500/5 text-emerald-400 border border-emerald-500/30 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Sync Now
              </button>
              
              <button 
                onClick={handleResetAppData}
                className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-orange-500/5 text-orange-400 border border-orange-500/30 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <Database className="w-4 h-4" /> Reset App Data
              </button>
              
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-[#090b14] hover:bg-slate-800 text-slate-300 border border-white/5 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>

              <button 
                onClick={() => window.confirm("Are you sure you want to permanently delete your account? This action cannot be undone.")}
                className="w-full flex items-center justify-center gap-2 bg-[#dc2626] hover:bg-red-500 text-white rounded-xl py-3 text-sm font-medium transition-colors shadow-lg shadow-red-900/20 mt-6"
              >
                <Trash2 className="w-4 h-4" /> Delete Account
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
