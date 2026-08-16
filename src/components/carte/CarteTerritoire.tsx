"use client";

import * as React from "react";
import { MapPin, RefreshCw, Search } from "lucide-react";
import { STATUTS, type StatutCarte } from "@/lib/carte/statuts";
import { CarteFrance, CHOROPLETHE, type ModeCarte } from "./CarteFrance";
import { CartePanel, compter } from "./CartePanel";
import { useCarteData, type FicheCarte } from "./useCarteData";

const nf = new Intl.NumberFormat("fr-FR");

const MODES: Array<{ id: ModeCarte; label: string; title: string }> = [
  { id: "taches", label: "Taches", title: "Halos : les pôles d'activité ressortent" },
  { id: "points", label: "Points", title: "Une pastille par entreprise" },
  { id: "aplat", label: "Aplat", title: "Densité de fiches par département" },
];

const TOUS_STATUTS = new Set<StatutCarte>(STATUTS.map((s) => s.id));

export function CarteTerritoire() {
  const { data, loading, error, reload, chargerDepartement } = useCarteData();

  const [mode, setMode] = React.useState<ModeCarte>("taches");
  const [statuts, setStatuts] = React.useState<Set<StatutCarte>>(TOUS_STATUTS);
  const [selection, setSelection] = React.useState<string | null>(null);
  const [ficheActive, setFicheActive] = React.useState<number | null>(null);
  const [recherche, setRecherche] = React.useState("");
  const [allerA, setAllerA] = React.useState("");

  const fiches: FicheCarte[] = React.useMemo(
    () => (data ? data.fiches.filter((fiche) => statuts.has(fiche.statut)) : []),
    [data, statuts],
  );

  const repartition = React.useMemo(() => compter(fiches), [fiches]);
  const horsCarte = React.useMemo(
    () => fiches.filter((fiche) => !fiche.dept),
    [fiches],
  );
  const etendueDept = React.useMemo(() => {
    // Somme des poids : un point est une cellule de densité qui vaut plusieurs
    // fiches tant que le département n'est pas ouvert.
    const compte = new Map<string, number>();
    for (const fiche of fiches) {
      if (!fiche.dept) continue;
      compte.set(fiche.dept, (compte.get(fiche.dept) ?? 0) + (fiche.poids || 1));
    }
    const valeurs = [...compte.values()];
    return {
      couverts: valeurs.length,
      min: valeurs.length ? Math.min(...valeurs) : 0,
      max: valeurs.length ? Math.max(...valeurs) : 0,
    };
  }, [fiches]);

  const basculerStatut = (id: StatutCarte) => {
    setStatuts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Tout décocher n'affiche plus rien : on rétablit la vue complète.
      return next.size === 0 ? new Set(TOUS_STATUTS) : next;
    });
  };

  const choisirDept = React.useCallback(
    (code: string | null) => {
      setSelection(code);
      setFicheActive(null);
      setRecherche("");
      // Ouvrir un département remplace ses cellules de densité par ses fiches
      // réelles : c'est le seul moment où on en a besoin, et le seul où le
      // volume le permet (2 137 fiches pour le Rhône, contre 60 687 en France).
      if (code) chargerDepartement(code);
    },
    [chargerDepartement],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selection) choisirDept(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, choisirDept]);

  const deptSelectionne = selection ? (data?.deptByCode.get(selection) ?? null) : null;

  const validerAllerA = (valeur: string) => {
    if (!data) return;
    const q = valeur.trim().toLowerCase();
    if (!q) return;
    const hit = data.departements.find(
      (d) =>
        d.code.toLowerCase() === q ||
        d.nom.toLowerCase() === q ||
        d.chefLieu.toLowerCase() === q ||
        d.nom.toLowerCase().startsWith(q),
    );
    if (hit) {
      choisirDept(hit.code);
      setAllerA("");
    }
  };

  return (
    <div className="studio-surface carte-shell">
      <header className="carte-head">
        <span className="carte-head-ico">
          <MapPin className="ico" />
        </span>
        <div className="carte-head-ttl">
          <h1>Carte du territoire</h1>
          <span className="carte-head-spec">
            Où sont nos entreprises, et où en est chacune
          </span>
        </div>
      </header>

      <div className="carte-body">
        <div className="carte-main">
          <div className="carte-bar">
            <label className="carte-find">
              <Search className="ico-sm" />
              <input
                value={allerA}
                list="carte-depts"
                placeholder="Aller à un département…"
                onChange={(e) => setAllerA(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validerAllerA(e.currentTarget.value);
                }}
                onBlur={(e) => validerAllerA(e.target.value)}
              />
              <datalist id="carte-depts">
                {data?.departements.map((d) => (
                  <option key={d.code} value={d.nom}>
                    {d.code} · {d.chefLieu}
                  </option>
                ))}
              </datalist>
            </label>

            <div className="seg">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="s"
                  title={m.title}
                  aria-pressed={mode === m.id}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="carte-kpi">
              <Kpi label="Entreprises" value={repartition.total} />
              <Kpi label="Qualifiées" value={repartition.qualifie} />
              <Kpi label="Contact entamé" value={repartition.contact} />
              <Kpi label="Départements" value={etendueDept.couverts} />
            </div>
          </div>

          {loading && (
            <div className="carte-stage carte-loading">
              <span className="carte-kicker">chargement du territoire…</span>
            </div>
          )}

          {!loading && error && (
            <div className="carte-stage carte-loading">
              <div className="carte-err">
                <b>Carte indisponible</b>
                <span>Le fond de carte ou les fiches n&apos;ont pas pu être chargés.</span>
                <span className="carte-mono">{error}</span>
                <button type="button" className="btn outline sm" onClick={reload}>
                  <RefreshCw className="ico-sm" />
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <CarteFrance
              departements={data.departements}
              geometries={data.geometries}
              fiches={fiches}
              mode={mode}
              selection={selection}
              onSelect={choisirDept}
              ficheActive={ficheActive}
              onFicheActive={setFicheActive}
            />
          )}

          <div className="carte-legend">
            {STATUTS.map((statut) => (
              <button
                key={statut.id}
                type="button"
                className="carte-lg"
                data-off={statuts.has(statut.id) ? undefined : "true"}
                title={statut.description}
                onClick={() => basculerStatut(statut.id)}
              >
                <i style={{ background: statut.color }} />
                <span className="n">{statut.label}</span>
                <span className="v">
                  {nf.format(
                    data
                      ? data.fiches
                          .filter(
                            (f) =>
                              f.statut === statut.id && (!selection || f.dept === selection),
                          )
                          .reduce((somme, f) => somme + (f.poids || 1), 0)
                      : 0,
                  )}
                </span>
              </button>
            ))}
            {mode === "aplat" ? (
              <div className="carte-lg-choro">
                <span className="carte-kicker">Fiches / dép.</span>
                <span className="sw">
                  {CHOROPLETHE.map((couleur) => (
                    <i key={couleur} style={{ background: couleur }} />
                  ))}
                </span>
                <span className="sc">
                  {nf.format(etendueDept.min)} → {nf.format(etendueDept.max)}
                </span>
              </div>
            ) : (
              <span className="carte-lg-note">
                Une tache = un pôle d&apos;entreprises · cliquez un département pour l&apos;ouvrir
              </span>
            )}
          </div>
        </div>

        <aside className="carte-panel">
          {data && (
            <CartePanel
              dept={deptSelectionne}
              departements={data.departements}
              fiches={fiches}
              horsCarte={horsCarte}
              recherche={recherche}
              onRecherche={setRecherche}
              ficheActive={ficheActive}
              onFicheActive={setFicheActive}
              onSelectDept={choisirDept}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="carte-k">
      <span className="l">{label}</span>
      <span className="v">{nf.format(value)}</span>
    </div>
  );
}

export default CarteTerritoire;
