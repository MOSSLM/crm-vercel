/**
 * Tout ce qu'il faut savoir sur une entreprise pour l'avoir au téléphone.
 *
 * Une seule route, un seul aller-retour. Le cockpit s'ouvre pendant que le
 * prospect est en ligne : enchaîner sept requêtes en cascade avant d'afficher
 * son numéro et l'historique n'est pas tenable. Les requêtes partent donc en
 * parallèle et chacune échoue de son côté — un audit manquant ne doit pas
 * priver l'écran du reste.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { choisirSiteMontrable, urlPubliqueDuSite } from "@/lib/site-builder/demo-share-url";
import { lienGoogle } from "@/lib/prospects/lien-google";
import { rapportPublicUrl } from "@/lib/audit-site/rapport-url";
import type {
  AppelCockpit,
  CompteRendu,
  ContexteEntreprise,
  LienLeadMagnet,
  NoteCockpit,
  OpportuniteCockpit,
  RdvCockpit,
} from "@/lib/rdv/types";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Statuts d'un rendez-vous qui compte encore — un RDV annulé n'est pas « à venir ». */
const STATUTS_ACTIFS = ["pending", "confirmed"];

/**
 * Les colonnes lues sur `entreprises`. Le `select` est concaténé sur plusieurs
 * lignes, ce qui empêche supabase-js d'inférer la forme du résultat : d'où ce
 * type explicite plutôt qu'un `any` qui laisserait passer une faute de frappe
 * dans un nom de colonne.
 */
type EntrepriseRow = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  telephones: string[] | null;
  email: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  google_url: string | null;
  google_maps_url: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  logo_url: string | null;
  premiers_tags: string | null;
  owner_id: string | null;
};

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const url = new URL(req.url);
  const brut = url.searchParams.get("entreprise_id");
  const entrepriseId = Number(brut);
  if (!brut || !Number.isFinite(entrepriseId)) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }

  const sb = getServiceClient();

  const { data: brute, error: errEntreprise } = await sb
    .from("entreprises")
    .select(
      "id, name, ville, code_postal, adresse, telephone, telephones, email, canonical_url, " +
        "site_web_canonique, google_url, google_maps_url, note_moyenne, nombre_avis, logo_url, " +
        "premiers_tags, owner_id",
    )
    .eq("id", entrepriseId)
    .maybeSingle();

  if (errEntreprise) return jsonError(errEntreprise.message, 500, {}, cors);
  if (!brute) return jsonError("entreprise introuvable", 404, {}, cors);
  const entreprise = brute as unknown as EntrepriseRow;

  const maintenant = new Date().toISOString();

  const [
    rdvAVenirRes,
    rdvPassesRes,
    comptesRendusRes,
    appelsRes,
    opportunitesRes,
    sitesRes,
    auditRes,
    rapportRes,
    leadMagnetsRes,
  ] = await Promise.all([
    sb
      .from("scheduling_bookings")
      .select("id, event_title, start_at, end_at, status, meeting_url, location_text, invitee_name")
      .eq("entreprise_id", entrepriseId)
      .in("status", STATUTS_ACTIFS)
      .gte("start_at", maintenant)
      .order("start_at", { ascending: true })
      .limit(20),
    sb
      .from("scheduling_bookings")
      .select("id, event_title, start_at, end_at, status, meeting_url, location_text, invitee_name")
      .eq("entreprise_id", entrepriseId)
      .lt("start_at", maintenant)
      .order("start_at", { ascending: false })
      .limit(20),
    sb
      .from("rdv_comptes_rendus")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .order("demarre_le", { ascending: false })
      .limit(50),
    sb
      .from("calls")
      .select("id, direction, disposition, started_at, duration_sec")
      .eq("entreprise_id", entrepriseId)
      .order("started_at", { ascending: false })
      .limit(20),
    sb
      .from("opportunites")
      .select("id, name, montant, stage_id, note_base, date_prochain_suivi")
      .eq("entreprise_id", entrepriseId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(10),
    sb
      .from("sites")
      .select("id, published_subdomain, published_domain, is_published, build_stage, is_template, og_shot_url")
      .eq("enterprise_id", entrepriseId),
    sb
      .from("entreprises_audit_site")
      .select("note_globale, note_globale_demo, capture_url")
      .eq("entreprise_id", entrepriseId)
      .maybeSingle(),
    sb
      .from("entreprises_rapport_public")
      .select("token, actif")
      .eq("entreprise_id", entrepriseId)
      .eq("actif", true)
      .maybeSingle(),
    sb
      .from("lead_magnet_projects")
      .select("id, statut, entreprise_id, lead_magnet_pages ( id, page_name, slug, is_active )")
      .eq("entreprise_id", entrepriseId)
      .limit(10),
  ]);

  // Les notes sont rattachées aux opportunités, pas à l'entreprise : on ne peut
  // les chercher qu'une fois les opportunités connues.
  const opportunites = (opportunitesRes.data ?? []) as OpportuniteCockpit[];
  const notesRes = opportunites.length
    ? await sb
        .from("notes")
        .select("id, theme, contenu, created_at")
        .in(
          "opportunite_id",
          opportunites.map((o) => o.id),
        )
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] as NoteCockpit[] };

  const comptesRendus = (comptesRendusRes.data ?? []) as CompteRendu[];
  const bookingsCouverts = new Set(
    comptesRendus.map((cr) => cr.booking_id).filter((id): id is string => Boolean(id)),
  );

  const versRdv = (rows: unknown[]): RdvCockpit[] =>
    (rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      event_title: String(r.event_title ?? "Rendez-vous"),
      start_at: String(r.start_at),
      end_at: String(r.end_at),
      status: String(r.status ?? ""),
      meeting_url: (r.meeting_url as string | null) ?? null,
      location_text: (r.location_text as string | null) ?? null,
      invitee_name: (r.invitee_name as string | null) ?? null,
      a_un_compte_rendu: bookingsCouverts.has(String(r.id)),
    }));

  const site = choisirSiteMontrable(sitesRes.data ?? []);
  const audit = auditRes.data;
  const token = rapportRes.data?.token;

  const leadMagnets: LienLeadMagnet[] = [];
  for (const projet of leadMagnetsRes.data ?? []) {
    const pages = (projet as { lead_magnet_pages?: Array<Record<string, unknown>> }).lead_magnet_pages ?? [];
    for (const page of pages) {
      if (page.is_active === false) continue;
      leadMagnets.push({
        id: String(page.id),
        titre: String(page.page_name ?? page.slug ?? "Page"),
        // Les pages de lead magnet sont servies par le site du prospect ; sans
        // site montrable, on connaît la page mais aucune URL n'est ouvrable.
        url: site && page.slug ? `${urlPubliqueDuSite(site)}/${String(page.slug).replace(/^\//, "")}` : null,
        statut: (projet as { statut?: string | null }).statut ?? null,
      });
    }
  }

  const contexte: ContexteEntreprise = {
    entreprise: {
      id: entreprise.id,
      name: entreprise.name,
      ville: entreprise.ville,
      code_postal: entreprise.code_postal,
      adresse: entreprise.adresse,
      telephone: entreprise.telephone,
      telephones: entreprise.telephones ?? [],
      email: entreprise.email,
      site_web: entreprise.canonical_url ?? entreprise.site_web_canonique ?? null,
      google_url: entreprise.google_url,
      note_moyenne: entreprise.note_moyenne,
      nombre_avis: entreprise.nombre_avis,
      logo_url: entreprise.logo_url,
      premiers_tags: entreprise.premiers_tags,
      owner_id: entreprise.owner_id,
    },
    rdvAVenir: versRdv(rdvAVenirRes.data ?? []),
    rdvPasses: versRdv(rdvPassesRes.data ?? []),
    comptesRendus,
    appels: (appelsRes.data ?? []) as AppelCockpit[],
    notes: (notesRes.data ?? []) as NoteCockpit[],
    opportunites,
    liens: {
      google: lienGoogle(entreprise),
      siteActuel: entreprise.canonical_url ?? entreprise.site_web_canonique ?? null,
      siteDemo: site ? urlPubliqueDuSite(site) : null,
      captureDemo: site?.og_shot_url ?? null,
      audit: token ? rapportPublicUrl(token) : null,
      noteAudit: audit?.note_globale ?? null,
      noteAuditDemo: audit?.note_globale_demo ?? null,
      leadMagnets,
    },
  };

  return json(contexte, { headers: cors });
});
