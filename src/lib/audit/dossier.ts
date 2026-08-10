import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireAudit } from "@/lib/audit-site/lecture";
import { lireContextePsi } from "@/lib/audit-site/pagespeed";
import type { ConstatGoogle, ContextePsi } from "@/lib/audit-site/types";
import { AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";
import { versOffreAudit, type OffreAudit } from "./offres-audit";
import { nombresDe, type UniversDicible } from "./preparation";

/**
 * Le dossier : tout ce qu'on a le droit de dire d'une entreprise, en un appel.
 *
 * DEUX RAISONS D'ÊTRE, et la seconde n'est pas secondaire.
 *
 * 1. **Le cadre.** C'est la définition matérielle de « le dossier est l'univers
 *    du dicible » : ce qui n'est pas ici ne peut pas être affirmé, et
 *    `validerPreparation` s'en sert littéralement comme référence.
 *
 * 2. **Le coût.** Un modèle qui doit explorer pour se documenter fait vingt
 *    appels, lit des pages entières et paie chaque détour en jetons. Assembler
 *    le dossier côté serveur, en quelques requêtes indexées, ramène cela à un
 *    aller-retour. C'est là que se fait l'économie, pas dans la longueur du
 *    prompt.
 */

export interface DossierAudit {
  entreprise: {
    id: number;
    nom: string | null;
    ville: string | null;
    telephone: string | null;
    site: string | null;
  };
  ficheGoogle: {
    nombreAvis: number | null;
    noteMoyenne: number | null;
    /** Médiane de la commune : situe sans inventer de seuil. */
    medianeAvisCommune: number | null;
  };
  /** Qualifications encore valides, avec leur échéance — un argument daté. */
  rge: Array<{ libelle: string; expireLe: string | null }>;
  analyse: {
    disponible: boolean;
    noteGlobale: number | null;
    libelle: string | null;
    urlAnalysee: string | null;
    analyseLe: string | null;
    /** Les axes publiables et leurs preuves, valeur et seuil compris. */
    axes: Array<{
      id: string;
      note: number;
      preuves: Array<{ cle: string; libelle: string; valeur: string | null; seuil: string | null; verdict: string }>;
    }>;
    /** Constats émis par la mesure — les seules cartes légitimes. */
    constats: Array<{ cle: string; libelle: string; pilier: string }>;
  };
  /**
   * Ce que Google relève, dans ses mots. Vide tant qu'aucune mesure PageSpeed
   * n'a été lancée sur cette entreprise, ou quand la dernière a plus de 30 jours.
   *
   * Ces constats sont citables comme fondement d'une carte, sous la clé
   * `google:<id>` — `google:render-blocking-insight`, par exemple.
   */
  google: ConstatGoogle[];
  /**
   * Le dossier PageSpeed complet : conseils de Google et ressources visées une
   * par une. Absent par défaut — c'est volumineux, et la rédaction n'en a besoin
   * que lorsqu'elle veut nommer précisément ce qui cloche.
   */
  psi?: ContextePsi | null;
  offres: OffreAudit[];
  /** Ce que le rédacteur peut réellement affirmer, prêt pour la validation. */
  univers: {
    preuvesEnEchec: string[];
    constatsEmis: string[];
    offresProposables: string[];
    nombres: string[];
  };
}

/** Assemble le dossier. Ne lève pas : un morceau manquant se dit, il n'échoue pas. */
export async function construireDossier(
  sb: SupabaseClient,
  entrepriseId: number,
  opts: { psiComplet?: boolean } = {},
): Promise<DossierAudit | null> {
  const { data: ent } = await sb
    .from("entreprises")
    .select("id, name, ville, telephone, site_web_canonique, nombre_avis, note_moyenne")
    .eq("id", entrepriseId)
    .maybeSingle();

  if (!ent) return null;
  const e = ent as Record<string, unknown>;

  const [lecture, rge, mediane, offres, psi] = await Promise.all([
    lireAudit(sb, entrepriseId),
    chargerRge(sb, entrepriseId),
    medianeAvisCommune(sb, (e.ville as string) ?? null),
    chargerOffres(sb),
    opts.psiComplet ? lireContextePsi(sb, entrepriseId) : Promise.resolve(null),
  ]);

  const audit = lecture.disponible ? lecture.audit : null;

  const axes = (audit?.axes ?? []).map((a) => ({
    id: a.id,
    note: a.note,
    preuves: a.preuves.map((p) => ({
      cle: p.cle,
      libelle: p.libelle,
      valeur: p.valeur,
      seuil: p.seuil,
      verdict: p.verdict,
    })),
  }));

  const google = audit?.constats_google ?? [];

  /**
   * Un constat Google est un fondement au même titre qu'une de nos preuves —
   * mieux, même : il est vérifiable par le prospect en trente secondes sur
   * pagespeed.web.dev. Le préfixe `google:` empêche toute collision avec nos
   * clés et dit d'où vient l'affirmation.
   */
  const preuvesEnEchec = [
    ...axes.flatMap((a) => a.preuves.filter((p) => p.verdict === "probleme").map((p) => p.cle)),
    ...google.map((c) => `google:${c.id}`),
  ];

  const constats = (audit?.issue_keys ?? []).flatMap((cle) => {
    const def = AUDIT_ISSUE_CATALOG.find((c) => c.key === cle);
    return def ? [{ cle, libelle: def.label, pilier: def.pilier }] : [];
  });

  // Tous les nombres du dossier, pour que la règle 3 ait une référence. On y
  // met les valeurs ET les seuils : « seuil 2,5 s » est une phrase légitime.
  const nombres = new Set<string>();
  for (const a of axes) {
    nombres.add(String(a.note));
    for (const p of a.preuves) {
      for (const n of nombresDe(`${p.valeur ?? ""} ${p.seuil ?? ""}`)) nombres.add(n);
    }
  }
  if (audit?.note_globale != null) nombres.add(String(audit.note_globale));
  // Les chiffres de Google — « 3 650 ms », « 1 040 Kio » — sont les plus
  // vendeurs du dossier. Sans eux ici, la règle 3 rejetterait la seule phrase
  // qu'on voulait vraiment écrire.
  for (const c of google) {
    for (const n of nombresDe(`${c.valeur ?? ""} ${c.gainMs ?? ""} ${c.gainOctets ?? ""} ${c.elements ?? ""}`)) {
      nombres.add(n);
    }
  }
  for (const n of nombresDe(`${e.nombre_avis ?? ""} ${e.note_moyenne ?? ""} ${mediane ?? ""}`)) {
    nombres.add(n);
  }
  for (const o of offres) nombres.add(String(o.prixHt));

  return {
    entreprise: {
      id: entrepriseId,
      nom: (e.name as string) ?? null,
      ville: (e.ville as string) ?? null,
      telephone: (e.telephone as string) ?? null,
      site: (e.site_web_canonique as string) ?? null,
    },
    ficheGoogle: {
      nombreAvis: (e.nombre_avis as number) ?? null,
      noteMoyenne: e.note_moyenne == null ? null : Number(e.note_moyenne),
      medianeAvisCommune: mediane,
    },
    rge,
    analyse: {
      disponible: lecture.disponible && audit != null,
      noteGlobale: audit?.note_globale ?? null,
      libelle: audit?.libelle ?? null,
      urlAnalysee: audit?.url_analysee ?? null,
      analyseLe: audit?.analyse_le ?? null,
      axes,
      constats,
    },
    google,
    ...(opts.psiComplet ? { psi } : {}),
    offres,
    univers: {
      preuvesEnEchec,
      constatsEmis: constats.map((c) => c.cle),
      offresProposables: offres.map((o) => o.code),
      nombres: [...nombres],
    },
  };
}

/** L'univers, dans la forme que `validerPreparation` attend. */
export function universDe(d: DossierAudit): UniversDicible {
  return {
    preuvesEnEchec: new Set(d.univers.preuvesEnEchec),
    constatsEmis: new Set(d.univers.constatsEmis),
    offresProposables: new Set(d.univers.offresProposables),
    nombres: new Set(d.univers.nombres),
  };
}

async function chargerRge(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<Array<{ libelle: string; expireLe: string | null }>> {
  const { data } = await sb
    .from("entreprise_rge_qualifications")
    .select("nom_qualification, code_qualification, date_fin")
    .eq("entreprise_id", entrepriseId)
    .is("retiree_le", null);

  return (data ?? []).map((r) => {
    const q = r as Record<string, unknown>;
    return {
      libelle: ((q.nom_qualification ?? q.code_qualification) as string) ?? "Qualification RGE",
      expireLe: (q.date_fin as string) ?? null,
    };
  });
}

/**
 * La médiane d'avis de la commune.
 *
 * Une médiane situe sans juger : « 8 avis quand la médiane de votre commune est
 * à 31 » se vérifie et ne se conteste pas, là où « peu d'avis » se discute.
 */
async function medianeAvisCommune(sb: SupabaseClient, ville: string | null): Promise<number | null> {
  if (!ville) return null;
  const { data } = await sb
    .from("entreprises")
    .select("nombre_avis")
    .eq("ville", ville)
    .not("nombre_avis", "is", null);

  const valeurs = (data ?? [])
    .map((r) => Number((r as { nombre_avis: unknown }).nombre_avis))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (valeurs.length === 0) return null;
  const m = Math.floor(valeurs.length / 2);
  return valeurs.length % 2 ? valeurs[m] : Math.round((valeurs[m - 1] + valeurs[m]) / 2);
}

async function chargerOffres(sb: SupabaseClient): Promise<OffreAudit[]> {
  const { data } = await sb.from("offres").select("*").eq("actif", true);
  return (data ?? [])
    .map((row) => versOffreAudit(row as Record<string, unknown>))
    .filter((o): o is OffreAudit => o !== null);
}
