"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
      });
    }
  }, []);

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
