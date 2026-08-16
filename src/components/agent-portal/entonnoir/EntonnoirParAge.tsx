"use client";

import {
  AGES,
  ETAGES,
  LETTRE_COHORTE,
  LIBELLE_COHORTE,
  TEINTE_COHORTE,
  type CleEtage,
  type Cohorte,
  type PointAge,
  type SourcesMuettes,
} from "@/lib/entonnoir/etages";
import { nombre, pourcentage } from "./vue";

/**
 * La comparaison des deux cohortes AU MÊME ÂGE.
 *
 * POURQUOI CE TABLEAU EXISTE
 * La cohorte A est démarchée du 17 au 19, la B du 20 au 22. Les comparer à date
 * absolue le 25 août opposerait cinq jours de relances à un seul : on
 * conclurait que le site faible convertit mieux, alors qu'on aurait seulement
 * mesuré qu'il est plus vieux. Chaque ligne ne retient donc que les entreprises
 * ASSEZ VIEILLES pour l'âge lu — les autres ne comptent ni au numérateur ni au
 * dénominateur.
 *
 * La ligne Δ est la réponse au 25 août : combien de points d'écart, à âge égal,
 * entre les deux offres. C'est elle qu'on regarde en premier.
 */

const COLONNES = ETAGES.filter((e) => e.cle !== "ciblee");

function Case({ total, part }: { total: number | null; part: number | null }) {
  if (total == null) return <span className="text-[var(--text-3)]">—</span>;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm font-semibold tabular-nums">{pourcentage(part)}</span>
      <span className="text-[11px] text-[var(--text-3)] tabular-nums">{nombre(total)}</span>
    </span>
  );
}

export default function EntonnoirParAge({
  parAge,
  nonDatees,
}: {
  parAge: PointAge[];
  nonDatees: SourcesMuettes;
}) {
  if (parAge.length === 0) {
    return (
      <p className="text-sm text-[var(--text-3)]">
        Aucune entreprise n&apos;a encore de première touche : la lecture par âge commence au premier
        message envoyé.
      </p>
    );
  }

  const cohortes = [...new Set(parAge.map((p) => p.cohorte))] as Cohorte[];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            <th className="w-24 py-2 pr-2 font-medium">Âge</th>
            <th className="w-16 py-2 pr-2 text-right font-medium">Éligibles</th>
            {COLONNES.map((c) => (
              <th key={c.cle} className="py-2 pr-3 font-medium" title={nonDatees[c.cle] ?? c.source}>
                {c.court}
              </th>
            ))}
          </tr>
        </thead>
        {/* Un <tbody> par âge : c'est ce qui permet de garder « J+n » sur une
            seule cellule fusionnée sans imbriquer les regroupements. */}
        {AGES.map((jour) => {
          const lignes = cohortes
            .map((cohorte) => parAge.find((p) => p.jour === jour && p.cohorte === cohorte))
            .filter((p): p is PointAge => !!p);
          if (lignes.length === 0) return null;

          const partDe = (p: PointAge, cle: CleEtage) => p.etages.find((e) => e.cle === cle)?.part ?? null;
          // L'écart n'a de sens qu'entre deux cohortes réellement affichées.
          const ecart =
            lignes.length === 2
              ? COLONNES.map((c) => {
                  const a = partDe(lignes[0], c.cle);
                  const b = partDe(lignes[1], c.cle);
                  return a == null || b == null ? null : Math.round((b - a) * 10) / 10;
                })
              : null;

          return (
            <tbody key={jour} className="border-t border-[var(--border)]">
              {lignes.map((p, i) => (
                <tr key={p.cohorte} className="align-middle">
                  {i === 0 && (
                    <td rowSpan={lignes.length + (ecart ? 1 : 0)} className="py-2 pr-2 align-top">
                      <span className="text-base font-semibold">J+{jour}</span>
                    </td>
                  )}
                  <td className="py-1.5 pr-2 text-right">
                    <span
                      className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white"
                      style={{ background: TEINTE_COHORTE[p.cohorte] }}
                      title={LIBELLE_COHORTE[p.cohorte]}
                    >
                      {LETTRE_COHORTE[p.cohorte]}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--text-2)]">{nombre(p.eligibles)}</span>
                  </td>
                  {COLONNES.map((c) => {
                    const e = p.etages.find((x) => x.cle === c.cle);
                    return (
                      <td key={c.cle} className="py-1.5 pr-3">
                        <Case total={e?.total ?? null} part={e?.part ?? null} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {ecart && (
                <tr>
                  <td className="pb-2 pr-2 text-right text-[11px] font-medium text-[var(--text-3)]">
                    Δ B−A
                  </td>
                  {ecart.map((v, i) => (
                    <td key={COLONNES[i].cle} className="pb-2 pr-3">
                      {v == null ? (
                        <span className="text-[var(--text-3)]">—</span>
                      ) : (
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{
                            color:
                              v > 0 ? "var(--ok)" : v < 0 ? "var(--danger)" : "var(--text-3)",
                          }}
                        >
                          {v > 0 ? "+" : ""}
                          {v.toLocaleString("fr-FR")} pt
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          );
        })}
      </table>

      <p className="pt-3 text-[11px] leading-relaxed text-[var(--text-3)]">
        Le pourcentage est celui des <strong>éligibles</strong> : les entreprises dont la première touche
        a au moins l&apos;âge de la ligne. Une entreprise touchée hier ne peut pas avoir raté son J+7,
        elle n&apos;entre donc dans aucun des deux nombres. « Δ B−A » est l&apos;écart en points entre
        les deux cohortes au même âge — c&apos;est la seule comparaison qui tienne. Une colonne « — »
        est un étage qu&apos;on ne sait pas dater, pas un étage vide.
      </p>
    </div>
  );
}
