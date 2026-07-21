import React from "react";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { AppDataProvider } from "@/components/AppDataContext";
import { DialerProvider } from "@/components/telephone/DialerProvider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <DialerProvider>{children}</DialerProvider>
          <Toaster richColors closeButton />
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
