"use client";

import { Icon, Pill } from "./DemIcon";
import { channelOf } from "@/lib/sales-pipeline/stages";
import type { DemarchageSequenceInfo } from "./types";

/**
 * La frise de la séquence : où en est ce prospect, et ce qui reste.
 * Rien à cliquer — c'est un repère, l'action se fait dans la carte en dessous.
 */
export function DemSeqStrip({ sequence }: { sequence: DemarchageSequenceInfo | null }) {
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
