"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Plus, Folder, Map, LogOut, LayoutDashboard, Trash2, User as UserIcon, Hexagon } from "lucide-react";

interface Project {
  id: string;
  name: string;
  createdAt: any;
  userId: string;
}

export default function ProjectsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, "projects"), where("userId", "==", user.uid));
        const snapshot = await getDocs(q);
        const fetchedProjects: Project[] = [];
        snapshot.forEach((doc) => {
          fetchedProjects.push({ id: doc.id, ...doc.data() } as Project);
        });
        setProjects(fetchedProjects.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
      } catch (error) {
        console.error("Error fetching projects:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;
    
    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, "projects"), {
        name: newProjectName.trim(),
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      router.push(`/dashboard/${docRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      setIsCreating(false);
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
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-[#0b1121] border border-slate-700/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 mb-4 transition-colors"
                  required
                />
                
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="mt-auto bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex justify-center items-center shadow-lg shadow-indigo-600/20"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create & Open Map"}
                </button>
              </form>
            </div>

            {/* Existing Projects */}
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/${project.id}`)}
                className="bg-[#111827] border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all flex flex-col items-start text-left group min-h-[220px]"
              >
                <div className="flex justify-between items-start w-full mb-4">
                  <div className="w-12 h-12 bg-[#0b1121] border border-slate-800 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:border-indigo-500/30 transition-all">
                    <Folder className="w-6 h-6 text-indigo-400" />
                  </div>
                </div>
                <h3 className="font-semibold text-xl mb-2 text-white line-clamp-1 w-full">{project.name}</h3>
                <p className="text-sm text-slate-500 mt-auto flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Created {project.createdAt ? new Date(project.createdAt.toMillis()).toLocaleDateString() : 'Just now'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
