/**
 * Un compte rendu : lecture, mise à jour au fil de l'eau, suppression.
 *
 * Le PATCH est appelé en continu pendant l'échange (sauvegarde automatique).
 * Il doit donc être tolérant : on n'envoie que les champs qui ont bougé, et
 * un champ absent du corps n'est jamais écrasé.
 */

import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { champsCompteRendu } from "../route";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const patchSchema = z.object(champsCompteRendu);

type Params = { id: string };

export const GET = withAuth<undefined, Params>({ role: "admin" }, async ({ params, cors }) => {
  const { data, error } = await getServiceClient()
    .from("rdv_comptes_rendus")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500, {}, cors);
  if (!data) return jsonError("introuvable", 404, {}, cors);
  return json(data, { headers: cors });
});

export const PATCH = withAuth<z.infer<typeof patchSchema>, Params>(
  { role: "admin", body: patchSchema },
  async ({ body, params, cors }) => {
    // Seules les clés réellement fournies partent en base : un `undefined`
    // laissé dans l'objet ferait passer la colonne à NULL et effacerait ce que
    // la frappe précédente venait d'enregistrer.
    const maj: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(body)) {
      if (valeur !== undefined) maj[cle] = valeur;
    }

    // Une date vide arrive en chaîne vide depuis un `<input type="date">`, que
    // Postgres refuse pour une colonne `date`.
    if (maj.date_prochaine_etape === "") maj.date_prochaine_etape = null;

    // Clore le compte rendu horodate la clôture ; le rouvrir efface l'horodatage.
    if (maj.statut === "termine") maj.termine_le = new Date().toISOString();
    if (maj.statut === "brouillon") maj.termine_le = null;

    if (Object.keys(maj).length === 0) return jsonError("rien à mettre à jour", 400, {}, cors);

    const { data, error } = await getServiceClient()
      .from("rdv_comptes_rendus")
      .update(maj)
      .eq("id", params.id)
      .select()
      .maybeSingle();

    if (error) return jsonError(error.message, 500, {}, cors);
    if (!data) return jsonError("introuvable", 404, {}, cors);
    return json(data, { headers: cors });
  },
);

export const DELETE = withAuth<undefined, Params>({ role: "admin" }, async ({ params, cors }) => {
  const { error } = await getServiceClient()
    .from("rdv_comptes_rendus")
    .delete()
    .eq("id", params.id);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true }, { headers: cors });
});
