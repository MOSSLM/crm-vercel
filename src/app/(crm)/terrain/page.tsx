"use client";

/**
 * Le terrain — le démarchage du jour, pour l'admin.
 *
 * ── POURQUOI UNE SECONDE PORTE SUR LE MÊME ÉCRAN ─────────────────────────
 * L'écran de démarchage est celui de l'espace agent, et il y était enfermé :
 * `espace-agent/layout.tsx` renvoie un admin vers `/dashboard`, et les routes
 * `/api/agent/*` lui répondaient 403. Le propriétaire du CRM ne pouvait donc
 * pas travailler sa propre file — alors que c'est lui qui démarche le plus.
 *
 * Le composant est le MÊME (aucune copie), la coque change : ici celle de
 * l'admin, avec son rail, sa recherche et sa barre du bas.
 *
 * ── CE QUE « TERRAIN » NE DOIT PAS DEVENIR ───────────────────────────────
 * Ce n'est pas une vue d'équipe. L'écran ne lit que le périmètre du compte
 * connecté : un admin y voit SA file, ses relances, ses tâches du jour. Ce que
 * font les agents se regarde dans `/equipe`, qui ne permet, elle, aucun geste.
 * Mêler les deux ferait un écran où l'on ne sait plus au nom de qui on agit.
 *
 * Le nom évite « Démarchage », déjà pris par `/qualification` dans le menu de
 * l'admin — qui est un autre travail : trier des fiches, pas contacter des gens.
 */

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { EcranDemarchage } from "@/components/agent-portal/demarchage/EcranDemarchage";

export default function TerrainRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <EcranDemarchage />
      </RequireAuth>
    </AppLayout>
  );
}
