"use client";

/**
 * L'atelier — faire avancer le travail depuis un téléphone.
 *
 * ── CE QU'IL EST, ET CE QU'IL N'EST PAS ──────────────────────────────────
 * Ce n'est pas une version mobile du CRM : c'est le poste de commande des
 * traitements de MASSE, ceux qu'on lance sur une population et qui tournent
 * sans nous. Choisir une population, la figer, lancer la file, la voir avancer.
 * Le travail fiche par fiche reste dans le pipeline marketing, où il a sa place.
 *
 * ── L'HONNÊTETÉ SUR CE QUI NE PEUT PAS BOUGER ────────────────────────────
 * Onze des trente-trois bots du registre sont des scripts locaux : Playwright,
 * un profil Chrome persistant, des CAPTCHA qui ne se résolvent qu'à l'œil, et
 * Chromium qui ne tient pas dans une fonction Vercel. Ce n'est pas une dette à
 * rembourser, c'est la raison pour laquelle ils fonctionnent.
 *
 * L'atelier ne prétend donc pas les déplacer. Il les COMPTE, et le dit en
 * clair : ce qui part maintenant, et ce qui attendra le bureau. C'est ce qui
 * transforme une absence en avance prise — on rentre en sachant exactement quoi
 * lancer, au lieu de découvrir la file en ouvrant son portable.
 *
 * ── LE POUCE COMMANDE TOUT ───────────────────────────────────────────────
 * Aucun tableau : des cartes. Toutes les cibles font au moins 44 px. La page
 * ouvre sur « créer un lot » replié, parce que l'usage le plus fréquent est de
 * regarder où en sont les lots, pas d'en créer un de plus.
 *
 * ── LA DA EST CELLE DE LEMLIST, ET ELLE N'EST PAS RÉINVENTÉE ICI ─────────
 * L'écran portait les composants génériques du CRM (`Card`, `Button`,
 * `Badge`). Il porte maintenant `lem-skin` — la charte relevée le 19/08/2026
 * sur lemlist.com en lisant les styles CALCULÉS, pas à l'œil, et déjà en place
 * sur tout l'espace Prospection dont l'atelier commande les lots.
 *
 * ON N'A DONC PAS FABRIQUÉ UN DOUZIÈME SKIN. Trois formes manquaient — une
 * jauge, un bouton pleine largeur, un en-tête qui se replie — parce que lemlist
 * n'a pas d'écran de traitement de masse : elles ont été ajoutées à `lem-skin`
 * avec ses jetons, pas à côté. Un skin de plus serait un skin de plus à faire
 * converger le jour du re-skin global.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Laptop,
  Loader2,
  FileText,
  PackagePlus,
  Play,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { authedFetch } from "@/utils/authedFetch";
import type { BilanTick } from "@/lib/lissage/moteur";
import { CreerLot } from "./CreerLot";
import {
  AXES,
  avancement,
  manque,
  prochainGeste,
  type Couverture,
} from "@/lib/lots/couverture";
import {
  MANQUES,
  logosAPrendre,
  partPrete,
  type PretDemo,
} from "@/lib/lots/pret-demo";
import "@/components/prospection/lem-skin.css";

type AttenteLissage = {
  serveur: number;
  local: number;
  humain: number;
  passesOuvertes: number;
};

type Reponse = { lots: Couverture[]; pretDemo: PretDemo[]; lissage: AttenteLissage | null };

const nb = (n: number) => n.toLocaleString("fr-FR");

/** La barre d'avancement d'un lot. Sept axes résumés en une longueur. */
function Jauge({ part }: { part: number }) {
  return (
    <div className="lem-jauge">
      <i style={{ width: `${Math.round(part * 100)}%` }} />
    </div>
  );
}

/**
 * « Prêtes pour la démo » — le bloc qui répond à « combien puis-je lancer en
 * fabrication maintenant ».
 *
 * IL EST DISTINCT DES SEPT AXES, et ce n'est pas une redite. Les axes comptent
 * des PIÈCES (SIRET, constat, démo…) ; celui-ci compte des fiches FABRICABLES.
 * Une entreprise peut avoir toutes ses pièces et rester impossible à mettre en
 * site faute de code postal — les deux blocs ne se déduisent pas l'un de l'autre.
 *
 * LE LOGO EST SOUS UNE LIGNE DE SÉPARATION, exprès : il ne conditionne rien
 * (`hydrate-logo` compose le nom quand il manque). Le mêler aux causes de
 * blocage ferait croire qu'il en est une.
 */
function BlocPretDemo({ pret }: { pret: PretDemo }) {
  const aPrendre = logosAPrendre(pret);

  return (
    <div
      className="lem-carte"
      style={{ background: "var(--lem-bleu-pale)", borderColor: "transparent", padding: "10px 12px" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14 }}>
          <b>{nb(pret.pretes)}</b> <span className="lem-second">prêtes pour la démo</span>
        </span>
        <span className="lem-second" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(partPrete(pret) * 100)} %
        </span>
      </div>

      {/* Les causes, par effort croissant. Une cause à zéro ne se rend pas. */}
      {pret.manques.length > 0 && (
        <ul className="lem-legende">
          {pret.manques.map((m) => (
            <li key={m.cle} title={MANQUES[m.cle].geste}>
              <span className="l">{MANQUES[m.cle].libelle}</span>
              <b>{nb(m.nombre)}</b>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--lem-bord)" }}>
        <div
          style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}
        >
          <span className="lem-second" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ImageIcon size={13} />
            Logo
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {nb(pret.logo.avec)} sur {nb(pret.pretes)}
          </span>
        </div>

        {/* LA DISTINCTION QUI COMPTE : un logo qu'on peut aller chercher n'est
            pas un logo qui n'existe pas. Les additionner ferait passer une
            impossibilité pour du retard. */}
        {aPrendre > 0 && (
          <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--lem-attention)" }}>
            {nb(aPrendre)} sans logo en ont pourtant un{" "}
            {pret.logo.surReseau > 0 ? "sur leur site ou leur page" : "sur leur site"} — à prendre.
          </p>
        )}
        {pret.logo.introuvable > 0 && (
          <p className="lem-second" style={{ margin: "3px 0 0", fontSize: 11.5 }}>
            {nb(pret.logo.introuvable)} n&apos;ont aucune URL : rien à aller chercher, l&apos;en-tête
            composera leur nom.
          </p>
        )}
      </div>
    </div>
  );
}

function CarteLot({
  lot,
  pret,
  onLance,
}: {
  lot: Couverture;
  pret: PretDemo | undefined;
  onLance: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [lancement, setLancement] = useState(false);
  const [plaquettes, setPlaquettes] = useState(false);
  const geste = prochainGeste(lot);
  const part = avancement(lot);

  /**
   * Lance une passe de lissage SUR CE LOT. Aucun identifiant ne circule : la
   * route lit `lots_entreprises` elle-même (troisième porte de
   * `/api/lissage/passes`). C'est ce qui rend le geste possible en 4G, quelle
   * que soit la taille du lot.
   */
  const lancerLissage = async () => {
    setLancement(true);
    try {
      const r = await authedFetch("/api/lissage/passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.lotId }),
      });
      const corps = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(corps.message ?? corps.error ?? `Échec (${r.status})`));

      const ajoutes = Number(corps.ajoutes ?? 0);
      const dispo = Number(corps.total_disponible ?? ajoutes);
      toast.success(`Passe créée — ${nb(ajoutes)} fiches en file`, {
        description:
          dispo > ajoutes
            ? `Le lot en compte ${nb(dispo)} : le reste attendra une passe suivante.`
            : undefined,
      });
      onLance();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Passe impossible");
    } finally {
      setLancement(false);
    }
  };

  /**
   * Prépare les plaquettes du lot — le LIEN, pas le PDF. Le PDF passe par
   * Puppeteer et reste au bureau ; le lien, lui, relit les prix du jour à
   * chaque ouverture, ce qu'un fichier ne fait pas.
   */
  const preparerPlaquettes = async () => {
    setPlaquettes(true);
    try {
      const r = await authedFetch("/api/atelier/plaquettes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.lotId }),
      });
      const corps = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(corps.error ?? `Échec (${r.status})`));

      const preparees = Number(corps.preparees ?? 0);
      const restantes = Number(corps.restantes ?? 0);
      if (preparees === 0 && restantes === 0) {
        toast.info("Toutes les plaquettes de ce lot sont déjà prêtes");
      } else {
        toast.success(`${nb(preparees)} plaquette${preparees > 1 ? "s" : ""} préparée${preparees > 1 ? "s" : ""}`, {
          description: restantes > 0 ? `${nb(restantes)} restent à préparer.` : undefined,
        });
      }
      onLance();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Préparation impossible");
    } finally {
      setPlaquettes(false);
    }
  };

  return (
    <div className="lem-carte">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="lem-repli"
        aria-expanded={ouvert}
      >
        <span className="corps">
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="nom" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lot.nom}
            </span>
            <span className="lem-second" style={{ fontSize: 12, flexShrink: 0 }}>
              {nb(lot.total)}
            </span>
          </span>
          <Jauge part={part} />
          <span
            className="lem-second"
            style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {geste ? `Prochain : ${geste.geste}` : "Complet sur les sept axes"}
          </span>
        </span>
        {ouvert ? (
          <ChevronUp size={16} className="chevron" />
        ) : (
          <ChevronDown size={16} className="chevron" />
        )}
      </button>

      {ouvert && (
        <div className="lem-replie">
          {pret && <BlocPretDemo pret={pret} />}

          {/* Les sept axes, dans l'ordre du plan — c'est cet ordre qui permet de
              désigner LE prochain geste plutôt que d'afficher sept trous. */}
          <ul className="lem-legende">
            {AXES.map((axe) => {
              const trou = manque(lot, axe.cle);
              return (
                <li key={axe.cle}>
                  <span className="l" style={trou === 0 ? { color: "var(--lem-gris-2)" } : undefined}>
                    {axe.colonne}
                  </span>
                  <b className="lem-second">{trou === 0 ? "complet" : `${nb(trou)} à faire`}</b>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="lem-btn principal large"
            onClick={() => void lancerLissage()}
            disabled={lancement || lot.total === 0}
          >
            {lancement ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Mettre ce lot en file de lissage
          </button>

          <button
            type="button"
            className="lem-btn large"
            onClick={() => void preparerPlaquettes()}
            disabled={plaquettes || lot.total === 0}
          >
            {plaquettes ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Préparer les plaquettes
          </button>

          <p className="lem-second" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.45 }}>
            Le lissage cherche le SIRET, les données publiques et le constat de présence web. Les
            plaquettes préparées ici sont des LIENS — ils relisent les prix du jour à chaque
            ouverture ; le PDF, lui, se fabrique au bureau. Les démos et les audits se font fiche
            par fiche, depuis le pipeline.
          </p>
        </div>
      )}
    </div>
  );
}

export function Atelier() {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [avance, setAvance] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await authedFetch("/api/atelier");
      if (!r.ok) {
        const corps = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(corps.error ?? `Atelier indisponible (${r.status})`));
      }
      setDonnees((await r.json()) as Reponse);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : "Atelier indisponible");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Fait tourner la file côté serveur — le seul bouton qui produise du travail. */
  const avancerLaFile = async () => {
    setAvance(true);
    try {
      const r = await authedFetch("/api/lissage/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const bilan = (await r.json()) as BilanTick;
      if (!r.ok) {
        const e = bilan as unknown as Record<string, unknown>;
        throw new Error(String(e.message ?? e.error ?? `Échec (${r.status})`));
      }

      // UN TICK PREND UN LOT ET S'ARRÊTE — c'est ce qui le rend borné. Sans le
      // reste, « 0 prise » ne se distingue pas de « tout est fini » : on appuie,
      // rien ne bouge, et l'écran se tait. Le moteur rend déjà les deux, on les
      // dit.
      const prises = Number(bilan.prises ?? 0);
      const reste = bilan.reste?.serveur ?? 0;
      if (prises === 0) {
        toast.info(
          reste > 0
            ? `Rien pris ce tour — ${nb(reste)} encore en attente côté serveur`
            : "La file est vide côté serveur",
        );
      } else {
        toast.success(`${nb(prises)} fiches prises, ${nb(Number(bilan.complets ?? 0))} terminées`, {
          description: reste > 0 ? `${nb(reste)} restent à avancer d'ici.` : undefined,
        });
      }

      // Les pannes d'outil sont de VRAIES pannes (le moteur range les réponses
      // ordinaires dans `remarques`) : elles méritent d'être vues.
      for (const panne of (bilan.pannes ?? []).slice(0, 3)) toast.error(panne);

      await charger();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Avancement impossible");
    } finally {
      setAvance(false);
    }
  };

  const lissage = donnees?.lissage ?? null;
  const lots = donnees?.lots ?? [];
  // Joint par lot ici plutôt qu'en base : les deux fonctions répondent à deux
  // questions et n'ont pas forcément les mêmes lignes (un lot dont toutes les
  // fiches sont archivées sort de la préparation, pas de la couverture).
  const parLot = new Map((donnees?.pretDemo ?? []).map((p) => [p.lotId, p]));

  return (
    <div className="lem-skin">
      <div className="lem-page" style={{ display: "grid", gap: 14, maxWidth: 820 }}>
        <header className="lem-entete" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="lem-titre">L&apos;atelier</h1>
            <p className="lem-sous">Choisir une population, la figer, la faire avancer.</p>
          </div>
          <button
            type="button"
            className="lem-btn discret"
            onClick={() => void charger()}
            aria-label="Rafraîchir"
          >
            <RefreshCw size={15} className={chargement ? "animate-spin" : undefined} />
          </button>
        </header>

        {/* ── Ce qui peut partir maintenant, et ce qui attendra le bureau ── */}
        {lissage && (
          <section className="lem-carte" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 13px 10px" }}>
              <strong style={{ fontSize: 15 }}>La file de lissage</strong>
              <div className="lem-meta">
                {lissage.passesOuvertes === 0
                  ? "Aucune passe ouverte."
                  : `${nb(lissage.passesOuvertes)} passe${lissage.passesOuvertes > 1 ? "s" : ""} ouverte${lissage.passesOuvertes > 1 ? "s" : ""}.`}
              </div>
            </div>

            {/* Les trois lieux, côte à côte. C'est la comparaison qui informe :
                « 12 d'ici » ne veut rien dire sans « 340 au bureau ». */}
            <div className="lem-chiffres">
              <div>
                <span className="n">{nb(lissage.serveur)}</span>
                <span className="l">d&apos;ici</span>
              </div>
              <div>
                <span className="n">{nb(lissage.local)}</span>
                <span className="l">
                  <Laptop size={11} style={{ display: "inline", marginRight: 4 }} />
                  au bureau
                </span>
              </div>
              <div>
                <span className="n">{nb(lissage.humain)}</span>
                <span className="l">
                  <UserRound size={11} style={{ display: "inline", marginRight: 4 }} />à
                  l&apos;œil
                </span>
              </div>
            </div>

            <div style={{ padding: "12px 13px", display: "grid", gap: 10 }}>
              <button
                type="button"
                className="lem-btn principal large"
                onClick={() => void avancerLaFile()}
                disabled={avance || lissage.serveur === 0}
              >
                {avance ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {lissage.serveur === 0
                  ? "Rien à avancer d'ici"
                  : `Avancer la file (${nb(lissage.serveur)})`}
              </button>

              {/* L'honnêteté, écrite : ces lignes-là ne partiront pas d'ici, et
                  savoir combien elles sont est ce qui prépare la séance au bureau. */}
              {lissage.local > 0 && (
                <p
                  className="lem-second"
                  style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, margin: 0, lineHeight: 1.45 }}
                >
                  <Laptop size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    {nb(lissage.local)} étape{lissage.local > 1 ? "s" : ""} attend
                    {lissage.local > 1 ? "ent" : ""} la machine : recherche Google pilotée, profil
                    Chrome persistant, CAPTCHA. Au bureau,{" "}
                    <code
                      style={{
                        background: "var(--lem-survol)",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11.5,
                      }}
                    >
                      node scripts/lissage/runner.mjs --boucle
                    </code>{" "}
                    les prend.
                  </span>
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Créer un lot, replié par défaut ── */}
        <section className="lem-carte">
          <button
            type="button"
            onClick={() => setCreation((v) => !v)}
            className="lem-repli"
            aria-expanded={creation}
          >
            <span className="corps">
              <span className="nom" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <PackagePlus size={16} />
                Nouveau lot
              </span>
            </span>
            {creation ? (
              <ChevronUp size={16} className="chevron" />
            ) : (
              <ChevronDown size={16} className="chevron" />
            )}
          </button>
          {creation && (
            <div className="lem-replie">
              <CreerLot
                onLotCree={() => {
                  setCreation(false);
                  void charger();
                }}
              />
            </div>
          )}
        </section>

        {/* ── Les lots ── */}
        <section>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px", fontSize: 15 }}
          >
            <strong>Les lots</strong>
            {lots.length > 0 && (
              <span className="lem-pill" data-ton="neutre">
                {lots.length}
              </span>
            )}
          </div>

          {chargement ? (
            <div className="lem-vide" style={{ padding: "28px 20px" }}>
              <Loader2 size={18} className="animate-spin" style={{ margin: "0 auto" }} />
            </div>
          ) : erreur ? (
            <div className="lem-alerte" data-gravite="bloquant">
              <div>
                <b>Les lots n&apos;ont pas pu être lus.</b> {erreur}
              </div>
            </div>
          ) : lots.length === 0 ? (
            <div className="lem-vide" style={{ padding: "28px 20px" }}>
              <h3>Aucun lot</h3>
              <p>Un lot se fige depuis les filtres, juste au-dessus. C&apos;est une photo : sa composition ne bouge plus.</p>
              <button type="button" className="lem-btn principal" onClick={() => setCreation(true)}>
                <PackagePlus size={15} /> Créer un lot
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {lots.map((lot) => (
                <CarteLot
                  key={lot.lotId}
                  lot={lot}
                  pret={parLot.get(lot.lotId)}
                  onLance={() => void charger()}
                />
              ))}
            </div>
          )}
        </section>

        <p className="lem-second" style={{ textAlign: "center", fontSize: 12.5, margin: 0 }}>
          {/* `/prospection/lots` et non `/entreprises/lots` : ce dernier est le
              chemin de l'API, pas celui de l'écran. Le lien rendait un 404, et
              rien ne le signalait — un lien mort ne casse jamais rien, il perd
              juste la sortie. C'est ce que `liens-vivants.test.ts` tient. */}
          <Link href="/prospection/lots" style={{ color: "var(--lem-bleu)" }}>
            Vue complète des lots
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Atelier;
