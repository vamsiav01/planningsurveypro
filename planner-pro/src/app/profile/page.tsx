"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2, LayoutDashboard, Trash2, User as UserIcon, Hexagon, LogOut, Mail, Clock, Key, Shield, CheckCircle2 } from "lucide-react";

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

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
            
            <h3 className="text-lg font-bold text-white tracking-widest uppercase z-10">{user?.email?.split('@')[0]}</h3>
            <p className="text-slate-400 text-xs mt-1 z-10 flex items-center gap-2 font-mono">
              Account ID: {user?.uid.substring(0, 10)}...
            </p>

            <div className="flex gap-2 mt-4 z-10">
              <span className="bg-orange-500/20 text-orange-400 border border-orange-500/20 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Active
              </span>
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Pro Member
              </span>
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
                onClick={() => alert("Password reset emails are managed by Firebase Authentication.")}
                className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-orange-500/5 text-orange-400 border border-orange-500/30 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <Key className="w-4 h-4" /> Reset Password
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
