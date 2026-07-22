import React from "react";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { AppDataProvider } from "@/components/AppDataContext";
import { CallProvider } from "@/components/telephony/CallProvider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <CallProvider>{children}</CallProvider>
          <Toaster richColors closeButton />
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
