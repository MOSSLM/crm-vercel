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

/** Semantic tint per Agent SAMA pipeline stage (uses globals.css tokens). */
export const STAGE_TINT: Record<string, string> = {
  "Nouveau lead": "var(--info)",
  Contacté: "var(--text-3)",
  "En échange": "var(--warn)",
  Intéressé: "var(--accent)",
  "RDV calé": "var(--accent)",
  "Client signé": "var(--ok)",
  Perdu: "var(--danger)",
};

export function stageTint(nom: string | undefined | null): string {
  return (nom && STAGE_TINT[nom]) || "var(--text-3)";
}
