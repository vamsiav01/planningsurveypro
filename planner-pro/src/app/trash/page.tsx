"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Folder, LayoutDashboard, Trash2, User as UserIcon, Hexagon, LogOut, RefreshCw, AlertTriangle, Download } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface Project {
  id: string;
  name: string;
  createdAt: any;
  updatedAt?: any;
  userId: string;
  isDeleted?: boolean;
  deletedAt?: any;
}

export default function TrashPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const { handleInstallClick } = usePWAInstall();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchTrashProjects = async () => {
    if (!user) return;
    try {
      const qOwned = query(collection(db, "projects"), where("userId", "==", user.uid));
      const ownedSnap = await getDocs(qOwned);
      
      const allOwned = ownedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      
      // Filter only deleted projects
      let deleted = allOwned.filter(p => p.isDeleted === true);
      
      // 30-DAY AUTO-CLEANUP LOGIC
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      const toKeep: Project[] = [];
      
      for (const p of deleted) {
        const deletedTime = p.deletedAt ? getMillis(p.deletedAt) : 0;
        if (deletedTime > 0 && now - deletedTime > THIRTY_DAYS_MS) {
          // Permanently delete if older than 30 days
          await deleteDoc(doc(db, "projects", p.id));
        } else {
          toKeep.push(p);
        }
      }

      toKeep.sort((a, b) => {
        const timeA = a.deletedAt ? getMillis(a.deletedAt) : 0;
        const timeB = b.deletedAt ? getMillis(b.deletedAt) : 0;
        return timeB - timeA;
      });

      setProjects(toKeep);
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
      fetchTrashProjects();
    }
  }, [user]);

  const handleRestore = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "projects", projectId), {
        isDeleted: false,
        updatedAt: serverTimestamp()
      });
      await fetchTrashProjects();
    } catch (error: any) {
      console.error("Error restoring:", error);
      alert("Failed to restore project.");
    }
  };

  const handlePermanentDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (window.confirm("WARNING: This will permanently delete this project and ALL of its surveys. This action cannot be undone. Are you sure?")) {
      try {
        await deleteDoc(doc(db, "projects", projectId));
        await fetchTrashProjects();
      } catch (error: any) {
        console.error("Error deleting:", error);
        alert("Failed to permanently delete project.");
      }
    }
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
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-[#111827] border-r border-slate-800/50 flex flex-col z-20 shadow-2xl">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-indigo-600 rounded-lg p-1">
            <Hexagon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Planning Survey Pro</h1>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-2">
          <button onClick={() => router.push('/projects')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 font-medium transition-colors">
            <Trash2 className="w-5 h-5" /> Trash Bin
          </button>
          <button onClick={() => router.push('/profile')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors">
            <UserIcon className="w-5 h-5" /> Profile
          </button>
          <button 
            onClick={handleInstallClick}
            className="w-full mt-4 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl py-3 px-4 text-sm font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]"
          >
            <Download className="w-4 h-4" /> Install App
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
            </div>
          )}

          <div className="flex items-center gap-4 mb-2">
            <Trash2 className="w-8 h-8 text-red-400" />
            <h2 className="text-3xl font-bold text-white">Trash Bin</h2>
          </div>
          <p className="text-slate-400 mb-10">Items in the trash will be automatically and permanently deleted after 30 days.</p>
          
          {projects.length === 0 ? (
            <div className="bg-[#111827]/50 border border-slate-800/50 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Trash is empty</h3>
              <p className="text-slate-400 max-w-md">No projects have been deleted. Projects you delete from your dashboard will appear here for 30 days.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => {
                const deletedTime = project.deletedAt ? getMillis(project.deletedAt) : 0;
                const daysLeft = 30 - Math.floor((Date.now() - deletedTime) / (1000 * 60 * 60 * 24));
                
                return (
                  <div
                    key={project.id}
                    className="bg-[#111827] border border-red-500/20 rounded-2xl p-6 flex flex-col items-start text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl"></div>
                    
                    <div className="flex justify-between items-center w-full mb-4 mt-2">
                      <div className="w-12 h-12 bg-[#0b1121] border border-slate-800 rounded-xl flex items-center justify-center">
                        <Folder className="w-6 h-6 text-slate-500" />
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ml-auto">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {daysLeft > 0 ? `${daysLeft} days left` : 'Deleting soon'}
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-xl mb-2 text-white line-clamp-1 w-full opacity-70 line-through">{project.name}</h3>
                    
                    <div className="flex gap-2 mt-6 w-full relative z-10">
                      <button 
                        onClick={(e) => handleRestore(e, project.id)}
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl py-2 text-sm font-medium transition-colors flex justify-center items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" /> Restore
                      </button>
                      <button 
                        onClick={(e) => handlePermanentDelete(e, project.id)}
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl py-2 text-sm font-medium transition-colors flex justify-center items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
