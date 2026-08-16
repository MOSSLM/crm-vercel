"use client";

import { COHORTES, LIBELLE_COHORTE, TEINTE_COHORTE, type Cohorte } from "@/lib/entonnoir/etages";

/**
 * A, B, ou les deux.
 *
 * L'effectif est collé au libellé parce qu'il conditionne la lecture : « A ·
 * site faible 300 » et « B · sans site 42 » ne se comparent pas de la même
 * façon, et un écart de points sur 42 entreprises ne vaut pas décision.
 */
export default function SelecteurCohorte({
  valeur,
  effectifs,
  onChange,
}: {
  valeur: Cohorte | null;
  effectifs: Record<Cohorte, number>;
  onChange: (v: Cohorte | null) => void;
}) {
  const options: Array<{ cle: Cohorte | null; libelle: string; total: number; teinte: string }> = [
    {
      cle: null,
      libelle: "Les deux",
      total: COHORTES.reduce((n, c) => n + (effectifs[c] ?? 0), 0),
      teinte: "var(--text-3)",
    },
    ...COHORTES.map((c) => ({
      cle: c as Cohorte | null,
      libelle: LIBELLE_COHORTE[c],
      total: effectifs[c] ?? 0,
      teinte: TEINTE_COHORTE[c],
    })),
  ];

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <button
            key={o.cle ?? "toutes"}
            type="button"
            onClick={() => onChange(o.cle)}
            aria-pressed={actif}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
              actif ? "bg-[var(--surface)] font-medium shadow-sm" : "text-[var(--text-2)] hover:text-[var(--text)]"
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.teinte }} />
            {o.libelle}
            <span className="tabular-nums text-[var(--text-3)]">{o.total.toLocaleString("fr-FR")}</span>
          </button>
        );
      })}
    </div>
  );
}
