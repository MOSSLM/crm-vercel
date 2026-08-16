import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import {
  COMPANY_SELECT,
  COMPTEURS_VIDES,
  type CompteursEntreprises,
} from "@/lib/entreprises/colonnes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/entreprises/perimetre
 *
 * Ce que `AppDataContext` charge au démarrage, à la place du corpus entier.
 *
 * Avant : le navigateur appelait `companiesApi.getAll()`, une boucle qui
 * paginait les ~61 000 lignes de `entreprises` par tranches de 500 — 122
 * allers-retours et ~100 Mo de JSON avant que le moindre écran s'affiche. Et
 * comme `AppDataProvider` est monté à la racine du groupe `(crm)`, c'était le
 * prix d'entrée de /dashboard, /pipeline, /settings, de tout.
 *
 * Or le CRM n'exploite réellement que ~1 100 de ces fiches : celles qui sont
 * qualifiées, archivées, rattachées à un réseau, attribuées à un agent, ou qui
 * portent une opportunité ou un contact. Le reste est un corpus de prospection
 * qui ne sert qu'à trois choses — la file de qualification, le compteur de
 * stock, la carte — et aucune des trois n'a besoin des fiches en mémoire.
 *
 * Le périmètre est défini une seule fois, en base, par
 * `v_entreprises_perimetre_actif` (cf. sql/20260820_perf_60k_entreprises.sql).
 *
 * `compteurs` accompagne la liste : ce sont les chiffres de stock (à qualifier,
 * qualifiées, masquées, archivées, total) que les écrans obtenaient jusqu'ici en
 * filtrant les 60 000 objets en JS, plusieurs fois par rendu.
 *
 * Auth : `requireStaff` et non `withAuth({ role })` — `requireRole` teste une
 * égalité stricte, donc `role: "freelance"` refuserait un admin. Cette route
 * couvre l'ensemble du parc, elle doit s'ouvrir aux deux rôles internes.
 */
export const GET = withAuth({}, async ({ user, cors }) => {
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

  const sc = getServiceClient();

  const [perimetre, compteurs] = await Promise.all([
    sc
      .from("v_entreprises_perimetre_actif")
      .select(COMPANY_SELECT)
      .order("created_at", { ascending: false }),
    sc.rpc("entreprises_compteurs"),
  ]);

  if (perimetre.error) return jsonError(perimetre.error.message, 500, {}, cors);

  // Les compteurs sont un confort d'affichage : s'ils manquent, la liste reste
  // exploitable et les écrans retombent sur des zéros plutôt que sur un écran
  // d'erreur. La RPC renvoie une table à une ligne.
  const ligne = Array.isArray(compteurs.data) ? compteurs.data[0] : compteurs.data;

  return json(
    {
      entreprises: perimetre.data ?? [],
      compteurs: (ligne as CompteursEntreprises | null) ?? COMPTEURS_VIDES,
    },
    { headers: cors },
  );
});
