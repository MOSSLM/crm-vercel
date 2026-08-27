"use client";

/**
 * L'équipe — ce que font les freelances, en un écran.
 *
 * ── CE QU'IL EST, ET CE QU'IL N'EST PAS ──────────────────────────────────
 * Un écran de LECTURE. Aucun geste ne part d'ici : ni réattribution, ni
 * relance, ni message. Le CRM a déjà l'écran des gestes — Relations › Agents,
 * qui attribue, accorde des capacités et valide des demandes. Celui-ci répond à
 * une autre question, qu'aucun écran ne posait : « qui avance, et qui a
 * décroché ». Y ajouter un bouton d'action en ferait un troisième endroit où
 * l'on attribue des prospects, et personne ne saurait plus lequel fait foi.
 *
 * ── L'ORDRE DIT LE PROPOS ────────────────────────────────────────────────
 * On range par ATTENTION, pas par performance : celui qui n'a rien fait depuis
 * plus d'une semaine passe en tête. Un classement par volume ferait un
 * palmarès — et un palmarès entre deux freelances ne dit rien à personne.
 *
 * ── LE CHIFFRE QU'ON NE MET PAS EN AVANT ─────────────────────────────────
 * « Écartées » est rendu, en bas de carte, hors des chiffres de travail, avec
 * son intitulé « toutes causes ». Quatre chemins de code écrivent ce statut et
 * deux sont des machines : sur les 722 lignes écartées au 27/08, 706 sont des
 * tâches d'appel abandonnées en masse. Le monter d'un cran ferait passer un
 * changement de canal pour 706 refus.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Users } from "lucide-react";

import { authedFetch } from "@/utils/authedFetch";
import {
  LIBELLE_ECARTEES,
  LIBELLE_ETAT,
  classer,
  lireActivite,
  totaux,
  trierParAttention,
  type Activite,
  type EtatEquipier,
  type LigneActivite,
} from "@/lib/equipe/activite";
import "@/components/prospection/lem-skin.css";

const nb = (n: number) => n.toLocaleString("fr-FR");

const TON_ETAT: Record<EtatEquipier, string> = {
  aujourdhui: "ok",
  cette_semaine: "neutre",
  en_sommeil: "attention",
  jamais: "neutre",
};

/** « il y a 3 jours », « aujourd'hui », « jamais ». Jamais une date brute : on
 *  lit un écart, pas un horodatage. */
const depuis = (jours: number | null): string => {
  if (jours === null) return "aucun geste enregistré";
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} jours`;
};

function CarteEquipier({ a }: { a: Activite }) {
  const etat = classer(a);

  return (
    <article className="lem-carte" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 13px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15 }}>{a.nom}</strong>
          {a.role === "admin" && (
            <span className="lem-pill" data-ton="neutre">
              admin
            </span>
          )}
          <span className="lem-pill" data-ton={TON_ETAT[etat]} style={{ marginLeft: "auto" }}>
            {LIBELLE_ETAT[etat]}
          </span>
        </div>
        <div className="lem-meta">Dernier geste {depuis(a.joursSansSigne)}</div>
      </div>

      {/*
        SA FILE D'ABORD, ce qu'il a fait ensuite. C'est ce qui est actionnable :
        une file en retard se réattribue aujourd'hui, un total de tâches faites
        ne se change plus.
      */}
      <div className="lem-chiffres">
        <div>
          <span className="n">{nb(a.file.enAttente)}</span>
          <span className="l">en attente</span>
        </div>
        <div>
          <span className="n" data-ton={a.file.enRetard > 0 ? "danger" : undefined}>
            {nb(a.file.enRetard)}
          </span>
          <span className="l">en retard</span>
        </div>
        <div>
          <span className="n">{nb(a.file.reportees)}</span>
          <span className="l">reportées</span>
        </div>
        <div>
          <span className="n" data-ton={a.faites.jour > 0 ? "ok" : undefined}>
            {nb(a.faites.jour)}
          </span>
          <span className="l">faites aujourd&apos;hui</span>
        </div>
        <div>
          <span className="n">{nb(a.faites.sur7j)}</span>
          <span className="l">sur 7 jours</span>
        </div>
      </div>

      <div style={{ padding: "10px 13px 12px" }}>
        {a.gestes.parAction.length > 0 ? (
          <>
            <div className="lem-meta" style={{ marginTop: 0 }}>
              Ses gestes, sur 30 jours
            </div>
            <ul className="lem-legende">
              {a.gestes.parAction.map((g) => (
                <li key={g.action}>
                  <span className="l">{g.libelle}</span>
                  <b>{nb(g.nombre)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="lem-meta" style={{ marginTop: 0 }}>
            Aucun geste journalisé sur 30 jours
            {a.gestes.total > 0 && ` — ${nb(a.gestes.total)} au total, plus anciens`}.
          </div>
        )}

        {/* SOUS UNE SÉPARATION, exprès. Voir l'en-tête : ce nombre ne dit pas
            qui a écarté, il ne se lit donc pas comme du travail. */}
        {a.ecartees > 0 && (
          <div
            className="lem-meta"
            style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--lem-bord)" }}
          >
            {LIBELLE_ECARTEES} : <b style={{ marginLeft: 4 }}>{nb(a.ecartees)}</b>
          </div>
        )}
      </div>
    </article>
  );
}

export function Equipe() {
  const [membres, setMembres] = useState<Activite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [panne, setPanne] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setPanne(null);
    try {
      const r = await authedFetch("/api/equipe");
      const corps = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(corps.error ?? `Lecture impossible (${r.status})`));
      const lignes = (corps.membres ?? []) as LigneActivite[];
      setMembres(trierParAttention(lignes.map((l) => lireActivite(l))));
    } catch (e: unknown) {
      setPanne(e instanceof Error ? e.message : "Lecture impossible");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const t = totaux(membres);

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">L&apos;équipe</h1>
            <p className="lem-sous">
              {chargement
                ? "Ce que chacun a devant lui, et ce qu'il a fait."
                : membres.length === 0
                  ? "Aucun compte interne."
                  : `${membres.length} personne${membres.length > 1 ? "s" : ""}, ${nb(t.enAttente)} tâche${t.enAttente > 1 ? "s" : ""} en attente dont ${nb(t.enRetard)} en retard.`}
            </p>
          </div>
          <button className="lem-btn" onClick={() => void charger()} disabled={chargement}>
            {chargement ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Rafraîchir
          </button>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 14 }}>
            <div>
              <b>Cet écran n&apos;a pas pu se charger.</b> {panne}
            </div>
          </div>
        )}

        {/*
          LE SEUL CHIFFRE D'ÉQUIPE QUI VAILLE UN BANDEAU : tout ce qui est en
          attente est en retard. Ce n'est pas un jugement sur les gens, c'est
          l'état de la file — et il ne se voit sur aucun autre écran.
        */}
        {!chargement && t.enAttente > 0 && t.enRetard === t.enAttente && (
          <div className="lem-alerte" style={{ marginBottom: 14 }}>
            <div>
              <b>Toute la file est en retard.</b> Les {nb(t.enAttente)} tâches en attente ont
              toutes une échéance passée : ce n&apos;est plus une file du jour, c&apos;est un
              arriéré. Le repousser en bloc se fait depuis les{" "}
              <Link href="/prospection/taches" style={{ color: "var(--lem-bleu)" }}>
                tâches
              </Link>
              .
            </div>
          </div>
        )}

        {chargement ? (
          <div className="lem-vide">
            <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto" }} />
          </div>
        ) : membres.length === 0 ? (
          <div className="lem-vide">
            <Users size={22} style={{ margin: "0 auto 8px" }} />
            <h3>Aucun compte interne</h3>
            <p>
              Les comptes se créent depuis Relations › Agents. Cet écran lira leur activité dès
              qu&apos;ils auront un premier geste.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {membres.map((a) => (
              <CarteEquipier key={a.agentId} a={a} />
            ))}
          </div>
        )}

        {!chargement && membres.length > 0 && (
          <p className="lem-sous" style={{ marginTop: 16 }}>
            Écran de lecture : rien ne s&apos;attribue ni ne se relance d&apos;ici. Les gestes sur
            un agent — attribution, capacités, demandes — restent dans{" "}
            <Link href="/agents" style={{ color: "var(--lem-bleu)" }}>
              Relations › Agents
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

export default Equipe;
