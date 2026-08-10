import type { AuditAdditionalService, AuditPage5, AuditPricingService, AuditSecondaryCard } from "@/types";
import { AUDIT_ISSUE_CATALOG, type AuditPilier } from "@/data/auditIssues";

/**
 * La page tarifs vient du catalogue d'offres, plus d'un second catalogue écrit
 * en dur.
 *
 * POURQUOI. `src/lib/audit/default-content.ts` portait ses propres prix, et les
 * deux sources avaient déjà divergé : l'audit annonçait un hébergement à
 * 19 €/mois quand le catalogue le facture 30 €, et une prestation à 490 € qui
 * n'existait dans aucune table. Un document commercial qui annonce un prix qu'on
 * ne pratique pas est un passif, pas un actif.
 *
 * LA STRUCTURE DE VENTE, qui commande tout ce fichier : on vend le démo,
 * obligatoirement ; le reste s'ajoute et se conseille. D'où trois rôles, et
 * trois emplacements que la page 5 possédait déjà.
 *
 * UNE ADDITION N'EST JAMAIS PROPOSÉE SANS SON CONSTAT. C'est `repond_a`, porté
 * par l'offre elle-même, qui l'interdit : suggérer des pages légales à une
 * entreprise qui en a déjà serait une vente forcée, et le prospect le verrait.
 */

export type RoleAudit = "socle" | "addition" | "alternative";

/** Une offre du catalogue, réduite à ce dont l'audit a besoin. */
export interface OffreAudit {
  code: string;
  nom: string;
  description: string | null;
  prixHt: number;
  /** `monthly` ⇒ ligne récurrente ; tout le reste est ponctuel. */
  mensuel: boolean;
  role: RoleAudit;
  /** Clés de constats que cette offre répare. Vide ⇒ jamais suggérée. */
  repondA: string[];
  /** « À partir de » : le prix affiché est un plancher. */
  aPartirDe: boolean;
  /** Hébergement mensuel vendu avec le socle, s'il y en a un. */
  hebergementMensuel: number | null;
}

/** Lit une ligne de `offres` telle que Supabase la rend. Ignore ce qui n'a pas de rôle. */
export function versOffreAudit(row: Record<string, unknown>): OffreAudit | null {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const role = meta.role_audit;
  if (role !== "socle" && role !== "addition" && role !== "alternative") return null;
  if (row.actif === false) return null;

  const code = typeof row.code === "string" ? row.code : null;
  const nom = typeof row.nom === "string" ? row.nom : null;
  if (!code || !nom) return null;

  return {
    code,
    // Le libellé client l'emporte sur le nom interne, et c'est le seul endroit
    // où l'arbitrage se fait : l'audit, le devis et la facture lisent tous
    // `nom`. Sans ça, un chauffagiste reçoit « Copywriting (light) », « Schema
    // markup (FAQ/LocalBusiness) » et « Setup Google Search Console » — que la
    // règle éditoriale interdit, et qui font décrocher un lecteur non technique
    // en trois mots.
    nom: typeof meta.libelle_client === "string" && meta.libelle_client.trim() ? meta.libelle_client : nom,
    description: typeof row.description === "string" ? row.description : null,
    prixHt: Number(row.prix_ht ?? 0),
    mensuel: row.billing_period === "monthly",
    role,
    repondA: Array.isArray(meta.repond_a) ? meta.repond_a.filter((k): k is string => typeof k === "string") : [],
    aPartirDe: meta.from === true,
    hebergementMensuel:
      typeof meta.hosting_price_monthly === "number" ? meta.hosting_price_monthly : null,
  };
}

const PILIER_PAR_CLE = new Map<string, AuditPilier>(
  AUDIT_ISSUE_CATALOG.map((c) => [c.key, c.pilier]),
);

const LIBELLE_PILIER: Record<AuditPilier, string> = {
  technique: "Technique",
  contenu: "Conversion",
  popularite: "Réputation",
};

/**
 * Les additions à conseiller : celles qui répondent à au moins un constat retenu.
 *
 * Triées par nombre de constats couverts, puis par prix décroissant. Une offre
 * qui répare trois choses se défend mieux qu'une qui en répare une, et la
 * première ligne d'une liste est celle qu'on lit.
 */
export function additionsPour(offres: readonly OffreAudit[], clesRetenues: readonly string[]): OffreAudit[] {
  const retenues = new Set(clesRetenues);
  return offres
    .filter((o) => o.role === "addition" && o.repondA.some((k) => retenues.has(k)))
    .map((o) => ({ o, couverts: o.repondA.filter((k) => retenues.has(k)).length }))
    .sort((a, b) => b.couverts - a.couverts || b.o.prixHt - a.o.prixHt)
    .map((x) => x.o)
    .slice(0, MAX_ADDITIONS);
}

/**
 * Trois additions au plus, et c'est une décision commerciale autant que
 * typographique.
 *
 * Le catalogue compte quinze additions ; avec six constats retenus, cinq ou six
 * matchent. Deux conséquences, toutes deux mauvaises : la demi-page déborde — et
 * `overflow: hidden` fait disparaître les dernières sans rien dire —, et surtout
 * une liste longue se lit comme un menu, ce qui affaiblit le socle au lieu de le
 * compléter. Les trois retenues sont celles qui couvrent le plus de constats,
 * donc les plus faciles à défendre.
 */
export const MAX_ADDITIONS = 3;

/** Le badge d'une addition : le pilier du premier constat qu'elle couvre. */
function badgeDe(offre: OffreAudit, retenues: Set<string>): string | undefined {
  const cle = offre.repondA.find((k) => retenues.has(k));
  const pilier = cle ? PILIER_PAR_CLE.get(cle) : undefined;
  return pilier ? LIBELLE_PILIER[pilier] : undefined;
}

/**
 * Reconstruit la page tarifs à partir du catalogue et des constats retenus.
 *
 * Ne touche PAS aux champs rédactionnels de la page (sous-titre, note de prix,
 * réglages de grain) : ce sont des choix de l'opérateur, et les écraser à chaque
 * recalcul lui ferait perdre son travail sans prévenir.
 */
export function construirePage5(
  page5: AuditPage5,
  offres: readonly OffreAudit[],
  clesRetenues: readonly string[],
): AuditPage5 {
  const retenues = new Set(clesRetenues);

  // ── Le socle : toujours présent, jamais déduit des constats ──────────────
  const socle = offres.find((o) => o.role === "socle");
  const services: AuditPricingService[] = [];

  if (socle) {
    services.push({
      label: socle.nom,
      sub_label: socle.description ?? undefined,
      amount: socle.prixHt,
      is_mrr: socle.mensuel,
      enabled: true,
      from: socle.aPartirDe,
    });
    if (socle.hebergementMensuel != null) {
      services.push({
        label: "Hébergement & maintenance",
        sub_label: "Nom de domaine, hébergement, mises à jour",
        amount: socle.hebergementMensuel,
        is_mrr: true,
        enabled: true,
      });
    }
  }

  // ── Les additions : conseillées, donc justifiées par un constat ──────────
  const additions: AuditAdditionalService[] = additionsPour(offres, clesRetenues).map((o) => ({
    label: o.nom,
    description: o.description ?? undefined,
    amount: o.prixHt,
    is_mrr: o.mensuel,
    badge: badgeDe(o, retenues),
  }));

  // ── L'alternative ────────────────────────────────────────────────────────
  //
  // Pas de repli sur `page5.secondary_card` ici, contrairement au socle. Le
  // raisonnement « mieux vaut un tarif périmé qu'une page vide » vaut pour la
  // ligne qu'on vend ; il ne vaut pas pour une formule alternative, dont
  // l'absence ne laisse aucun trou. Retirer l'offre du catalogue doit suffire à
  // la faire disparaître du document — sinon la copie en dur du contenu par
  // défaut la réinjecte indéfiniment.
  const alt = offres.find((o) => o.role === "alternative");
  const secondaire: AuditSecondaryCard | undefined = alt
    ? {
        title: alt.nom,
        subtitle: "Autre formule",
        description: alt.description ?? undefined,
        amount: alt.prixHt,
        from: alt.aPartirDe,
      }
    : undefined;

  return {
    ...page5,
    // Sans socle au catalogue, on garde ce qui était là : mieux vaut un tarif
    // périmé qu'une page de tarifs vide devant un prospect.
    services: services.length > 0 ? services : page5.services,
    additional_services: additions.length > 0 ? additions : page5.additional_services,
    secondary_card: secondaire,
  };
}

/** Les codes d'offres retenus par un audit — ce qui deviendra le devis. */
export function codesRetenus(offres: readonly OffreAudit[], clesRetenues: readonly string[]): string[] {
  const socle = offres.filter((o) => o.role === "socle").map((o) => o.code);
  return [...socle, ...additionsPour(offres, clesRetenues).map((o) => o.code)];
}
