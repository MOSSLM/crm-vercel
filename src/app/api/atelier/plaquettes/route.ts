/**
 * POST /api/atelier/plaquettes — préparer les plaquettes d'un lot.
 *
 * ── POURQUOI CETTE ROUTE EXISTE ALORS QUE L'AGENT A LA SIENNE ────────────
 * `/api/agent/marketing-pipeline/plaquette` fait déjà ce travail, mais elle est
 * déclarée `role: "freelance"` — et `requireRole` teste l'ÉGALITÉ stricte du
 * rôle, pas une hiérarchie. Un admin y reçoit donc 403, malgré le principe posé
 * dans `require-capability` selon lequel « un admin les a toutes, toujours » :
 * le contrôle de rôle passe avant celui de capacité, et le refuse d'abord.
 *
 * Préparer des plaquettes en lot était donc, en pratique, inaccessible au
 * propriétaire du CRM.
 *
 * ── ON NE DUPLIQUE RIEN ──────────────────────────────────────────────────
 * Le travail lui-même reste `assurerJetonsPlaquette`, la MÊME fonction que la
 * route agent appelle. Ce fichier n'ajoute qu'une chose : résoudre la
 * population depuis un lot, côté serveur, pour qu'aucun identifiant n'ait à
 * voyager. C'est ce qui rend le geste possible depuis un téléphone.
 *
 * ── CE QUE ÇA NE FAIT PAS, ET IL FAUT LE SAVOIR ──────────────────────────
 * Ça prépare le LIEN, pas le PDF. Le PDF passe par Puppeteer et reste local
 * (`scripts/prospection/plaquettes-pdf.ts`) — Chromium ne tient pas dans une
 * fonction Vercel. Ce n'est pas une limitation gênante pour l'usage courant :
 * un envoi WhatsApp partage l'URL, qui relit les prix du jour à chaque
 * ouverture, alors que le PDF est une photo qui se périme.
 */

import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { assurerJetonsPlaquette } from "@/lib/audit/plaquette";
import { MESSAGE_MIGRATION_PLAQUETTE, fonctionPlaquetteAbsente } from "@/lib/audit/plaquette-lien";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** Même plafond que la route agent : au-delà, c'est une vague, pas un geste. */
const PLAFOND = 300;

const bodySchema = z.object({ lotId: z.coerce.number().int().positive() });
type Body = z.infer<typeof bodySchema>;

export const POST = withAuth<Body>(
  { role: "admin", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    // Les entreprises du lot qui n'ont PAS encore de jeton. Prendre les
    // premières du lot ferait retomber sur les mêmes à chaque appel, puisque
    // `assurerJetonsPlaquette` est idempotente : le deuxième clic ne
    // préparerait rien.
    const { data, error } = await sc.rpc("entreprises_sans_plaquette", {
      p_lot_id: body.lotId,
      p_limite: PLAFOND,
    });

    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return jsonError("sql/20260826_lot_sans_plaquette.sql n'est pas appliquée", 503, { code: "migration" }, cors);
      }
      return jsonError(error.message, 500, {}, cors);
    }

    const lignes = (data ?? []) as { entreprise_id: number | string; restantes: number | string }[];
    if (lignes.length === 0) {
      // Ce n'est pas une erreur : c'est un lot dont toutes les plaquettes sont
      // déjà prêtes, et l'écran doit pouvoir le dire.
      return json({ preparees: 0, deja: 0, restantes: 0, terminees: true }, { headers: cors });
    }

    const ids = lignes.map((l) => Number(l.entreprise_id));
    const restantes = Number(lignes[0].restantes ?? ids.length);

    const { jetons, erreur } = await assurerJetonsPlaquette(sc, ids, user.id);
    if (erreur) {
      if (fonctionPlaquetteAbsente(erreur)) {
        return jsonError(MESSAGE_MIGRATION_PLAQUETTE, 503, { code: "migration" }, cors);
      }
      return jsonError(erreur.message, 500, {}, cors);
    }

    // `dejaPrete` ne devrait jamais être vrai ici — on a justement demandé
    // celles qui n'avaient pas de jeton. On le compte quand même : si ça
    // arrive, c'est que deux appels se sont croisés, et mieux vaut le voir.
    const deja = jetons.filter((j) => j.dejaPrete).length;

    return json(
      {
        preparees: jetons.length - deja,
        deja,
        // Ce qui restera à faire après cet appel.
        restantes: Math.max(0, restantes - jetons.length),
        terminees: restantes <= jetons.length,
      },
      { headers: cors },
    );
  },
);
