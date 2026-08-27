"use client";

/**
 * L'équipe — réservée à l'admin par la coque (`AppLayout`) ET par la route
 * (`/api/equipe`, `role: "admin"`). Les deux, parce qu'une garde d'écran ne
 * protège rien : elle cache un bouton, elle ne refuse pas une requête.
 */

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { Equipe } from "@/components/equipe/Equipe";

export default function EquipeRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <Equipe />
      </RequireAuth>
    </AppLayout>
  );
}
