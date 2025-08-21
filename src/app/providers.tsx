
import React from "react";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { AppDataProvider } from "@/components/AppDataContext";
import { Toaster } from "sonner"; // ✅ on garde un seul Toaster global ici

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          {children}
          <Toaster richColors closeButton />
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
