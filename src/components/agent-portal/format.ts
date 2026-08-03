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
export const STAGE_TINT: Record<string, string> = {
  "Nouveau lead": "var(--info)",
  "Première approche": "var(--info)",
  "Contacté (appelé)": "var(--text-3)",
  Contacté: "var(--text-3)",
  "En échange": "var(--warn)",
  Intéressé: "var(--accent)",
  "RDV calé": "var(--accent)",
  "Client signé": "var(--ok)",
  Perdu: "var(--danger)",
};

/** Repli par rôle, valable dans n'importe quel pipeline. */
const ROLE_TINT: Record<StageRole, string> = {
  nouveau: "var(--info)",
  approche: "var(--info)",
  contacte: "var(--text-3)",
  interesse: "var(--accent)",
  rdv: "var(--accent)",
  propo: "var(--warn)",
  signe: "var(--ok)",
  perdu: "var(--danger)",
  autre: "var(--text-3)",
};

export function stageTint(nom: string | undefined | null): string {
  if (nom && STAGE_TINT[nom]) return STAGE_TINT[nom];
  return ROLE_TINT[stageRole(nom)];
}
