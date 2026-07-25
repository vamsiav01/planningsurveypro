"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Map, MapPin, Loader2, Building, ShieldCheck } from "lucide-react";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      // Router push happens in useEffect due to auth state change
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Map Preview/Hero */}
      <div className="hidden lg:flex lg:w-2/3 bg-slate-900 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 z-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 70%, #0ea5e9 0%, transparent 50%)' }}></div>
        <div className="relative z-10 glass-panel p-10 max-w-2xl text-white">
          <div className="flex items-center gap-3 mb-6">
            <Map className="w-12 h-12 text-blue-400" />
            <h1 className="text-4xl font-bold tracking-tight">Survey Pro</h1>
          </div>
          <p className="text-xl text-slate-200 mb-8 leading-relaxed">
            Advanced geographic survey application with real-time collaboration. Automatically detect building footprints, estimate floors, and manage your field data securely.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Building className="w-6 h-6 text-blue-400" />
              <span className="font-medium">Smart Detection</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-indigo-400" />
              <span className="font-medium">Precision Mapping</span>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <span className="font-medium">Secure Backup</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/3 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {isLogin ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-slate-500">
              {isLogin ? "Enter your credentials to access your projects" : "Sign up to start surveying today"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            )}
            
            <div className="input-group">
              <label className="input-label" htmlFor="email">Email address</label>
              <input 
                type="email" 
                id="email"
                required
                className="input-field" 
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="input-group">
              <label className="input-label" htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password"
                required
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full mt-6"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? "Sign In" : "Sign Up")}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
