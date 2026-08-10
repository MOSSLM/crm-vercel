import { stageRole, type StageRole } from "@/lib/opportunites/stage-roles";

export function formatPrice(amount: number | null | undefined, devise = "EUR"): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: devise,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${devise}`;
  }
}

/** Supabase to-one embeds can arrive as an object or a single-element array. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Teinte d'une étape (jetons de globals.css).
 *
 * Les libellés exacts d'« Agent SAMA » restent reconnus, mais ils ne suffisent
 * plus : le board de l'agent affiche désormais les étapes de tous les pipelines
 * où il a des affaires (« Signature », « Relance 1 », « Devis »…). Sans repli
 * sémantique, tout ce qui vient d'ailleurs virait au gris et un « Perdu » de
 * Streak était indistinguable d'une étape neutre.
 */
/**
 * Le prune du RDV n'a pas de jeton : c'est une teinte catégorielle, choisie
 * pour rester distincte des sept autres étapes, pas un rôle de la charte.
 * Elle doit rester égale à `ROLE_TINT.rdv` de `src/lib/opportunites/stage-roles.ts`
 * — le CRM et le portail agent peignent la même étape.
 */
const RDV_TINT = "#A24E86";

export const STAGE_TINT: Record<string, string> = {
  "Nouveau lead": "var(--text-3)",
  "Première approche": "var(--magic)",
  "Contacté (appelé)": "var(--info)",
  Contacté: "var(--info)",
  "En échange": "var(--warn)",
  Intéressé: "var(--warn)",
  "RDV calé": RDV_TINT,
  "Client signé": "var(--ok)",
  Perdu: "var(--danger)",
};

/** Repli par rôle, valable dans n'importe quel pipeline. */
const ROLE_TINT: Record<StageRole, string> = {
  nouveau: "var(--text-3)",
  approche: "var(--magic)",
  contacte: "var(--info)",
  interesse: "var(--warn)",
  rdv: RDV_TINT,
  propo: "var(--primary)",
  signe: "var(--ok)",
  perdu: "var(--danger)",
  autre: "var(--text-3)",
};

export function stageTint(nom: string | undefined | null): string {
  if (nom && STAGE_TINT[nom]) return STAGE_TINT[nom];
  return ROLE_TINT[stageRole(nom)];
}
