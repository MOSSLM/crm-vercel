"use client";

import { useCallback, useEffect, useRef } from "react";
import { Icon, Pill } from "./DemIcon";
import { channelOf } from "@/lib/sales-pipeline/stages";
import { COHORTE_INFO } from "./cohortes";
import type { DemCohorte, DemarchageSequenceInfo } from "./types";

/**
 * La frise de la séquence : où en est ce prospect, et ce qui reste.
 * L'action, elle, se fait dans la carte en dessous.
 *
 * ELLE MENTAIT PAR CADRAGE, ET C'ÉTAIT LE GRIEF. Les colonnes font 104 px
 * minimum et la frise défile : « S1 — Premier contact » porte 22 blocs, soit
 * 2 288 px dans une colonne qui en fait six cents. L'étape en cours était donc
 * hors champ dès qu'on dépassait la cinquième — on ouvrait un prospect sans
 * voir où il en était. Deux réponses, et il faut les deux : la frise SE RECADRE
 * sur l'étape en cours à l'ouverture, et la mini-carte au-dessus montre la
 * séquence ENTIÈRE quelle que soit sa longueur. Elle ne porte aucun libellé —
 * ce n'est pas une frise miniature, c'est une position et une barre de
 * navigation.
 *
 * À FROID, LA FRISE N'A RIEN À DESSINER — MAIS LA BANDE A QUELQUE CHOSE À DIRE
 * Un appel à froid n'a ni étapes ni relances : la frise rendait `null` et
 * l'écran s'ouvrait directement sur la carte d'action, sans un mot sur QUI on
 * appelle ni POURQUOI cette entreprise-là. On rend donc à sa place la seule
 * chose qui compte dans ce cas : jamais contactée, et l'accroche de sa cohorte.
 * Le `null` reste pour les tâches sans séquence qui ne sont pas à froid non
 * plus (vieilles lignes) : rien de vrai à dire, donc rien à afficher.
 */
export function DemSeqStrip({
  sequence,
  horsSequence = false,
  cohorte = null,
}: {
  sequence: DemarchageSequenceInfo | null;
  /** Appel à froid : aucune séquence derrière cette ligne. */
  horsSequence?: boolean;
  cohorte?: DemCohorte | null;
}) {
  if (horsSequence && (!sequence || sequence.steps.length === 0)) {
    const info = cohorte ? COHORTE_INFO[cohorte] : null;
    return (
      <section className="dm-seq froid">
        <div className="dm-seq-h">
          <span className="sq" style={{ background: "var(--warn)" }} />
          <span className="n">Appel à froid</span>
          <Pill kind="warn">
            <Icon name="zap" className="ico-xs" />
            jamais contactée
          </Pill>
          {info && (
            <Pill kind="accent" style={{ marginLeft: 2 }}>
              {info.long}
            </Pill>
          )}
          <span className="m">aucune séquence · c&apos;est le premier contact</span>
        </div>
        {info && (
          <div className="dm-froid-arg">
            <Icon name="target" className="ico-sm" />
            {info.argument}
          </div>
        )}
      </section>
    );
  }

  if (!sequence || sequence.steps.length === 0) return null;
  const cur = sequence.stepIndex ?? 0;

  return <Frise sequence={sequence} cur={cur} />;
}

/** Les blocs qu'on ne « fait » pas : ils s'aiguillent tout seuls. */
const STRUCTURE = new Set(["condition", "transition"]);

function Frise({ sequence, cur }: { sequence: DemarchageSequenceInfo; cur: number }) {
  const piste = useRef<HTMLDivElement>(null);

  /**
   * Recadrer sur une étape SANS toucher au défilement de la page : on écrit
   * `scrollLeft` du conteneur plutôt que d'appeler `scrollIntoView`, qui
   * remonterait aussi les ancêtres — ici la colonne centrale du poste de
   * travail, qu'on n'a aucune raison de bouger.
   */
  const cadrer = useCallback((n: number, doux: boolean) => {
    const boite = piste.current;
    const carte = boite?.children[n] as HTMLElement | undefined;
    if (!boite || !carte) return;
    const gauche = Math.max(0, carte.offsetLeft - (boite.clientWidth - carte.clientWidth) / 2);
    // `scrollTo` n'existe pas partout (jsdom ne l'implémente pas) : l'appeler
    // sans garde ferait planter le rendu de tout l'écran pour un confort de
    // cadrage. L'affectation directe, elle, marche toujours.
    if (typeof boite.scrollTo === "function") {
      boite.scrollTo({ left: gauche, behavior: doux ? "smooth" : "auto" });
    } else {
      boite.scrollLeft = gauche;
    }
  }, []);

  // À l'ouverture d'un prospect (et à chaque changement d'étape) : sans
  // animation, parce que ce n'est pas un mouvement, c'est le cadrage initial.
  useEffect(() => {
    cadrer(Math.max(0, cur - 1), false);
  }, [cadrer, cur, sequence.name]);

  return (
    <section className="dm-seq">
      <div className="dm-seq-h">
        <span className="sq" style={{ background: "var(--magic)" }} />
        <span className="n">{sequence.name ?? "Séquence"}</span>
        <Pill kind="magic">
          <Icon name="flow" className="ico-xs" />
          étape {cur} sur {sequence.steps.length}
        </Pill>
        <span className="m">relances incluses · s&apos;arrête si le prospect réagit</span>
      </div>
      <div className="dm-mini" role="group" aria-label="Position dans la séquence">
        {sequence.steps.map((s, i) => {
          const n = i + 1;
          const state = n < cur ? "done" : n === cur ? "cur" : "todo";
          return (
            <button
              key={`mini-${s.label}-${i}`}
              type="button"
              data-s={state}
              data-struct={STRUCTURE.has(s.kind) || undefined}
              title={`${n}. ${s.label}`}
              aria-label={`${n}. ${s.label}`}
              onClick={() => cadrer(i, true)}
            />
          );
        })}
      </div>
      <div className="dm-steps" ref={piste}>
        {sequence.steps.map((s, i) => {
          const n = i + 1;
          const state = n < cur ? "done" : n === cur ? "cur" : "todo";
          const ch = channelOf(s.kind);
          return (
            <div key={`${s.label}-${i}`} className="dm-step" data-s={state}>
              <div className="tp">
                <span className="n">{state === "done" ? <Icon name="check" className="ico-xs" /> : n}</span>
                <span className="d">J+{s.day}</span>
              </div>
              <div className="l" style={state === "cur" ? { color: ch.color } : undefined}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
