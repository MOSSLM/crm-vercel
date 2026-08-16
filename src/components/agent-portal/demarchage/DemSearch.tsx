"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./DemIcon";
import { useRechercheEntreprises } from "@/hooks/useRechercheEntreprises";
import type { CompanySearchResult } from "@/lib/entreprises/colonnes";

/**
 * Retrouver une entreprise QUAND ELLE RAPPELLE.
 *
 * L'écran de démarchage est piloté par une tâche : on y arrive par la file du
 * jour, et une entreprise sans tâche en file était donc inatteignable. Or celle
 * qui rappelle est exactement celle qu'on n'avait pas prévu d'appeler
 * aujourd'hui — sinon elle serait déjà sous les yeux.
 *
 * La recherche part en base sur les ~61 000 fiches (`/api/entreprises/recherche`,
 * mesurée à 19 ms) : nom, ville, adresse en trigramme, et le TÉLÉPHONE en
 * chiffres seuls dès 4 chiffres — « 06 12 34 » retrouve « +33 6 12 34 56 78 ».
 * C'est le seul champ dont on dispose vraiment quand un numéro inconnu s'affiche.
 *
 * TOUT SE FAIT AU CLAVIER, parce que le téléphone sonne pendant ce temps-là :
 * « / » ouvre (le raccourci est écrit dans le rail), on tape, ↑↓ choisit,
 * Entrée prend le premier résultat, Échap revient à la file. La souris reste
 * possible, elle n'est jamais nécessaire.
 */

/** Au-delà, la liste dépasse l'écran et l'œil ne la balaie plus d'un coup. */
const MAX_RESULTATS = 12;

const nomDe = (e: CompanySearchResult) => e.name?.trim() || `Fiche #${e.id}`;

export function DemSearch({
  ouvert,
  onFermer,
  onChoisir,
  estEnFile = () => false,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onChoisir: (entreprise: CompanySearchResult) => void;
  /**
   * Cette entreprise a-t-elle une tâche dans la file chargée ? Sert uniquement
   * à annoncer où l'on va atterrir : sur sa tâche, ou sur sa seule fiche.
   */
  estEnFile?: (entrepriseId: number) => boolean;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const champRef = useRef<HTMLInputElement>(null);

  const { resultats, chargement } = useRechercheEntreprises(q, {
    actif: ouvert,
    limit: MAX_RESULTATS,
  });

  // À l'ouverture : champ vide, curseur dedans. On ne rouvre jamais sur la
  // recherche d'avant — l'appel suivant n'est pas le même appel.
  useEffect(() => {
    if (!ouvert) return;
    setQ("");
    setIdx(0);
    champRef.current?.focus();
  }, [ouvert]);

  // La sélection retombe en tête à chaque nouvelle liste : garder le 4e rang
  // d'une liste qui vient d'en rendre deux ferait valider une fiche au hasard.
  useEffect(() => setIdx(0), [resultats]);

  if (!ouvert) return null;

  const terme = q.trim();
  const choisir = (e: CompanySearchResult | undefined) => {
    if (!e) return;
    onChoisir(e);
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choisir(resultats[idx] ?? resultats[0]);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Sans ça, la flèche déplace le curseur DANS le champ au lieu de
      // descendre la liste : on croit naviguer, on ne navigue pas.
      e.preventDefault();
      if (resultats.length === 0) return;
      const pas = e.key === "ArrowDown" ? 1 : -1;
      setIdx((i) => (i + pas + resultats.length) % resultats.length);
    }
  };

  return (
    <div
      className="dm-rech"
      role="dialog"
      aria-modal="true"
      aria-label="Rechercher une entreprise"
      onMouseDown={(e) => {
        // Le fond ferme, l'intérieur non — `onMouseDown` et pas `onClick` :
        // un glissé de sélection qui finit sur le fond ne doit pas fermer.
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="pan">
        <div className="hd">
          <Icon name="phone" className="ico-sm" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={auClavier}
            placeholder="Nom, ville ou numéro de téléphone…"
            aria-label="Nom, ville ou numéro de téléphone"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" className="btn ghost sm" onClick={onFermer}>
            Échap
          </button>
        </div>

        <div className="rs" role="listbox" aria-label="Entreprises trouvées">
          {terme === "" && (
            <div className="vide">
              <b>Qui appelle ?</b>
              Le numéro se cherche en chiffres seuls, dès 4 chiffres — les quatre derniers suffisent.
              Le nom et la ville cherchent sur tout le fichier, prospects non qualifiés compris.
            </div>
          )}

          {terme !== "" && resultats.length === 0 && chargement && <div className="vide">Recherche…</div>}

          {/* « Rien trouvé » qui dit quoi faire : muet, il laisse penser que la
              fiche n'existe pas, alors que neuf fois sur dix c'est la frappe
              qui ne colle pas (indicatif +33, forme juridique, accent). */}
          {terme !== "" && resultats.length === 0 && !chargement && (
            <div className="vide">
              <b>Rien pour « {terme} »</b>
              Pour un numéro : tape seulement les 4 à 6 derniers chiffres, sans indicatif ni espaces.
              Pour un nom : sans la forme juridique (« SARL », « EURL ») et sans accent si tu hésites.
              À défaut, cherche la ville. Si la fiche n&apos;existe vraiment pas encore, elle se crée
              dans{" "}
              <a href="/espace-agent/entreprises" target="_blank" rel="noreferrer">
                Entreprises
              </a>
              .
            </div>
          )}

          {resultats.map((e, i) => {
            const enFile = estEnFile(e.id);
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={i === idx}
                className="r"
                onMouseEnter={() => setIdx(i)}
                onClick={() => choisir(e)}
              >
                <span className="bd">
                  <span className="n">
                    {nomDe(e)}
                    {e.qualifie && <i className="q" title="fiche qualifiée" />}
                  </span>
                  <span className="m">
                    {[e.code_postal, e.ville].filter(Boolean).join(" ") || "ville inconnue"}
                    {e.telephone ? ` · ${e.telephone}` : ""}
                  </span>
                </span>
                {/* Ce qui va se passer en appuyant sur Entrée, écrit d'avance :
                    on atterrit sur sa tâche du jour, ou sur sa seule fiche. */}
                <span className="tg">{enFile ? "en file" : "fiche"}</span>
              </button>
            );
          })}
        </div>

        <div className="ft">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> choisir
          </span>
          <span>
            <kbd>Entrée</kbd> ouvrir
          </span>
          <span>
            <kbd>Échap</kbd> revenir à la file
          </span>
        </div>
      </div>
    </div>
  );
}
