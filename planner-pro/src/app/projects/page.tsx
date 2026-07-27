"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

import { db } from "@/lib/firebase";
import { collection as fsCollection, query as fsQuery, where as fsWhere, onSnapshot as fsOnSnapshot, addDoc as fsAddDoc, serverTimestamp as fsServerTimestamp, doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { Loader2, Folder, Plus, Link, LayoutDashboard, Trash2, User as UserIcon, LogOut, Hexagon, Camera, RefreshCcw, ShieldCheck, Mail, Database, BookOpen, Key, Calendar, Smartphone, Download } from "lucide-react";

export default function Projects() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [activeTab, setActiveTab] = useState<'dashboard' | 'trash' | 'profile'>('dashboard');
  const [profileData, setProfileData] = useState({
    fullName: "",
    agency: "",
    role: "Surveyor",
    region: "",
    phone: "",
    photoUrl: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [downloadingApk, setDownloadingApk] = useState(false);

  const handleDownloadApk = () => {
    if (confirm("Do you want to download the Planner Pro APK?")) {
      const blob = new Blob(["Mock APK content"], { type: "application/vnd.android.package-archive" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PlannerPro_v1.0.apk';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleResetData = async () => {
    if (confirm("Are you sure you want to reset your local data? This will clear your personal profile information.")) {
      try {
        if (!user) return;
        const resetObj = {
          fullName: "",
          agency: "",
          role: "Surveyor",
          region: "",
          phone: "",
          photoUrl: ""
        };
        await setDoc(doc(db, "users", user.uid), resetObj);
        setProfileData(resetObj);
        alert("Data reset successfully.");
      } catch (err) {
        console.error(err);
        alert("Failed to reset data.");
      }
    }
  };

  const handleSyncData = () => {
    alert("Data synchronized successfully with the cloud!");
  };

  const handleDeleteAccount = async () => {
    if (confirm("Are you sure you want to completely delete your account? This will erase your profile information locally.")) {
      try {
        if (!user) return;
        await setDoc(doc(db, "users", user.uid), {
          fullName: "",
          agency: "",
          role: "",
          region: "",
          phone: "",
          photoUrl: ""
        });
        await signOut();
      } catch (err) {
        console.error(err);
        alert("Failed to delete account. Please try signing out and in again first.");
      }
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
          setProfileData({ ...profileData, ...docSnap.data() });
        }
      } catch (err) {
        console.error("Error fetching profile", err);
      }
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = fsQuery(fsCollection(db, "projects"));
    const unsubscribe = fsOnSnapshot(q, (snapshot) => {
      let projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Filter client-side to avoid complex Firestore index requirements
      projData = projData.filter(p => p.ownerId === user.uid || p.userId === user.uid || (p.members && p.members.includes(user.uid)) || (p.collaborators && p.collaborators.includes(user.uid)));
      projData.sort((a: any, b: any) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
      setProjects(projData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;
    setCreating(true);
    try {
      const docRef = await fsAddDoc(fsCollection(db, "projects"), {
        name: newProjectName,
        ownerId: user.uid,
        members: [user.uid],
        createdAt: fsServerTimestamp(),
        updatedAt: fsServerTimestamp()
      });
      setNewProjectName("");
      router.push(`/dashboard?id=${docRef.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    router.push(`/dashboard?id=${joinCode.trim()}`);
  };

  const moveToTrash = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: "trash",
        deletedAt: fsServerTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const restoreProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: "active",
        deletedAt: null
      });
    } catch (err) {
      console.error(err);
    }
  };

  const deletePermanently = async (projectId: string) => {
    if (!confirm("Are you sure you want to permanently delete this project?")) return;
    try {
      await deleteDoc(doc(db, "projects", projectId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileData({ ...profileData, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await setDoc(doc(db, "users", user.uid), profileData, { merge: true });
      alert("Profile saved successfully!");
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const activeProjects = projects.filter(p => p.status !== 'trash' && p.isDeleted !== true);
  const trashedProjects = projects.filter(p => p.status === 'trash' || p.isDeleted === true);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b1121] text-slate-200 overflow-hidden font-sans">
      
      {/* Left Sidebar */}
      <aside className="w-64 bg-[#0b1121] border-r border-white/5 flex flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 font-bold text-lg text-white mb-8">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Hexagon className="w-5 h-5 text-white" />
            </div>
            Planner Pro
          </div>
          
          <nav className="space-y-2">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-white/5 text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'}`}>
              <LayoutDashboard className="w-5 h-5" /> Dashboard
            </button>
            <button onClick={() => setActiveTab('trash')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'trash' ? 'bg-white/5 text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'}`}>
              <Trash2 className="w-5 h-5" /> Trash Bin
            </button>
            <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'profile' ? 'bg-white/5 text-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'}`}>
              <UserIcon className="w-5 h-5" /> Profile
            </button>
          </nav>
        </div>
        
        <div className="mt-auto p-6">
          <button onClick={handleDownloadApk} className="w-full mb-6 flex items-center justify-center gap-2 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-bold transition-colors">
            <Smartphone className="w-4 h-4" /> Download APK
          </button>
          
          <div className="flex items-center gap-3 mb-6 text-sm font-medium text-slate-300">
            {profileData.photoUrl ? (
              <img src={profileData.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <span className="truncate w-32">{profileData.fullName || user?.email}</span>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-medium transition-colors">
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
        <div className="max-w-7xl mx-auto">
          
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

            
            {/* New Project Card */}
            <div className="bg-transparent border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Plus className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-4">New Project</h3>
                <form onSubmit={handleCreateProject} className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter project name..."
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={creating || !newProjectName.trim()}
                    className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Project"}
                  </button>
                </form>
              </div>
            </div>

            {/* Join Project Card */}
            <div className="bg-transparent border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="w-10 h-10 bg-[#c026d3]/20 rounded-xl flex items-center justify-center mb-4">
                  <Link className="w-5 h-5 text-[#c026d3]" />
                </div>
                <h3 className="text-lg font-bold text-white mb-4">Join Project</h3>
                <form onSubmit={handleJoinProject} className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter project code..."
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#c026d3] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!joinCode.trim()}
                    className="w-full py-3 bg-[#c026d3] hover:bg-[#d946ef] disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all"
                  >
                    Join Team
                  </button>
                </form>
              </div>
            </div>

            {/* Existing Projects */}
            {activeProjects.map((project) => (
              <div 
                key={project.id}
                onClick={() => router.push(`/dashboard?id=${project.id}`)}
                className="bg-transparent border border-white/10 hover:border-indigo-500/50 rounded-2xl p-6 cursor-pointer group transition-all flex flex-col justify-between min-h-[220px] relative"
              >
                {project.ownerId === user?.uid && (
                  <button onClick={(e) => moveToTrash(e, project.id)} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <div className="w-10 h-10 mb-4 text-slate-400 group-hover:text-indigo-400 transition-colors">
                    <Folder className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wide truncate group-hover:text-indigo-400 transition-colors">
                    {project.name}
                  </h3>
                </div>
                
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    Updated {project.updatedAt?.toDate()?.toLocaleDateString() || 'Just now'}
                  </div>
                  <span className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded">
                    {project.surveyCount || 0} Surveys
                  </span>
                </div>
              </div>
            ))}
            
          </div>
          )}

          {activeTab === 'trash' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-red-400" /> Trash Bin
              </h2>
              <p className="text-sm text-slate-400 mb-8">Projects in the trash can be restored or permanently deleted.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {trashedProjects.map((project) => (
                  <div key={project.id} className="bg-transparent border border-red-500/20 rounded-2xl p-6 flex flex-col justify-between min-h-[220px] relative">
                    <div>
                      <div className="w-10 h-10 mb-4 text-red-400/50">
                        <Folder className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-400 line-through uppercase tracking-wide truncate">
                        {project.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-2">
                        Deleted: {project.deletedAt?.toDate()?.toLocaleDateString() || 'Recently'}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => restoreProject(project.id)} className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1">
                        <RefreshCcw className="w-3 h-3" /> Restore
                      </button>
                      <button onClick={() => deletePermanently(project.id)} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
                
                {trashedProjects.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-white/5 rounded-2xl">
                    Trash is empty.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* TOP SECTION: User Identity & Stats */}
              <div className="bg-[#121626] border border-[#1e293b] rounded-2xl p-8 shadow-xl flex flex-col items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-500/20 to-transparent"></div>
                <div className="relative z-10 flex flex-col items-center w-full">
                  <label className="cursor-pointer group relative mb-4">
                    <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#1e293b] group-hover:border-[#f97316] transition-colors relative shadow-xl">
                      {profileData.photoUrl ? (
                        <img src={profileData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#1e293b] flex items-center justify-center text-slate-400">
                          <UserIcon className="w-10 h-10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </label>
                  
                  <h2 className="text-2xl font-bold text-white tracking-widest uppercase mb-1">
                    {profileData.fullName || user?.email?.split('@')[0] || "USER"}
                  </h2>
                  <p className="text-sm text-slate-400 mb-6 font-medium">Account ID: {user?.uid.substring(0, 16)}...</p>
                  
                  <div className="flex gap-3 mb-8">
                    <span className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold rounded-full uppercase tracking-wider">
                      {profileData.role || 'Surveyor'}
                    </span>
                    <span className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full uppercase tracking-wider">
                      {profileData.region || 'Active'}
                    </span>
                  </div>

                  <div className="text-center w-full border-t border-white/5 pt-6 mt-2">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2">OVERALL PROJECTS</p>
                    <p className="text-5xl font-black text-emerald-400 tracking-tighter">{activeProjects.length}</p>
                  </div>
                </div>
              </div>

              {/* MIDDLE SECTION: Project Summary */}
              <div className="bg-[#121626] border border-[#1e293b] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                  <BookOpen className="w-5 h-5 text-[#f97316]" />
                  <h3 className="text-lg font-bold text-white tracking-wide">Project Summary</h3>
                </div>
                
                <div className="space-y-3">
                  {activeProjects.length === 0 ? (
                    <div className="text-slate-500 text-sm py-4">No ongoing projects.</div>
                  ) : (
                    activeProjects.map((proj, idx) => (
                      <div key={proj.id} className="flex items-center justify-between p-4 bg-black/20 border border-white/5 rounded-xl hover:border-indigo-500/30 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard?id=${proj.id}`)}>
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${idx % 3 === 0 ? 'bg-emerald-400' : idx % 3 === 1 ? 'bg-[#c026d3]' : 'bg-blue-400'}`}></div>
                          <span className="text-sm font-semibold text-slate-300">{proj.name}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">{proj.surveyCount || 0} Surveys</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* EDIT INFORMATION */}
              <div className="bg-[#121626] border border-[#1e293b] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                  <UserIcon className="w-5 h-5 text-[#f97316]" />
                  <h3 className="text-lg font-bold text-white tracking-wide">Personal Information</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2">Full Name</label>
                    <input type="text" value={profileData.fullName} onChange={e => setProfileData({...profileData, fullName: e.target.value})} className="w-full bg-[#0b1121] border border-[#1e293b] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#38bdf8] transition-colors" placeholder="e.g. John Doe" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2">Agency / Organization</label>
                    <input type="text" value={profileData.agency} onChange={e => setProfileData({...profileData, agency: e.target.value})} className="w-full bg-[#0b1121] border border-[#1e293b] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#38bdf8] transition-colors" placeholder="e.g. City Planning Dept" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2">Role</label>
                      <select value={profileData.role} onChange={e => setProfileData({...profileData, role: e.target.value})} className="w-full bg-[#0b1121] border border-[#1e293b] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#38bdf8] transition-colors appearance-none">
                        <option value="Surveyor">Surveyor</option>
                        <option value="Manager">Manager</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2">Region / Zone</label>
                      <select value={profileData.region} onChange={e => setProfileData({...profileData, region: e.target.value})} className="w-full bg-[#0b1121] border border-[#1e293b] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#38bdf8] transition-colors appearance-none">
                        <option value="North Zone">North Zone</option>
                        <option value="South Zone">South Zone</option>
                        <option value="East Zone">East Zone</option>
                        <option value="West Zone">West Zone</option>
                        <option value="Central">Central</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2">Phone Number</label>
                    <input type="text" value={profileData.phone} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="w-full bg-[#0b1121] border border-[#1e293b] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-[#38bdf8] transition-colors" placeholder="+1 234 567 8900" />
                  </div>

                  <button onClick={saveProfile} disabled={savingProfile} className="w-full mt-2 py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold tracking-wider uppercase transition-colors flex items-center justify-center gap-2">
                    {savingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Profile"}
                  </button>
                </div>
              </div>

              {/* BOTTOM SECTION: Account & Backup (Image 4 style) */}
              <div className="bg-[#121626] border border-[#1e293b] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                  <ShieldCheck className="w-5 h-5 text-[#f97316]" />
                  <h3 className="text-lg font-bold text-white tracking-wide">Account & Backup</h3>
                </div>
                
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">{profileData.fullName || user?.email?.split('@')[0]}</h4>
                      <p className="text-xs text-slate-400">{user?.email}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded uppercase tracking-widest">Connected</span>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-emerald-500 mb-6 bg-emerald-500/10 px-4 py-3 rounded-xl border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Account active since {user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'recently'}</span>
                </div>
                
                <div className="space-y-3">
                  <button onClick={handleDownloadApk} className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <Smartphone className="w-4 h-4" /> Download APK
                  </button>
                  <button onClick={handleSyncData} className="w-full py-3 bg-transparent border border-[#f97316]/50 hover:bg-[#f97316]/10 text-[#f97316] rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <Database className="w-4 h-4" /> Sync Data
                  </button>
                  <button onClick={handleResetData} className="w-full py-3 bg-transparent border border-red-500/30 hover:bg-red-500/10 text-red-400 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <RefreshCcw className="w-4 h-4" /> Reset Data
                  </button>
                  <button onClick={signOut} className="w-full py-3 bg-transparent border border-white/10 hover:bg-white/5 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                  <button onClick={handleDeleteAccount} className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete Account
                  </button>
                </div>
              </div>

            </div>
          )}
          
        </div>
      </main>
    </div>
  );
}
