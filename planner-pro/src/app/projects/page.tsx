"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Plus, Folder, Map, LogOut } from "lucide-react";

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <header className="flex justify-between items-center mb-12 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Map className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Planning Survey Pro</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-slate-400">{user?.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </header>

        <main>
          <h2 className="text-3xl font-semibold mb-8">Your Projects</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Create New Project Card */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800 transition-all flex flex-col justify-center min-h-[200px]">
              <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
                <h3 className="font-medium text-lg text-indigo-400 flex items-center gap-2">
                  <Plus className="w-5 h-5" /> New Project
                </h3>
                <input
                  type="text"
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex justify-center items-center h-10"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create & Open"}
                </button>
              </form>
            </div>

            {/* Existing Projects */}
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/${project.id}`)}
                className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all flex flex-col items-start text-left group min-h-[200px]"
              >
                <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Folder className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-white line-clamp-1 w-full">{project.name}</h3>
                <p className="text-xs text-slate-500 mt-auto">
                  Created: {project.createdAt ? new Date(project.createdAt.toMillis()).toLocaleDateString() : 'Just now'}
                </p>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
