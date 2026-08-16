"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Phone, Search, X } from "lucide-react";
import { STATUTS, STATUT_BY_ID, type StatutCarte } from "@/lib/carte/statuts";
import type { DeptCarte, FicheCarte } from "./useCarteData";

const nf = new Intl.NumberFormat("fr-FR");

export type Repartition = Record<StatutCarte, number> & { total: number };

/**
 * Répartition par statut.
 *
 * On somme `poids` et non le nombre d'éléments : à l'échelle nationale un point
 * est une CELLULE de densité qui vaut plusieurs fiches (cf. `FicheCarte.poids`).
 * Compter les éléments annoncerait 7 200 entreprises au lieu de 60 687.
 */
export function compter(fiches: FicheCarte[]): Repartition {
  const out = { total: 0 } as Repartition;
  for (const statut of STATUTS) out[statut.id] = 0;
  for (const fiche of fiches) {
    const poids = fiche.poids || 1;
    out.total += poids;
    out[fiche.statut] += poids;
  }
  return out;
}

/** Barre empilée compacte : la silhouette du portefeuille en un coup d'œil. */
function BarreStatuts({ repartition }: { repartition: Repartition }) {
  return (
    <span className="carte-mini-bars">
      {STATUTS.filter((s) => repartition[s.id] > 0).map((s) => (
        <i key={s.id} style={{ flex: repartition[s.id], background: s.color }} />
      ))}
    </span>
  );
}

function PastilleStatut({ statut }: { statut: StatutCarte }) {
  const meta = STATUT_BY_ID[statut];
  return (
    <span
      className="carte-tag"
      style={{ color: meta.color, background: `${meta.color}1A` }}
      title={meta.description}
    >
      <i style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export type CartePanelProps = {
  dept: DeptCarte | null;
  /** Fiches déjà filtrées par statut, pour la France entière. */
  fiches: FicheCarte[];
  horsCarte: FicheCarte[];
  recherche: string;
  onRecherche: (valeur: string) => void;
  ficheActive: number | null;
  onFicheActive: (id: number | null) => void;
  onSelectDept: (code: string | null) => void;
  departements: DeptCarte[];
};

export function CartePanel(props: CartePanelProps) {
  return props.dept ? <VueDepartement {...props} dept={props.dept} /> : <VueFrance {...props} />;
}

/* ── France entière ─────────────────────────────────────────── */

function VueFrance({
  fiches,
  horsCarte,
  departements,
  onSelectDept,
}: CartePanelProps) {
  const repartition = React.useMemo(() => compter(fiches), [fiches]);

  const { classement, couverts } = React.useMemo(() => {
    const parDept = new Map<string, FicheCarte[]>();
    for (const fiche of fiches) {
      if (!fiche.dept) continue;
      const liste = parDept.get(fiche.dept);
      if (liste) liste.push(fiche);
      else parDept.set(fiche.dept, [fiche]);
    }
    return {
      couverts: parDept.size,
      classement: departements
        .map((dept) => ({ dept, fiches: parDept.get(dept.code) ?? [] }))
        .filter((row) => row.dept.total > 0)
        .sort((a, b) => b.dept.total - a.dept.total)
        .slice(0, 20)
        .map((row) => ({ ...row, repartition: compter(row.fiches) })),
    };
  }, [fiches, departements]);

  return (
    <>
      <div className="carte-p-head">
        <div className="carte-p-top">
          <span className="carte-dcode">FR</span>
          <div className="carte-p-ttl">
            <h2>France entière</h2>
            <div className="s">
              {nf.format(repartition.total)} fiches · {couverts} départements couverts
            </div>
          </div>
        </div>
        <StatsStatuts repartition={repartition} />
      </div>

      <div className="carte-p-hint">
        <b>Cliquez un département</b> pour ouvrir son portefeuille : entreprises, statut de
        chacune et accès direct à la fiche CRM. La légende, en bas, filtre la carte par statut.
      </div>

      <div className="carte-p-rank">
        <div className="carte-rk-h">
          <span className="carte-kicker">Départements les plus fournis</span>
          <span className="carte-kicker">Fiches</span>
        </div>
        {classement.map(({ dept, fiches: liste, repartition: r }) => (
          <button
            type="button"
            key={dept.code}
            className="carte-rk"
            onClick={() => onSelectDept(dept.code)}
          >
            <span className="code">{dept.code}</span>
            <span className="nm">
              {dept.nom}
              <em>{dept.region}</em>
            </span>
            <BarreStatuts repartition={r} />
            <span className="num">{nf.format(liste.length)}</span>
          </button>
        ))}
        {couverts === 0 && (
          <div className="carte-empty">
            <h4>Aucune fiche</h4>
            <p>Aucune entreprise ne correspond aux statuts sélectionnés.</p>
          </div>
        )}
      </div>

      {horsCarte.length > 0 && (
        <div className="carte-p-foot">
          <span className="carte-mono">
            {nf.format(horsCarte.length)} fiche{horsCarte.length > 1 ? "s" : ""} hors métropole ou
            sans coordonnées
          </span>
        </div>
      )}
    </>
  );
}

function StatsStatuts({ repartition }: { repartition: Repartition }) {
  return (
    <div className="carte-p-stats">
      {STATUTS.map((statut) => (
        <div className="carte-ps" key={statut.id} title={statut.description}>
          <span className="d" style={{ background: statut.color }} />
          <span className="v">{nf.format(repartition[statut.id])}</span>
          <span className="l">{statut.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Un département ─────────────────────────────────────────── */

function VueDepartement({
  dept,
  fiches,
  recherche,
  onRecherche,
  ficheActive,
  onFicheActive,
  onSelectDept,
}: CartePanelProps & { dept: DeptCarte }) {
  // Les vraies fiches du département, une fois qu'il est ouvert. Tant qu'elles
  // ne sont pas arrivées, il ne reste que ses cellules de densité : elles
  // portent le bon compte mais n'ont ni nom ni ville, donc on ne les liste pas.
  const duDept = React.useMemo(
    () => fiches.filter((fiche) => fiche.dept === dept.code && fiche.poids === 1),
    [fiches, dept.code],
  );
  const chargees = duDept.length > 0;
  const repartition = React.useMemo(
    () =>
      chargees
        ? compter(duDept)
        : compter(fiches.filter((fiche) => fiche.dept === dept.code)),
    [chargees, duDept, fiches, dept.code],
  );

  const listees = React.useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtrees = q
      ? duDept.filter((fiche) =>
          [fiche.nom, fiche.ville ?? "", fiche.codePostal ?? "", fiche.tags.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : duDept;
    return [...filtrees].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [duDept, recherche]);

  // Cherchée dans tout le département, pas dans la liste filtrée : un clic sur
  // la carte doit ouvrir le détail même si la recherche exclut la pastille.
  const active = React.useMemo(
    () => duDept.find((fiche) => fiche.id === ficheActive) ?? null,
    [duDept, ficheActive],
  );

  // Une pastille cliquée sur la carte peut viser une ligne hors écran : sans ce
  // recentrage, le lien entre le point et sa ligne ne se voit pas.
  const ligneActive = React.useRef<HTMLTableRowElement | null>(null);
  React.useEffect(() => {
    ligneActive.current?.scrollIntoView({ block: "nearest" });
  }, [ficheActive]);

  return (
    <>
      <div className="carte-p-head">
        <div className="carte-p-top">
          <span className="carte-dcode">{dept.code}</span>
          <div className="carte-p-ttl">
            <h2>{dept.nom}</h2>
            <div className="s">
              {dept.region} · préfecture {dept.chefLieu}
            </div>
          </div>
          <button type="button" className="btn outline sm" onClick={() => onSelectDept(null)}>
            <X className="ico-sm" />
            Fermer
          </button>
        </div>

        <StatsStatuts repartition={repartition} />

        <label className="carte-search">
          <Search className="ico-sm" />
          <input
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="Entreprise, ville, tag…"
          />
          {recherche && (
            <button type="button" onClick={() => onRecherche("")} title="Effacer">
              <X className="ico-xs" />
            </button>
          )}
        </label>
      </div>

      <div className="carte-p-table">
        {listees.length === 0 ? (
          <div className="carte-empty">
            <h4>Aucune fiche</h4>
            <p>Aucune entreprise ne correspond à ces filtres dans ce département.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Statut</th>
                <th className="ctr">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {listees.map((fiche) => (
                <tr
                  key={fiche.id}
                  ref={fiche.id === ficheActive ? ligneActive : undefined}
                  data-on={fiche.id === ficheActive ? "true" : undefined}
                  onClick={() => onFicheActive(fiche.id === ficheActive ? null : fiche.id)}
                >
                  <td>
                    <div className="carte-cell">
                      <span className="n">{fiche.nom}</span>
                      <span className="s">
                        {[fiche.ville, fiche.codePostal].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <PastilleStatut statut={fiche.statut} />
                  </td>
                  <td className="ctr">
                    <Link
                      href={`/companies/${fiche.id}`}
                      className="carte-open"
                      title="Ouvrir la fiche CRM"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowUpRight className="ico-sm" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active && <DetailFiche fiche={active} />}

      <div className="carte-p-foot">
        <span className="carte-mono">
          {nf.format(listees.length)} / {nf.format(dept.total)} fiches
        </span>
      </div>
    </>
  );
}

function DetailFiche({ fiche }: { fiche: FicheCarte }) {
  return (
    <div className="carte-p-detail">
      <div className="dh">
        <b>{fiche.nom}</b>
        <PastilleStatut statut={fiche.statut} />
        <span className="carte-mono t4">#{fiche.id}</span>
      </div>
      <dl className="carte-kv">
        <dt>Ville</dt>
        <dd>{[fiche.ville, fiche.codePostal].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>Téléphone</dt>
        <dd>
          {fiche.telephone ? (
            <a href={`tel:${fiche.telephone}`} className="carte-mono">
              <Phone className="ico-xs" />
              {fiche.telephone}
            </a>
          ) : (
            <span className="t3">non renseigné</span>
          )}
        </dd>
        <dt>Site web</dt>
        <dd>
          {fiche.siteWeb ? (
            <a href={fiche.siteWeb} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="ico-xs" />
              {fiche.siteWeb.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span className="t3">aucun</span>
          )}
        </dd>
        {fiche.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd className="carte-tags">
              {fiche.tags.slice(0, 6).map((tag) => (
                <span className="pill" key={tag}>
                  {tag}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <div className="carte-da">
        <Link href={`/companies/${fiche.id}`} className="btn accent sm">
          Ouvrir la fiche
        </Link>
      </div>
    </div>
  );
}
