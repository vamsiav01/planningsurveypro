"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

import { db } from "@/lib/firebase";
import { collection as fsCollection, query as fsQuery, where as fsWhere, onSnapshot as fsOnSnapshot, addDoc as fsAddDoc, serverTimestamp as fsServerTimestamp, or as fsOr } from "firebase/firestore";
import { Loader2, FolderPlus, MapPin, ChevronRight, LogOut } from "lucide-react";

export default function Projects() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const q = fsQuery(fsCollection(db, "projects"));
    const unsubscribe = fsOnSnapshot(q, (snapshot) => {
      let projData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Filter client-side to avoid complex Firestore index requirements
      projData = projData.filter(p => p.ownerId === user.uid || (p.members && p.members.includes(user.uid)));
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
      router.push(`/dashboard/${docRef.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0b1121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1121] text-slate-200">
      <header className="bg-[#111827] border-b border-white/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-indigo-500" />
            <h1 className="text-xl font-semibold text-white">My Projects</h1>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-[#111827] border border-white/5 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-500" /> Create New Project
          </h2>
          <form onSubmit={handleCreateProject} className="flex gap-4">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. Downtown Commercial Survey"
              className="flex-1 bg-[#0f172a] border border-white/5 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Project"}
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div 
              key={project.id}
              onClick={() => router.push(`/dashboard/${project.id}`)}
              className="bg-[#111827] border border-white/5 hover:border-indigo-500/30 rounded-2xl p-6 cursor-pointer group transition-all"
            >
              <h3 className="text-lg font-medium text-white mb-2 group-hover:text-indigo-400 transition-colors">{project.name}</h3>
              <p className="text-sm text-slate-500 mb-6 flex items-center gap-2">
                Last updated: {project.updatedAt?.toDate()?.toLocaleDateString() || 'Just now'}
              </p>
              <div className="flex items-center justify-between text-sm text-indigo-500 font-medium">
                Open Dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
          
          {projects.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-white/5 rounded-2xl">
              No projects yet. Create one above to get started!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
