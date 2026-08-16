"use client";

import { Icon, Pill } from "./DemIcon";
import { channelOf } from "@/lib/sales-pipeline/stages";
import { COHORTE_INFO } from "./cohortes";
import type { DemCohorte, DemarchageSequenceInfo } from "./types";

/**
 * La frise de la séquence : où en est ce prospect, et ce qui reste.
 * Rien à cliquer — c'est un repère, l'action se fait dans la carte en dessous.
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
      <div className="dm-steps">
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
