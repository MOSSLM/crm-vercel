/**
 * GET /api/donnees-publiques/fiche?entreprise_id=…
 *
 * Le dossier complet d'une entreprise, en un appel : identité publique,
 * qualifications RGE, contacts du CRM. Un seul aller-retour, parce que cette
 * route est appelée à l'ouverture d'une fiche, juste avant un appel — trois
 * requêtes en cascade se verraient.
 *
 * La route ne fait AUCUN jugement : elle rend les faits. Le tri des risques,
 * des accroches et des décideurs est dans `lib/donnees-publiques/fiche.ts`,
 * pur et testé, partagé par toutes les surfaces d'affichage.
 */

import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ capability: "marketing_pipeline" }, async ({ req, cors }) => {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("entreprise_id"));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }

  const sb = getServiceClient();

  const [entreprise, publiques, qualifications, contacts] = await Promise.all([
    sb
      .from("entreprises")
      .select("id, name, ville, code_postal, adresse, telephone, email, site_web_canonique, siret, siren, siret_source, siret_confirme_le")
      .eq("id", id)
      .maybeSingle(),
    sb.from("entreprises_donnees_publiques").select("*").eq("entreprise_id", id).maybeSingle(),
    sb
      .from("entreprise_rge_qualifications")
      .select(
        "id, code_qualification, nom_certificat, domaine, meta_domaine, date_debut, date_fin, url_qualification, siret, retiree_le",
      )
      .eq("entreprise_id", id)
      .is("retiree_le", null)
      // Les plus proches de l'échéance d'abord : c'est l'ordre dans lequel
      // elles intéressent celui qui appelle.
      .order("date_fin", { ascending: true, nullsFirst: false }),
    sb
      .from("contacts")
      .select("id, first_name, last_name, email, tel, role_title, is_decision_maker, notes")
      .eq("entreprise_id", id),
  ]);

  if (entreprise.error) return jsonError("lecture_entreprise", 500, { detail: entreprise.error.message }, cors);
  if (!entreprise.data) return jsonError("entreprise_introuvable", 404, {}, cors);

  return json(
    {
      ok: true,
      entreprise: entreprise.data,
      // `null` et non un objet vide : l'absence d'hydratation est un état
      // distinct de « hydratée mais sans donnée », et l'affichage les traite
      // différemment — l'un propose un bouton, l'autre affiche ce qu'il a.
      publiques: publiques.data ?? null,
      qualifications: qualifications.data ?? [],
      contacts: contacts.data ?? [],
    },
    { headers: cors },
  );
});
