"use client";

import React from "react";
import { Search, Wrench, X } from "lucide-react";
import { servicesPresents } from "./filtres";
import type { BoardItem } from "./types";

/**
 * FILTRER LE TABLEAU PAR MÉTIER.
 *
 * LE BESOIN, MOT POUR MOT : « après avoir enrichi et fait tourner les robots je
 * me rends compte qu'il y a pas mal d'entreprises qui font isolation par
 * l'extérieur, et rénovation, mais pas clim. Je préférerais mettre dans un
 * segment à part. »
 *
 * POURQUOI CE N'EST PAS UNE LISTE DE CASES. Les quatre groupes du panneau de
 * filtres sont des vocabulaires fermés (trois états de site, trois niveaux de
 * note). `entreprises.service_tags` n'en est pas un : des centaines de libellés
 * distincts sur 60 726 fiches, dont « Isolation des murs par l'extérieur »
 * (8 464) et « Pompe à chaleur : chauffage » (15 303). On ne coche pas dans une
 * liste de trois cents lignes — on cherche.
 *
 * CE QUI EST COCHÉ RESTE EN TÊTE, même quand la recherche ne le fait plus
 * remonter : sans ça, taper trois lettres ferait disparaître de l'écran ce
 * qu'on vient de choisir, et on croirait l'avoir perdu.
 *
 * LES COMPTES SONT CEUX DU TABLEAU CHARGÉ, pas ceux de la base. Annoncer 8 464
 * sur une page qui en montre cent donnerait un chiffre qu'aucun clic ne
 * retrouve.
 */
export function FiltreServices({
  items,
  choisis,
  setChoisis,
}: {
  /** Toutes les lignes du tableau — c'est sur elles que les comptes portent. */
  items: readonly BoardItem[];
  choisis: Set<string>;
  setChoisis: (s: Set<string>) => void;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const [recherche, setRecherche] = React.useState("");

  const tous = React.useMemo(() => servicesPresents(items), [items]);

  const listes = React.useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const retenus = q ? tous.filter((s) => s.service.toLowerCase().includes(q)) : tous;
    return {
      // Les cochés d'abord, dans l'ordre où le tableau les porte.
      coches: tous.filter((s) => choisis.has(s.service)),
      autres: retenus.filter((s) => !choisis.has(s.service)),
      total: retenus.length,
    };
  }, [tous, recherche, choisis]);

  const basculer = (service: string) => {
    const n = new Set(choisis);
    if (n.has(service)) n.delete(service);
    else n.add(service);
    setChoisis(n);
  };

  // Aucun métier nulle part : le bouton n'a rien à trier. Une base sans
  // `service_tags` ne doit pas gagner un filtre qui rend toujours zéro.
  if (tous.length === 0) return null;

  const Ligne = ({ service, n }: { service: string; n: number }) => (
    <label className="fp-case" key={service} title={service}>
      <input type="checkbox" checked={choisis.has(service)} onChange={() => basculer(service)} />
      <span className="fp-label">{service}</span>
      <span className="fp-ct">{n}</span>
    </label>
  );

  return (
    <div className="filtres-pop-hote">
      <button
        className={"btn subtle sm" + (choisis.size > 0 ? " on" : "")}
        onClick={() => setOuvert((v) => !v)}
        title="Filtrer sur le métier du prospect (entreprises.service_tags)"
      >
        <Wrench className="ico-sm" />
        Métiers
        {choisis.size > 0 && <span className="ct">{choisis.size}</span>}
      </button>

      {ouvert && (
        <>
          <div className="mp-scope-pop-scrim" onClick={() => setOuvert(false)} />
          <div className="filtres-pop fp-services" role="group" aria-label="Métiers">
            <div className="fp-tete">
              <strong>Métiers</strong>
              <span className="fp-regle">
                Plusieurs métiers cochés = <b>ou</b> ; l’ensemble se combine en <b>et</b> avec les
                autres filtres
              </span>
            </div>

            <div className="fp-recherche">
              <Search className="ico-sm" />
              <input
                autoFocus
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="isolation, pompe à chaleur, clim…"
                aria-label="Chercher un métier"
              />
              {recherche && (
                <button className="btn ghost sm" onClick={() => setRecherche("")} aria-label="Vider">
                  <X className="ico-sm" />
                </button>
              )}
            </div>

            <div className="fp-liste">
              {listes.coches.map((s) => (
                <Ligne key={s.service} service={s.service} n={s.n} />
              ))}
              {listes.coches.length > 0 && listes.autres.length > 0 && <div className="fp-sep" />}
              {listes.autres.map((s) => (
                <Ligne key={s.service} service={s.service} n={s.n} />
              ))}
              {listes.total === 0 && listes.coches.length === 0 && (
                <p className="fp-vide">
                  Aucun métier ne contient «&nbsp;{recherche}&nbsp;» dans ce tableau.
                </p>
              )}
            </div>

            <div className="fp-pied">
              <button
                className="btn ghost sm"
                disabled={choisis.size === 0}
                onClick={() => setChoisis(new Set())}
              >
                Décocher tout
              </button>
              <span className="fp-reste">
                {tous.length} métier{tous.length > 1 ? "s" : ""} dans ce tableau
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
