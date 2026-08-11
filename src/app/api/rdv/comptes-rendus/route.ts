/**
 * Comptes rendus de rendez-vous : liste et création.
 *
 * La création est volontairement permissive — un compte rendu naît en plein
 * appel, quand la seule chose qu'on sait est de quelle entreprise il s'agit.
 * Tout le reste se remplit ensuite par PATCH, au fil de la conversation.
 */

import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const CANAUX = ["appel", "rdv", "visio", "terrain", "autre"] as const;
const ISSUES = [
  "interesse",
  "a_relancer",
  "reflexion",
  "pas_interesse",
  "injoignable",
  "vendu",
] as const;

/** Champs communs à la création et à la mise à jour. */
export const champsCompteRendu = {
  form_id: z.string().uuid().nullish(),
  booking_id: z.string().uuid().nullish(),
  opportunite_id: z.string().uuid().nullish(),
  contact_id: z.string().uuid().nullish(),
  call_id: z.string().uuid().nullish(),
  canal: z.enum(CANAUX).optional(),
  statut: z.enum(["brouillon", "termine"]).optional(),
  issue: z.enum(ISSUES).nullish(),
  titre: z.string().max(300).nullish(),
  reponses: z.record(z.string(), z.unknown()).optional(),
  resume: z.string().nullish(),
  prochaine_etape: z.string().nullish(),
  date_prochaine_etape: z.string().nullish(),
};

const creationSchema = z.object({
  entreprise_id: z.number().int().positive(),
  ...champsCompteRendu,
});

const SELECT_LISTE = `
  id, entreprise_id, auteur_id, form_id, booking_id, opportunite_id, contact_id, call_id,
  canal, statut, issue, titre, reponses, resume, prochaine_etape, date_prochaine_etape,
  demarre_le, termine_le, created_at, updated_at,
  entreprises:entreprise_id ( name, ville )
`;

/**
 * GET /api/rdv/comptes-rendus
 *   ?entreprise_id=  l'historique d'une entreprise (le cockpit)
 *   ?statut=         brouillon | termine
 *   ?mine=1          seulement les miens (la page « Mes RDV »)
 *   ?limit=          défaut 50, plafonné à 200
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors, user }) => {
  const url = new URL(req.url);
  const entrepriseId = url.searchParams.get("entreprise_id");
  const statut = url.searchParams.get("statut");
  const mine = url.searchParams.get("mine");
  const limite = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  let query = getServiceClient()
    .from("rdv_comptes_rendus")
    .select(SELECT_LISTE)
    .order("demarre_le", { ascending: false })
    .limit(limite);

  if (entrepriseId) {
    const id = Number(entrepriseId);
    if (!Number.isFinite(id)) return jsonError("entreprise_id invalide", 400, {}, cors);
    query = query.eq("entreprise_id", id);
  }
  if (statut) query = query.eq("statut", statut);
  if (mine === "1") query = query.eq("auteur_id", user.id);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data ?? [], { headers: cors });
});

/**
 * POST /api/rdv/comptes-rendus
 *
 * Rouvre le brouillon existant plutôt que d'en créer un second quand le
 * compte rendu part d'un rendez-vous déjà couvert : deux comptes rendus pour
 * un même RDV n'ont pas de sens, et l'index unique le refuserait de toute
 * façon — autant renvoyer celui qui existe.
 */
export const POST = withAuth({ role: "admin", body: creationSchema }, async ({ body, cors, user }) => {
  const sb = getServiceClient();

  if (body.booking_id) {
    const { data: existant } = await sb
      .from("rdv_comptes_rendus")
      .select("*")
      .eq("booking_id", body.booking_id)
      .maybeSingle();
    if (existant) return json(existant, { headers: cors });
  }

  const { data, error } = await sb
    .from("rdv_comptes_rendus")
    .insert({
      entreprise_id: body.entreprise_id,
      auteur_id: user.id,
      form_id: body.form_id ?? null,
      booking_id: body.booking_id ?? null,
      opportunite_id: body.opportunite_id ?? null,
      contact_id: body.contact_id ?? null,
      call_id: body.call_id ?? null,
      canal: body.canal ?? "appel",
      statut: body.statut ?? "brouillon",
      issue: body.issue ?? null,
      titre: body.titre ?? null,
      reponses: body.reponses ?? {},
      resume: body.resume ?? null,
      prochaine_etape: body.prochaine_etape ?? null,
      date_prochaine_etape: body.date_prochaine_etape || null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 201, headers: cors });
});
