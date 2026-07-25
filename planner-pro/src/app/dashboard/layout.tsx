"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, User, LogOut, Settings } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, signOut, updateProfile } = useAuth();
  const router = useRouter();
  const [profileName, setProfileName] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    await updateProfile({
      name: profileName,
      isProfileComplete: true,
    });
    setUpdating(false);
  };

  if (profile && !profile.isProfileComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full animate-fade-in">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <User size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Complete Your Profile</h2>
            <p className="text-slate-500 mt-2">Please provide your name to continue using Survey Pro.</p>
          </div>
          
          <form onSubmit={handleCompleteProfile}>
            <div className="input-group">
              <label className="input-label" htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                required
                className="input-field"
                placeholder="John Doe"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary w-full mt-4"
              disabled={updating || !profileName.trim()}
            >
              {updating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Profile"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-white font-bold">
            SP
          </div>
          <span className="font-semibold text-lg text-slate-800">Survey Pro</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium text-slate-600 hidden sm:block">
            {profile?.name}
          </div>
          <button className="p-2 text-slate-400 hover:text-primary transition-colors rounded-full hover:bg-slate-100">
            <Settings size={20} />
          </button>
          <button 
            onClick={signOut}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
            title="Log out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
}
