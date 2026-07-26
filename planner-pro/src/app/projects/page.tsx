"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, doc, setDoc } from "firebase/firestore";
import { Loader2, Plus, Folder, Map as MapIcon, LogOut, LayoutDashboard, Trash2, User as UserIcon, Hexagon, Link } from "lucide-react";

interface Project {
  id: string;
  name: string;
  createdAt: any;
  updatedAt?: any;
  userId: string;
  collaborators?: string[];
}

export default function ProjectsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [syncError, setSyncError] = useState("");

  const getMillis = (field: any) => {
    if (!field) return 0;
    if (typeof field.toMillis === 'function') return field.toMillis();
    if (typeof field.seconds === 'number') return field.seconds * 1000;
    return Date.now();
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  const fetchProjects = async () => {
    if (!user) return;
    try {
      const qOwned = query(collection(db, "projects"), where("userId", "==", user.uid));
      const ownedSnap = await getDocs(qOwned);
      const owned = ownedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));

      let shared: Project[] = [];
      if (user.email) {
        const qShared = query(collection(db, "projects"), where("collaborators", "array-contains", user.email));
        const sharedSnap = await getDocs(qShared);
        shared = sharedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      }

      const all = [...owned, ...shared];
      const unique = Array.from(new Map(all.map(item => [item.id, item])).values());

      unique.sort((a, b) => {
        const timeA = a.updatedAt ? getMillis(a.updatedAt) : getMillis(a.createdAt);
        const timeB = b.updatedAt ? getMillis(b.updatedAt) : getMillis(b.createdAt);
        return timeB - timeA;
      });

      setProjects(unique);
      setSyncError("");
    } catch (error: any) {
      console.error("Fetch Error:", error);
      setSyncError("Database Read Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    
    if (!newProjectName.trim() || !user) return;
    
    const projName = newProjectName.trim();
    
    // Check for uniqueness
    const isTaken = projects.some(p => p.name.toLowerCase() === projName.toLowerCase());
    if (isTaken) {
      setCreateError(`Somebody has already taken the title "${projName}". Please choose a unique name.`);
      return;
    }
    
    setIsCreating(true);
    try {
      const now = serverTimestamp();
      
      const newDocRef = doc(collection(db, "projects"));
      
      // Explicitly AWAIT the creation to ensure the cloud accepts it
      await setDoc(newDocRef, {
        name: projName,
        userId: user.uid,
        collaborators: [],
        createdAt: now,
        updatedAt: now,
      });
      
      setNewProjectName("");
      
      // Re-fetch all projects from scratch from the cloud
      await fetchProjects();
      
    } catch (error: any) {
      console.error("Error creating project:", error);
      setSyncError("Creation Error: " + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !user) return;
    setIsJoining(true);
    // Redirect to the project dashboard. The Magic Link logic there will automatically add the user as a collaborator.
    router.push(`/dashboard/${joinCode.trim()}`);
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b1121] text-slate-200 overflow-hidden font-sans">
      {/* LEFT SIDEBAR - HOME SCREEN */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800/50 flex flex-col z-20 shadow-2xl">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-indigo-600 rounded-lg p-1">
            <Hexagon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Planner Pro</h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-600/10 text-indigo-400 font-medium transition-colors">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <Trash2 className="w-5 h-5" /> Trash Bin
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <UserIcon className="w-5 h-5" /> Profile
          </button>
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
      <main className="flex-1 overflow-y-auto p-12">
        <div className="max-w-5xl mx-auto">
          
          {syncError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 shadow-lg">
              <h3 className="font-bold flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Critical Database Error</h3>
              <p className="text-sm mt-1">{syncError}</p>
              <p className="text-xs mt-2 text-red-300">Your Firebase Database is rejecting connections. Your "Test Mode" has likely expired or your Security Rules are blocking access. Please update your Firebase Rules in the console.</p>
            </div>
          )}

          <h2 className="text-3xl font-bold mb-2 text-white">Welcome back</h2>
          <p className="text-slate-400 mb-10">Select an existing project or create a new one to begin surveying.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Create New Project Card */}
            <div className="bg-[#111827]/50 border border-indigo-500/30 rounded-2xl p-6 hover:bg-[#111827] transition-all flex flex-col min-h-[220px] shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
              
              <form onSubmit={handleCreateProject} className="flex flex-col h-full relative z-10">
                <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4">
                  <Plus className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-4">New Project</h3>
                
                <input
                  type="text"
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => {
                    setNewProjectName(e.target.value);
                    if (createError) setCreateError("");
                  }}
                  className={`bg-[#0b1121] border ${createError ? 'border-red-500' : 'border-slate-700/50'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 mb-2 transition-colors`}
                  required
                />
                
                {createError && (
                  <p className="text-red-400 text-xs mb-4 font-medium">{createError}</p>
                )}
                
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="mt-auto bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex justify-center items-center shadow-lg shadow-indigo-600/20"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Project"}
                </button>
              </form>
            </div>

            {/* Join Project Card */}
            <div className="bg-[#111827]/50 border border-purple-500/30 rounded-2xl p-6 hover:bg-[#111827] transition-all flex flex-col min-h-[220px] shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
              
              <form onSubmit={handleJoinProject} className="flex flex-col h-full relative z-10">
                <div className="w-12 h-12 bg-purple-600/20 text-purple-400 rounded-xl flex items-center justify-center mb-4">
                  <Link className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-white mb-4">Join Project</h3>
                
                <input
                  type="text"
                  placeholder="Enter project code..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="bg-[#0b1121] border border-slate-700/50 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-purple-500 mb-4 transition-colors"
                  required
                />
                
                <button 
                  type="submit"
                  disabled={isJoining}
                  className="mt-auto bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex justify-center items-center shadow-lg shadow-purple-600/20"
                >
                  {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : "Join Team"}
                </button>
              </form>
            </div>

            {/* Existing Projects */}
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/${project.id}`)}
                className="bg-[#111827] border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all flex flex-col items-start text-left group min-h-[220px] relative"
              >
                {project.userId !== user?.uid && (
                  <div className="absolute top-4 right-4 bg-purple-500/10 text-purple-400 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-purple-500/20">
                    Shared
                  </div>
                )}
                <div className="flex justify-between items-start w-full mb-4">
                  <div className="w-12 h-12 bg-[#0b1121] border border-slate-800 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:border-indigo-500/30 transition-all">
                    <Folder className="w-6 h-6 text-indigo-400" />
                  </div>
                </div>
                <h3 className="font-semibold text-xl mb-2 text-white line-clamp-1 w-full">{project.name}</h3>
                <p className="text-sm text-slate-500 mt-auto flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {project.updatedAt || project.createdAt 
                    ? `Updated ${new Date(getMillis(project.updatedAt || project.createdAt)).toLocaleDateString()} at ${new Date(getMillis(project.updatedAt || project.createdAt)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` 
                    : 'Just now'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
