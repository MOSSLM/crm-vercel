import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Fiche complète d'une entreprise pour le poste de travail Démarchage :
 * l'en-tête (nom, effectif, CA, résultat, adresse, contacts) et le cadre
 * RDV/site démo.
 *
 * Ne passe PAS par `/api/donnees-publiques/fiche` : cette route est gardée
 * par la capacité déléguée `marketing_pipeline`, qu'un agent de démarchage
 * n'a pas forcément reçue — et cette page doit rester l'outil quotidien de
 * TOUS les agents, capacité ou non. On lit directement
 * `entreprises_donnees_publiques` avec le client de service, comme
 * `/api/agent/history` le fait déjà pour l'historique.
 */
export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const url = new URL(req.url);
  const entrepriseIdRaw = url.searchParams.get("entreprise_id");
  const entrepriseId = entrepriseIdRaw ? Number(entrepriseIdRaw) : NaN;
  if (!entrepriseIdRaw || !Number.isFinite(entrepriseId)) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }

  const sc = getServiceClient();

  const { data: entreprise, error: entErr } = await sc
    .from("entreprises")
    .select("id, name, ville, code_postal, adresse, telephone, email, site_web_canonique, siret, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entErr) return jsonError(entErr.message, 500, {}, cors);
  if (!entreprise) return jsonError("introuvable", 404, {}, cors);

  // Garde de propriété : sa propre entreprise, ou une entreprise encore dans
  // le pool commun (owner_id nul) — même règle que `/api/agent/history`.
  if (entreprise.owner_id && entreprise.owner_id !== user.id) {
    return jsonError("forbidden", 403, {}, cors);
  }

  const [donneesRes, contactsRes, sitesRes, bookingRes] = await Promise.all([
    sc
      .from("entreprises_donnees_publiques")
      .select(
        "entreprise_id, denomination, date_creation, etat_administratif, naf_code, categorie_entreprise, " +
          "tranche_effectif_code, tranche_effectif_annee, chiffre_affaires, resultat_net, exercice_annee, dirigeants",
      )
      .eq("entreprise_id", entrepriseId)
      .maybeSingle(),
    sc
      .from("contacts")
      .select("id, first_name, last_name, email, tel, role_title, is_decision_maker, linkedin_url")
      .eq("entreprise_id", entrepriseId)
      .order("is_decision_maker", { ascending: false }),
    sc
      .from("sites")
      .select("id, name, published_subdomain, published_domain, is_published, build_stage, paywall_enabled")
      .eq("enterprise_id", entrepriseId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sc
      .from("scheduling_bookings")
      .select("id, event_title, start_at, end_at, status, invitee_name")
      .eq("entreprise_id", entrepriseId)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (donneesRes.error) return jsonError(donneesRes.error.message, 500, {}, cors);
  if (contactsRes.error) return jsonError(contactsRes.error.message, 500, {}, cors);
  if (sitesRes.error) return jsonError(sitesRes.error.message, 500, {}, cors);
  if (bookingRes.error) return jsonError(bookingRes.error.message, 500, {}, cors);

  return json(
    {
      entreprise,
      donneesPubliques: donneesRes.data ?? null,
      contacts: contactsRes.data ?? [],
      site: sitesRes.data ?? null,
      upcomingBooking: bookingRes.data ?? null,
    },
    { headers: cors },
  );
});
