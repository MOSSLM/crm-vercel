"use client";

/**
 * LA LÉGENDE — ce que veulent dire les couleurs, les traits et les étiquettes.
 *
 * POURQUOI ELLE EXISTE. Une ligne de file porte jusqu'à neuf marques : un
 * liseré à droite, un bord et un fond à gauche, une flamme, et cinq ou six
 * étiquettes. Chacune a été ajoutée pour une bonne raison et chacune se défend
 * seule ; ensemble elles forment un alphabet que personne n'a appris. Le grief
 * est arrivé mot pour mot — « je comprends pas ». Une infobulle par marque ne
 * suffit pas : elle répond quand on sait déjà quoi survoler.
 *
 * ⚠️ ELLE NE REDÉCRIT RIEN, ELLE MONTRE LES VRAIES MARQUES. Chaque échantillon
 * ci-dessous est le MÊME élément que celui de la ligne — mêmes classes, mêmes
 * `data-*` — donc la même règle CSS le peint. Une légende qui recopierait les
 * couleurs en dur mentirait au premier changement de teinte, et une légende qui
 * ment est pire que pas de légende : on lui fait confiance.
 *
 * ⚠️ ET ELLE LIT LES MÊMES CONSTANTES QUE LA LIGNE. Les libellés viennent de
 * `ETAT_DEMO_TAG`, `ETAT_SITE_TAG`, `SIGNAL_TAG`, `COHORTE_INFO` — les objets
 * que `DemRail` affiche. Un état ajouté à l'un des `Record` apparaît ici sans
 * qu'on y touche ; c'est ce que tient `DemLegende.test.tsx`.
 */

import { useState, type ReactNode } from "react";
import { Icon } from "./DemIcon";
import { useFermetureAuClicDehors } from "./fermeture";
import { COHORTE_INFO, COHORTE_ORDER } from "./cohortes";
import {
  ETAT_DEMO_AIDE,
  ETAT_DEMO_ORDER,
  ETAT_DEMO_TAG,
  type EtatDemo,
} from "@/lib/agent-portal/etat-demo";
import {
  ETAT_SITE_AIDE,
  ETAT_SITE_ORDER,
  ETAT_SITE_TAG,
} from "@/lib/agent-portal/etat-site";
import { SIGNAL_AIDE, SIGNAL_ORDER, SIGNAL_TAG } from "@/lib/agent-portal/demarchage-buckets";

/** L'étiquette de démo, telle que la ligne l'écrit. `null` pour « aucune ». */
export function TagDemo({ etat }: { etat: EtatDemo }) {
  const tag = ETAT_DEMO_TAG[etat];
  if (!tag) return null;
  return (
    <span className="st demo" data-demo={etat} title={ETAT_DEMO_AIDE[etat]}>
      <Icon name={etat === "prete" ? "check" : "tools"} className="ico-xs" />
      {tag}
    </span>
  );
}

/** Une entrée : ce qu'on voit à gauche, ce que ça veut dire à droite. */
function L({ vu, children }: { vu: ReactNode; children: ReactNode }) {
  return (
    <div className="r">
      <span className="v">{vu}</span>
      <span className="d">{children}</span>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="g">
      <h4 className="lb">{titre}</h4>
      {children}
    </section>
  );
}

export function DemLegende() {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermetureAuClicDehors(ouvert, () => setOuvert(false));

  return (
    <div className="dm-leg-w" ref={ref}>
      <button
        type="button"
        className="dm-chip leg"
        aria-expanded={ouvert}
        title="Ce que veulent dire les couleurs et les étiquettes d'une ligne"
        onClick={() => setOuvert(!ouvert)}
      >
        <Icon name="info" className="ico-xs" />
        Légende
      </button>

      {ouvert && (
        <div className="dm-leg" role="dialog" aria-label="Légende de la file">
          <p className="hd">Ce que porte une ligne, marque par marque.</p>

          {/* EN TÊTE, parce que c'est la question qui décide de l'appel : ai-je
              quelque chose à lui montrer ? Le trait de droite le dit sur la
              colonne entière, l'étiquette le dit en toutes lettres. */}
          <Bloc titre="Notre démo — le trait au bord droit">
            {ETAT_DEMO_ORDER.map((e) => (
              <L
                key={e}
                vu={
                  <>
                    <span className="sw" data-demo={e} />
                    <TagDemo etat={e} />
                    {/* L'état muet a quand même une entrée : sans elle, le trait
                        gris de la moitié de la file resterait sans explication —
                        et c'est justement celui qu'on ne peut pas survoler pour
                        comprendre, puisqu'il ne porte aucun mot. */}
                    {!ETAT_DEMO_TAG[e] && <em className="muet">aucune étiquette</em>}
                  </>
                }
              >
                {ETAT_DEMO_AIDE[e]}
              </L>
            ))}
            <p className="nb">
              L&apos;état sans étiquette est le plus courant : la moitié de la file n&apos;a pas
              encore de démo. Seul le trait gris le dit.
            </p>
          </Bloc>

          {/* L'AUTRE question, et celle qu'on confond avec la première. */}
          <Bloc titre="Son site à lui — l'étiquette">
            {ETAT_SITE_ORDER.map((e) => (
              <L key={e} vu={<span className="st site" data-site={e}>{ETAT_SITE_TAG[e]}</span>}>
                {ETAT_SITE_AIDE[e]}
              </L>
            ))}
            <p className="nb">
              À ne pas confondre avec la démo : celle-ci dit ce que NOUS avons à lui montrer,
              celle-là ce que LUI a déjà en ligne. « a un site » ne s&apos;affiche que face à une
              cohorte qui prétend l&apos;inverse.
            </p>
          </Bloc>

          <Bloc titre="Ce qui sort du rythme">
            {SIGNAL_ORDER.map((s) => (
              <L key={s} vu={<span className="st sig" data-sig={s}>{SIGNAL_TAG[s]}</span>}>
                {SIGNAL_AIDE[s]}
              </L>
            ))}
            <L vu={<span className="sw fond" />}>
              Fond vert et bord gauche vert : la discussion est ouverte.
            </L>
            <L vu={<span className="fl">🔥</span>}>
              La flamme reprend la chaleur mesurée. Survolez-la : elle dit d&apos;où elle vient.
            </L>
          </Bloc>

          <Bloc titre="D'où vient le prospect">
            {COHORTE_ORDER.map((c) => (
              <L key={c} vu={<span className="st coh" data-coh={c}>{COHORTE_INFO[c].court}</span>}>
                {COHORTE_INFO[c].argument}
              </L>
            ))}
            {/* LE CAS QUI FAISAIT DIRE « JE COMPRENDS PAS » : deux étiquettes
                voisines qui s'opposent. Elle a sa propre entrée parce que c'est
                la combinaison la plus fréquente de la file, pas une curiosité —
                70 lignes sur 74 au 03/09/2026. */}
            <L
              vu={
                <span className="st coh" data-coh="B_sans_site" data-perime="1">
                  {COHORTE_INFO.B_sans_site.court}
                </span>
              }
            >
              Contour au lieu d&apos;un fond : le classement est DÉMENTI par la fiche du jour.
              C&apos;est pour ça qu&apos;on voit parfois « a un site » et « classé sans site » sur la
              même ligne — l&apos;un est d&apos;aujourd&apos;hui, l&apos;autre du jour du
              démarchage. C&apos;est l&apos;état du jour qui fait foi.
            </L>
            <p className="nb">
              Le classement est figé le jour du démarchage et jamais repris ; l&apos;enrichissement,
              lui, continue de tourner et finit par trouver le site. Il sert encore à savoir quel
              document part — l&apos;audit ou le site démo — mais il ne dit plus l&apos;état du
              site.
            </p>
          </Bloc>

          <Bloc titre="Le reste des étiquettes">
            <L vu={<span className="st mob">06/07</span>}>
              Joignable sur un mobile — c&apos;est la condition d&apos;entrée de WhatsApp.
            </L>
            <L vu={<span className="st froid">à froid</span>}>
              Aucune séquence derrière : c&apos;est un premier contact, pas une relance.
            </L>
            <L vu={<span className="st stp">étape 3/8</span>}>Où il en est de sa séquence.</L>
            <L vu={<span className="st cote">de côté</span>}>
              Rangé volontairement : il revient de lui-même à la date choisie.
            </L>
            <L vu={<span className="st late">échéance passée</span>}>
              Dû avant aujourd&apos;hui — la relance a pris du retard.
            </L>
            <L vu={<span className="st plus-tard">lun. 8</span>}>
              Dû plus tard : déplié depuis « prévu plus tard », ce n&apos;est pas du travail du
              jour.
            </L>
          </Bloc>
        </div>
      )}
    </div>
  );
}
