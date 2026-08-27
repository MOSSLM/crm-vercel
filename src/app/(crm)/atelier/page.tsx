"use client";

/**
 * L'atelier — le poste de commande mobile.
 *
 * Il vit sous `(crm)` comme le reste, donc derrière `AppLayout` : la coque
 * admin, sa barre du bas et ses gardes. Ce n'est pas une application à part,
 * c'est un écran du CRM taillé pour le pouce.
 */

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { Atelier } from "@/components/atelier/Atelier";

export default function AtelierRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <Atelier />
      </RequireAuth>
    </AppLayout>
  );
}
