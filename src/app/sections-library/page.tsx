"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, BookOpen } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import type { ManagedTheme } from "@/types";

export default function SectionsLibraryRedirectPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/themes")
      .then((res) => res.json())
      .then((themes: ManagedTheme[]) => {
        if (!themes || themes.length === 0) {
          setError("Aucun thème disponible. Créez d'abord un thème dans la page Thèmes.");
          return;
        }
        router.replace(`/themes/${themes[0].slug}/sections-library`);
      })
      .catch(() => setError("Erreur lors du chargement des thèmes."));
  }, [router]);

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        {error ? (
          <>
            <BookOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Chargement de la bibliothèque de sections…</p>
          </>
        )}
      </div>
    </AppLayout>
  );
}
