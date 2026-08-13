import React from "react";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { AppDataProvider } from "@/components/AppDataContext";
import { CelebrationJournee } from "@/components/agent-portal/CelebrationJournee";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          {children}
          {/* Montée ici et pas dans un écran : le commercial passe sa journée
              entre le pipeline, une fiche et la médiathèque. Un compteur
              enterré dans un seul onglet n'existe pas. */}
          <CelebrationJournee />
          <Toaster richColors closeButton />
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
