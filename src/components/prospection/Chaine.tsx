"use client";
// La chaîne — où en est CHAQUE fiche d'un lot, et qui doit agir.
//
// LE GRIEF, MOT POUR MOT : « j'en crée [des lots] mais parfois après ça change,
// le lissage et enrichissement les font faire partie d'un autre groupe etc donc
// je sais pas trop comment avoir un visu sur ça. Marketing pipeline c'est bien
// pour les filtres mais quand ça commence à grandir c'est un peu dur d'avoir un
// vrai visu. »
//
// CE QUI MANQUAIT N'ÉTAIT PAS UN FILTRE DE PLUS. L'écran Lots compte des PIÈCES
// par axe — « 206 sans constat » — et une fiche à qui il manque trois pièces y
// apparaît trois fois. On ne peut donc pas dire « ce groupe-là, on le met en
// S1 », parce que « ce groupe-là » n'existe pas : les colonnes se recouvrent.
// Ici une fiche est dans UN groupe et un seul, celui de son prochain geste, et
// les quinze groupes somment exactement à l'effectif du lot.
//
// LE LOT NE BOUGE PAS, LES GROUPES BOUGENT. C'est toute la doctrine du projet :
// le lot est figé — c'est ce qui rend une mesure reproductible — et l'état de
// ses fiches se recalcule à chaque ouverture. Une fiche qui passe de « à
// enrichir » à « à fabriquer » est la PREUVE que l'enrichissement a marché ;
// c'est ce mouvement qu'on vient regarder.
//
// TROIS VOIES, PAS QUINZE COLONNES. Trouver, fabriquer, démarcher : quinze
// compteurs côte à côte se lisent comme un tableau de bord d'avion. Rangés en
// trois temps, ils se lisent comme un plan de production.
//
// LA COLONNE QUI COMPTE EST « QUI ». Onze des trente-trois bots sont des
// scripts locaux, et ce n'est pas une dette : Playwright, un profil Chrome, des
// CAPTCHA. Un écran qui affiche « 156 à faire » sans dire que rien ne les fera
// avancer avant la prochaine séance au bureau ment par omission.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Hand, Laptop, Link2, PauseOctagon, RefreshCw, Route, Workflow } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import {
  GROUPES,
  groupe,
  type Acteur,
  type CleGroupe,
  type Voie,
} from "@/lib/chaine/groupes";
import "./lem-skin.css";

const nombre = (n: number): string => n.toLocaleString("fr-FR");

interface FicheApercu {
  id: number;
  nom: string | null;
  ville: string | null;
  proprietaire: string | null;
  manquants: string[];
}

interface GroupeCompte {
  cle: CleGroupe;
  n: number;
  apercu: FicheApercu[];
}

interface Reponse {
  lot: { id: number; nom: string; note: string | null; creeLe: string };
  total: number;
  tronque: boolean;
  groupes: GroupeCompte[];
  attentes: Record<Acteur, number>;
  presumeParColonne: number;
  misesDeCoteMixtes: number;
}

interface LotBref {
  lotId: number;
  nom: string;
  total: number;
}

/** Les trois temps, dans l'ordre de la chaîne. */
const VOIES: { cle: Voie; titre: string; sous: string }[] = [
  { cle: "trouver", titre: "Trouver", sous: "Savoir à qui on parle, et s'il a déjà un site." },
  { cle: "fabriquer", titre: "Fabriquer", sous: "Avoir quelque chose à lui montrer." },
  { cle: "demarcher", titre: "Démarcher", sous: "Le mettre entre les mains de quelqu'un." },
];

/** Qui agit, en une icône et un mot. C'est la colonne qu'on lit en premier. */
const ACTEURS: Record<Acteur, { mot: string; Icone: typeof Bot; aide: string }> = {
  auto: { mot: "Tout seul", Icone: Bot, aide: "Un cron ou un trigger s'en charge. Rien à faire." },
  serveur: { mot: "Serveur", Icone: Workflow, aide: "Un geste existe, faisable depuis un téléphone." },
  local: { mot: "Au bureau", Icone: Laptop, aide: "Exige la machine du bureau : Playwright, Chromium, un profil Chrome." },
  humain: { mot: "À l'œil", Icone: Hand, aide: "Aucun bot ne tranchera à notre place." },
  rien: { mot: "—", Icone: Bot, aide: "Terminé, ou hors chaîne." },
};

/**
 * Une carte de groupe. Le compte d'abord, gros ; le geste ensuite ; l'aperçu
 * des fiches en dernier, replié.
 *
 * UN GROUPE VIDE RESTE AFFICHÉ, en gris. Le faire disparaître effacerait la
 * preuve que le travail a marché — c'est justement la colonne qui vient de se
 * vider qu'on veut voir.
 */
function CarteGroupe({ compte, total }: { compte: GroupeCompte; total: number }) {
  const [ouvert, setOuvert] = useState(false);
  const g = groupe(compte.cle);
  const acteur = ACTEURS[g.qui];
  const part = total > 0 ? Math.round((compte.n / total) * 100) : 0;

  return (
    <div className="ch-carte" data-vide={compte.n === 0 ? "1" : undefined} data-qui={g.qui}>
      <div className="ch-tete">
        <span className="ch-nom" title={g.aide}>
          {g.titre}
        </span>
        <span className="ch-qui" title={acteur.aide}>
          <acteur.Icone size={12} aria-hidden="true" /> {acteur.mot}
        </span>
      </div>

      <div className="ch-compte">
        <strong>{nombre(compte.n)}</strong>
        <span className="ch-part">{part} %</span>
      </div>
      <span className="ch-jauge" aria-hidden="true">
        <i style={{ width: `${part}%` }} />
      </span>

      {g.geste && compte.n > 0 && <div className="ch-geste">{g.geste}</div>}

      {compte.n > 0 && (
        <button type="button" className="ch-replie" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? "Masquer" : `Voir ${Math.min(compte.n, compte.apercu.length)} fiches`}
        </button>
      )}

      {ouvert && (
        <ul className="ch-liste">
          {compte.apercu.map((f) => (
            <li key={f.id}>
              <Link className="lem-lien" href={`/entreprises/${f.id}`}>
                {f.nom ?? `Fiche ${f.id}`}
              </Link>
              {f.ville && <span className="ch-ville">{f.ville}</span>}
              {/* Ce qui manque, en clair : « il manque la ville SEO » est
                  actionnable, « fiche incomplète » ne l'est pas. */}
              {f.manquants.length > 0 && (
                <span className="ch-manque">{f.manquants.join(", ")}</span>
              )}
            </li>
          ))}
          {compte.n > compte.apercu.length && (
            <li className="ch-reste">
              et {nombre(compte.n - compte.apercu.length)} autres — le détail complet se filtre
              dans le{" "}
              <Link className="lem-lien" href="/marketing-pipeline">
                pipeline marketing
              </Link>
              .
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Chaine() {
  const [lots, setLots] = useState<LotBref[] | null>(null);
  const [lotId, setLotId] = useState<number | null>(null);
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  // Les lots d'abord : sans eux l'écran n'a rien à cadrer. On retient le
  // premier, qui est le plus avancé — `parAvancement` a déjà trié côté API.
  useEffect(() => {
    void (async () => {
      const res = await authedFetch("/api/entreprises/lots");
      const corps = (await res.json().catch(() => ({}))) as {
        lots?: { lotId: number; nom: string; total: number }[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setErreur(corps?.message || corps?.error || "Lecture des lots impossible.");
        setLots([]);
        return;
      }
      const liste = (corps.lots ?? []).map((l) => ({ lotId: l.lotId, nom: l.nom, total: l.total }));
      setLots(liste);
      setLotId((cur) => cur ?? liste[0]?.lotId ?? null);
    })();
  }, []);

  const charger = useCallback(async (id: number) => {
    setChargement(true);
    try {
      const res = await authedFetch(`/api/chaine?lot=${id}`);
      const corps = (await res.json().catch(() => ({}))) as Partial<Reponse> & {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setErreur(corps?.message || corps?.error || "Lecture impossible.");
        setDonnees(null);
        return;
      }
      setErreur(null);
      setDonnees(corps as Reponse);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (lotId != null) void charger(lotId);
  }, [lotId, charger]);

  const parVoie = useMemo(() => {
    const out = new Map<Voie, GroupeCompte[]>(VOIES.map((v) => [v.cle, []]));
    for (const c of donnees?.groupes ?? []) {
      out.get(groupe(c.cle).voie)?.push(c);
    }
    // L'ordre de `GROUPES` est l'ordre de la chaîne : on le conserve dans
    // chaque voie plutôt que de trier par effectif, sinon le plan de
    // production se réorganise à chaque rafraîchissement.
    for (const [, liste] of out) {
      liste.sort(
        (a, b) =>
          GROUPES.findIndex((g) => g.cle === a.cle) - GROUPES.findIndex((g) => g.cle === b.cle),
      );
    }
    return out;
  }, [donnees]);

  return (
    <div className="lem-skin lem-page">
      <div className="lem-entete">
        <div>
          <h1 className="lem-titre">
            <Route size={19} aria-hidden="true" /> La chaîne
          </h1>
          <p className="lem-sous">
            Le lot ne bouge pas, ses fiches si. Chaque fiche est dans un groupe et un seul —
            celui de son prochain geste — et les groupes somment à l&apos;effectif du lot.
          </p>
        </div>
        <div className="lots-actions">
          {lots && lots.length > 0 && (
            <select
              className="lem-champ"
              value={lotId ?? ""}
              onChange={(e) => setLotId(Number(e.target.value))}
            >
              {lots.map((l) => (
                <option key={l.lotId} value={l.lotId}>
                  {l.nom} — {nombre(l.total)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="lem-btn"
            onClick={() => lotId != null && void charger(lotId)}
            disabled={chargement || lotId == null}
          >
            <RefreshCw size={14} aria-hidden="true" /> Rafraîchir
          </button>
        </div>
      </div>

      {erreur && <div className="lem-alerte">{erreur}</div>}

      {lots !== null && lots.length === 0 && !erreur && (
        <div className="lem-vide">
          <p>
            <strong>Aucun lot à suivre.</strong>
          </p>
          <p>
            Un lot se fige depuis l&apos;
            <Link className="lem-lien" href="/entreprises/explorateur">
              explorateur
            </Link>{" "}
            ou depuis l&apos;
            <Link className="lem-lien" href="/atelier">
              atelier
            </Link>
            . C&apos;est lui qu&apos;on mesure : un segment reste une requête vivante.
          </p>
        </div>
      )}

      {donnees && (
        <>
          {/* CE QUI ATTEND QUOI, en une ligne. La somme des trois premiers dit
              ce qui reste à faire ; le détail dit où ça coince réellement. */}
          <div className="ch-attentes">
            {(["serveur", "local", "humain", "auto"] as Acteur[]).map((a) => {
              const acteur = ACTEURS[a];
              return (
                <span key={a} className="ch-attente" data-qui={a} title={acteur.aide}>
                  <acteur.Icone size={13} aria-hidden="true" />
                  <strong>{nombre(donnees.attentes[a] ?? 0)}</strong> {acteur.mot.toLowerCase()}
                </span>
              );
            })}
            <span className="ch-attente" data-qui="rien">
              <strong>{nombre(donnees.total)}</strong> au total
            </span>
          </div>

          {donnees.misesDeCoteMixtes > 0 && (
            <p className="ch-note">
              <PauseOctagon size={13} aria-hidden="true" />{" "}
              <strong>{nombre(donnees.misesDeCoteMixtes)}</strong> des fiches mises de côté font{" "}
              <em>aussi</em> un métier qu&apos;on vend. Elles sortent quand même — un site démo sans
              la page de leur service principal est pire qu&apos;aucune démo — et ce sont elles qui
              reviendront en premier le jour où le métier sera rouvert dans les{" "}
              <Link className="lem-lien" href="/settings">
                Paramètres
              </Link>
              .
            </p>
          )}

          {donnees.presumeParColonne > 0 && (
            <p className="ch-note">
              <Link2 size={13} aria-hidden="true" />{" "}
              <strong>{nombre(donnees.presumeParColonne)}</strong> de ces fiches n&apos;ont un site
              que parce que le CRM porte une URL — <em>personne ne l&apos;a vérifiée</em>. Elles
              avancent quand même : l&apos;enrichissement n&apos;a besoin que d&apos;une URL et dit
              quand l&apos;hôte ne répond pas. Mais un constat explicite l&apos;emporte toujours sur
              une colonne.
            </p>
          )}

          {donnees.tronque && (
            <div className="lem-alerte">
              Ce lot dépasse le plafond de lecture : les comptes ci-dessous sont partiels.
            </div>
          )}

          {VOIES.map((v) => (
            <section key={v.cle} className="ch-voie">
              <h2 className="ch-voie-titre">
                {v.titre}
                <span className="ch-voie-sous">{v.sous}</span>
              </h2>
              <div className="ch-grille">
                {(parVoie.get(v.cle) ?? []).map((c) => (
                  <CarteGroupe key={c.cle} compte={c} total={donnees.total} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {!donnees && !erreur && lotId != null && <div className="lem-vide">Lecture du lot…</div>}
    </div>
  );
}
