import React from "react";
import "@mantine/core/styles.css";
import { ThemeProvider } from "@/components/ThemeContext";
import { MantineThemeProvider } from "@/components/MantineThemeProvider";
import { AuthProvider } from "@/components/AuthContext";
import { AppDataProvider } from "@/components/AppDataContext";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MantineThemeProvider>
        <AuthProvider>
          <AppDataProvider>
            {children}
            <Toaster richColors closeButton />
          </AppDataProvider>
        </AuthProvider>
      </MantineThemeProvider>
    </ThemeProvider>
  );
}
