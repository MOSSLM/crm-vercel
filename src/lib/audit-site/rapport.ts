import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditContent } from "@/types";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { ensureMinIssueKeys, problemsFromKeys, solutionsFromKeys } from "@/data/auditIssues";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { lireAudit, UNDEFINED_TABLE, type AuditLu } from "./lecture";

/**
 * Rassembler ce qu'affiche le rapport public à partir d'un jeton.
 *
 * LE PARTI PRIS : la page ne dépend PAS d'un document rédigé. Elle rend les
 * mesures, le démo et l'appel à l'action dans tous les cas ; si un `audits`
 * existe et qu'il est prêt, elle rend en plus le deck complet. Sans ça, on ne
 * pourrait envoyer un rapport qu'aux prospects pour lesquels quelqu'un a déjà
 * rédigé six pages — c'est-à-dire à presque aucun, et jamais en démarchage
 * froid.
 *
 * D'où aussi le repli sur `DEFAULT_AUDIT_CONTENT` : la trame par défaut est
 * relue et vendeuse, elle vaut mieux qu'une page amputée.
 */

export interface DonneesRapport {
  entrepriseId: number;
  nomEntreprise: string;
  content: AuditContent;
  audit: AuditLu | null;
  captureActuelle: string | null;
  captureDemo: string | null;
  noteDemo: number | null;
  demoUrl: string | null;
  bookingUrl: string | null;
}

export type ResolutionRapport =
  | { ok: true; donnees: DonneesRapport }
  | { ok: false; raison: "introuvable" | "revoque" | "indisponible" };

type JetonRow = {
  entreprise_id: number;
  actif: boolean;
  site_id: string | null;
};

export async function resoudreRapport(
  sb: SupabaseClient,
  token: string,
): Promise<ResolutionRapport> {
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return { ok: false, raison: "introuvable" };

  const { data, error } = await sb
    .from("entreprises_rapport_public")
    .select("entreprise_id, actif, site_id")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    // Migration non appliquée : on le distingue de « jeton inconnu », sinon on
    // dirait au prospect que son lien est mort alors que c'est notre base.
    return { ok: false, raison: error.code === UNDEFINED_TABLE ? "indisponible" : "introuvable" };
  }
  if (!data) return { ok: false, raison: "introuvable" };

  const jeton = data as JetonRow;
  if (!jeton.actif) return { ok: false, raison: "revoque" };

  const [entRes, auditRes, siteRes] = await Promise.all([
    sb
      .from("entreprises")
      .select("id, name, ville, logo_url, telephone")
      .eq("id", jeton.entreprise_id)
      .maybeSingle(),
    lireAudit(sb, jeton.entreprise_id),
    chargerSite(sb, jeton.entreprise_id, jeton.site_id),
  ]);

  const ent = entRes.data as {
    name: string | null;
    ville: string | null;
    logo_url: string | null;
    telephone: string | null;
  } | null;
  if (!ent) return { ok: false, raison: "introuvable" };

  const audit = auditRes.disponible ? auditRes.audit : null;
  const nomEntreprise = ent.name?.trim() || "Votre entreprise";
  const demoUrl = siteRes ? demoShareUrl(siteRes) : null;

  const content = await chargerContenu(sb, jeton.entreprise_id, {
    nomEntreprise,
    ville: ent.ville,
    demoUrl,
    issueKeys: audit?.issue_keys ?? [],
  });

  return {
    ok: true,
    donnees: {
      entrepriseId: jeton.entreprise_id,
      nomEntreprise,
      content,
      audit,
      captureActuelle: audit?.capture_url ?? null,
      captureDemo: siteRes?.og_shot_url ?? null,
      noteDemo: audit?.note_globale_demo ?? null,
      demoUrl,
      bookingUrl: siteRes?.booking_url ?? null,
    },
  };
}

type SiteRow = {
  id: string;
  published_subdomain: string | null;
  og_shot_url: string | null;
  booking_url: string | null;
};

async function chargerSite(
  sb: SupabaseClient,
  entrepriseId: number,
  siteId: string | null,
): Promise<SiteRow | null> {
  const base = sb.from("sites").select("id, published_subdomain, og_shot_url, booking_url");
  const q = siteId
    ? base.eq("id", siteId).maybeSingle()
    : base.eq("enterprise_id", entrepriseId).order("updated_at", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await q;
  // Colonne `og_shot_url` absente (migration non appliquée) : le rapport se
  // rend sans capture du démo plutôt que pas du tout.
  if (error) return null;
  return (data as SiteRow | null) ?? null;
}

interface ContexteContenu {
  nomEntreprise: string;
  ville: string | null;
  demoUrl: string | null;
  /** Clés RÉELLEMENT mesurées, qui remplacent les problèmes devinés. */
  issueKeys: string[];
}

/**
 * Le document, s'il existe. Sinon la trame par défaut.
 *
 * Dans les deux cas, LES PROBLÈMES AFFICHÉS VIENNENT DE LA MESURE quand on en a
 * une. C'est tout l'objet du chantier : sans ça, le rapport listerait les quatre
 * problèmes par défaut de `DEFAULT_SELECTED_ISSUE_KEYS` — des suppositions
 * raisonnables, mais des suppositions — à côté de notes mesurées. Un prospect
 * dont le formulaire fonctionne très bien repère l'incohérence immédiatement, et
 * c'est toute la crédibilité du rapport qui tombe.
 *
 * `ensureMinIssueKeys` garantit trois cartes minimum : en dessous, la page
 * « Situation » n'a plus de corps.
 */
async function chargerContenu(
  sb: SupabaseClient,
  entrepriseId: number,
  ctx: ContexteContenu,
): Promise<AuditContent> {
  const trame = getDefaultAuditContent({
    entreprise_nom: ctx.nomEntreprise,
    entreprise_ville: ctx.ville ?? undefined,
    demo_url: ctx.demoUrl ?? undefined,
  });

  const { data: opps } = await sb
    .from("opportunites")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .limit(20);

  const ids = ((opps ?? []) as Array<{ id: string }>).map((o) => o.id);
  let content = trame;

  if (ids.length > 0) {
    const { data: audits } = await sb
      .from("audits")
      .select("content, statut, updated_at")
      .in("opportunite_id", ids)
      .order("updated_at", { ascending: false })
      .limit(1);

    const doc = ((audits ?? []) as Array<{ content: AuditContent | null }>)[0];
    if (doc?.content) {
      content = personnaliser(structuredClone(doc.content), ctx);
    }
  }

  return appliquerMesures(content, ctx.issueKeys);
}

function personnaliser(c: AuditContent, ctx: ContexteContenu): AuditContent {
  c.page1 = {
    ...c.page1,
    client_name: ctx.nomEntreprise,
    client_meta: c.page1.client_meta?.trim() || [ctx.ville, "France"].filter(Boolean).join(", "),
    // Le lien démo vient du site RÉEL, pas de l'instantané `audits.demo_site_url`
    // qui peut avoir vieilli depuis la rédaction du document.
    demo_url: ctx.demoUrl ?? c.page1.demo_url ?? "",
  };
  return c;
}

function appliquerMesures(c: AuditContent, issueKeys: string[]): AuditContent {
  if (issueKeys.length === 0) return c;
  const cles = ensureMinIssueKeys(issueKeys);
  c.page2 = { ...c.page2, problems: problemsFromKeys(cles) };
  c.page3 = { ...c.page3, solutions: solutionsFromKeys(cles) };
  return c;
}

/** Incrémente le compteur de vues. Best-effort : jamais bloquant pour la page. */
export async function marquerVu(sb: SupabaseClient, token: string): Promise<void> {
  try {
    await sb.rpc("rapport_public_vu", { p_token: token });
  } catch {
    // La fonction peut ne pas exister (migration non appliquée). Un compteur
    // manquant ne doit pas empêcher un prospect de lire son rapport.
  }
}

/* ── Le jeton de partage, produit au moment où un message en a besoin ────── */

export type JetonRapport = {
  entreprise_id: number;
  token: string;
  actif: boolean;
  vues: number | null;
  vu_le: string | null;
};

/**
 * Le jeton de partage d'une entreprise, créé s'il n'existe pas encore.
 *
 * POURQUOI CETTE FONCTION A QUITTÉ SA ROUTE
 * Elle ne vivait que dans `GET /api/rapport-public/[entrepriseId]`, appelée par
 * le dialogue « Partager le rapport ». Un envoi automatique ne passe jamais par
 * là : le moteur lisait `entreprises_rapport_public`, n'y trouvait rien, et
 * interpolait `{{company.audit_url}}` en chaîne vide. Toutes séquences
 * confondues, cela faisait partir des messages du genre « c'est ici, rien à
 * télécharger : » suivis de rien — et aucun jeton n'existait en base, donc le
 * cas était universel, pas marginal.
 *
 * Le jeton est fabriqué par le `default` SQL (`gen_random_bytes`) : la valeur
 * n'est jamais produite côté application, donc jamais dérivable d'un
 * identifiant d'entreprise.
 */
export async function assurerJetonRapport(
  sb: SupabaseClient,
  entrepriseId: number,
  userId: string | null,
): Promise<{ jeton?: JetonRapport; erreur?: { code?: string; message: string } }> {
  const { data, error } = await sb
    .from("entreprises_rapport_public")
    .select("entreprise_id, token, actif, vues, vu_le")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) return { erreur: error };
  if (data) return { jeton: data as JetonRapport };

  const { data: cree, error: erreurInsert } = await sb
    .from("entreprises_rapport_public")
    .insert({ entreprise_id: entrepriseId, cree_par: userId })
    .select("entreprise_id, token, actif, vues, vu_le")
    .single();

  if (erreurInsert) return { erreur: erreurInsert };
  return { jeton: cree as JetonRapport };
}

/**
 * Cette entreprise a-t-elle de quoi remplir un rapport ?
 *
 * `resoudreRapport` rend une page dans TOUS les cas — c'est voulu, une page
 * amputée vaut mieux qu'une erreur pour un prospect qui a cliqué. Mais sans
 * `entreprises_audit_site`, cette page est la trame par défaut avec le nom de
 * l'entreprise dessus : ni capture, ni score, ni le moindre constat qui la
 * concerne. 192 des 295 entreprises qualifiées sont dans ce cas.
 *
 * Envoyer « voici l'audit de votre site » vers cette page-là est pire que de ne
 * rien envoyer : le prospect voit qu'on ne l'a pas regardé.
 */
export async function aDesMesuresAudit(sb: SupabaseClient, entrepriseId: number): Promise<boolean> {
  try {
    const { count, error } = await sb
      .from("entreprises_audit_site")
      .select("entreprise_id", { count: "exact", head: true })
      .eq("entreprise_id", entrepriseId);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
