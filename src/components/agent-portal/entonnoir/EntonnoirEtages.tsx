"use client";

import { AlertTriangle } from "lucide-react";
import type { Etage } from "@/lib/entonnoir/etages";
import { nombre, opaciteEtage, pourcentage, teinteEtage } from "./vue";

/**
 * Les huit étages, et surtout la PERTE de chacun.
 *
 * CE QUI DÉCIDE DOIT SE VOIR SANS LIRE
 * La perte est la seule information de l'écran qui déclenche une action : elle
 * a donc la colonne de droite, en gros et en rouge, et une barre qui montre
 * exactement où la file se vide. Les totaux, eux, se lisent au repos.
 *
 * La barre d'un étage commence là où celle du précédent s'arrête : c'est une
 * cascade. Le segment rouge est littéralement ce qu'on a perdu entre les deux,
 * à l'échelle du nombre d'entreprises ciblées.
 */
export default function EntonnoirEtages({ etages }: { etages: Etage[] }) {
  const partPar = new Map(etages.map((e) => [e.cle, e.part]));

  return (
    <div className="space-y-1">
      {etages.map((e) => {
        const partPrecedente = e.depuis ? partPar.get(e.depuis) ?? null : null;
        const part = e.part ?? 0;
        // Perte négative = plus de monde ici qu'à l'étage précédent. Ce n'est
        // pas un gain : c'est un trou de journalisation, et il se voit.
        const trou = e.perte != null && e.perte < 0;
        const largeurPerte =
          partPrecedente != null && e.perte != null && e.perte > 0 ? Math.max(partPrecedente - part, 0) : 0;

        return (
          <div
            key={e.cle}
            className="grid grid-cols-[9.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 sm:grid-cols-[11rem_minmax(0,1fr)_4.5rem_6.5rem] hover:bg-[var(--surface-2)]"
          >
            {/* Libellé + source. La source est affichée, pas seulement
                documentée : un chiffre qu'on ne sait pas expliquer ne se croit
                pas, et ne se défend pas devant un client. */}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{e.libelle}</div>
              <div className="truncate text-[11px] text-[var(--text-3)]" title={e.source}>
                {e.source}
              </div>
            </div>

            {/* La cascade */}
            {e.muette ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-[11px]"
                style={{ borderColor: "var(--warn)", color: "var(--warn)" }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={e.muette}>
                  Non mesuré — {e.muette}
                </span>
              </div>
            ) : (
              <div className="flex h-7 w-full overflow-hidden rounded-md bg-[var(--surface-2)]">
                <div
                  className="h-full"
                  style={{
                    width: `${part}%`,
                    background: teinteEtage(e.cle),
                    opacity: opaciteEtage(e.cle),
                  }}
                />
                {largeurPerte > 0 && (
                  <div
                    className="h-full"
                    style={{ width: `${largeurPerte}%`, background: "var(--danger-tint)" }}
                    title={`${nombre(e.perte)} entreprises perdues à cet étage`}
                  />
                )}
              </div>
            )}

            {/* Le total */}
            <div className="text-right">
              <div className="text-lg font-semibold leading-none tabular-nums">{nombre(e.total)}</div>
              <div className="text-[11px] text-[var(--text-3)] tabular-nums">
                {e.total == null ? " " : pourcentage(e.part)}
              </div>
            </div>

            {/* La perte — l'information la plus importante de l'écran */}
            <div className="col-start-2 col-end-4 text-right sm:col-start-4 sm:col-end-5">
              {e.perte == null ? (
                <span className="text-xs text-[var(--text-3)]">{e.muette ? "—" : "point de départ"}</span>
              ) : (
                <div style={{ color: trou ? "var(--warn)" : "var(--danger)" }}>
                  <div
                    className="text-base font-semibold leading-none tabular-nums"
                    title={
                      trou
                        ? "Plus d'entreprises ici qu'à l'étage précédent : la source de l'étage précédent n'est pas renseignée pour tout le monde."
                        : undefined
                    }
                  >
                    {trou ? "+" : "−"}
                    {nombre(Math.abs(e.perte))}
                  </div>
                  <div className="text-[11px] tabular-nums opacity-80">
                    {e.pertePct == null ? " " : pourcentage(Math.abs(e.pertePct))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
