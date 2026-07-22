"use client";

import { useEffect, useState } from "react";
import { FileText, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchTranscription,
  triggerTranscription,
  fetchEvaluation,
  triggerEvaluation,
  type TranscriptResult,
  type Evaluation,
} from "@/lib/telephony/client";
import { RecordingPlayer } from "./RecordingPlayer";

const CRITERIA_LABELS: Record<string, string> = {
  decouverte: "Découverte",
  ecoute: "Écoute",
  argumentation: "Argumentation",
  closing: "Closing",
  politesse: "Politesse",
};

const SENT_CLASS: Record<string, string> = {
  positif: "positif",
  neutre: "neutre",
  negatif: "négatif",
};

function Stars({ score }: { score: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return (
    <span className="score">
      {"★".repeat(filled)}
      <span className="off">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

/**
 * Expanded call detail (skin prototype jr-card): recording, on-demand
 * transcription, and AI evaluation. Everything is lazy — nothing is requested
 * until the row is expanded.
 */
export function CallDetailPanel({
  callId,
  recordingStatus,
}: {
  callId: string;
  recordingStatus: "none" | "pending" | "stored" | "failed";
}) {
  const [transcript, setTranscript] = useState<TranscriptResult>({ status: "none" });
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [evLoading, setEvLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [tx, ev] = await Promise.all([fetchTranscription(callId), fetchEvaluation(callId)]);
      if (active) {
        setTranscript(tx);
        setEvaluation(ev);
      }
    })();
    return () => {
      active = false;
    };
  }, [callId]);

  const transcribe = async () => {
    setTxLoading(true);
    const res = await triggerTranscription(callId);
    if (!res.ok) {
      toast.error("Transcription impossible", { description: res.error });
      setTxLoading(false);
      return;
    }
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const tx = await fetchTranscription(callId);
      setTranscript(tx);
      if (tx.status === "done" || tx.status === "failed") break;
    }
    setTxLoading(false);
  };

  const evaluate = async () => {
    setEvLoading(true);
    const res = await triggerEvaluation(callId);
    setEvLoading(false);
    if (!res.ok) {
      toast.error("Évaluation impossible", { description: res.error });
      return;
    }
    if (res.evaluation) setEvaluation(res.evaluation);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Recording */}
      {recordingStatus === "none" ? (
        <div className="jr-norec">
          <FileText className="ico-lg" />
          Aucun enregistrement pour cet appel.
        </div>
      ) : (
        <RecordingPlayer callId={callId} status={recordingStatus} variant="jr" />
      )}

      {/* AI evaluation */}
      <div className="jr-card ai">
        <div className="jr-card-hd">
          <span className="ai-badge">
            <Sparkles className="ico-sm" />
          </span>
          <h3>Évaluation IA</h3>
          {evaluation && (
            <span className={`sent ${SENT_CLASS[evaluation.sentiment] ?? "neutre"}`}>
              {evaluation.sentiment}
            </span>
          )}
          {evaluation && <Stars score={evaluation.score} />}
        </div>
        <div className="jr-ai-body">
          {evaluation ? (
            <>
              {evaluation.summary && <p className="sum">{evaluation.summary}</p>}
              <div className="jr-ai-cols">
                {Object.entries(evaluation.criteria).map(([k, v]) => (
                  <div key={k} className="jr-ai-col">
                    <div className="l">{CRITERIA_LABELS[k] ?? k}</div>
                    <div className="talk-bar">
                      <i style={{ width: `${v}%` }} />
                    </div>
                    <div className="talk-lb">
                      <span>{v}/100</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={evaluate}
                  disabled={evLoading || transcript.status !== "done"}
                >
                  {evLoading && <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />}
                  Réévaluer
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                {transcript.status === "done"
                  ? "Pas encore évalué."
                  : "Transcris d'abord l'appel pour l'évaluer."}
              </span>
              <button
                type="button"
                className="btn outline sm"
                onClick={evaluate}
                disabled={evLoading || transcript.status !== "done"}
              >
                {evLoading && <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />}
                Évaluer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transcription */}
      <div className="jr-card">
        <div className="jr-card-hd">
          <FileText className="ico-sm" />
          <h3>Transcription</h3>
          <span className="meta">à la demande · Voice Intelligence</span>
        </div>
        <div style={{ padding: "4px 16px 16px" }}>
          {transcript.status === "done" && transcript.full_text ? (
            <p
              style={{
                margin: 0,
                maxHeight: 200,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--text)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              {transcript.full_text}
            </p>
          ) : transcript.status === "pending" || txLoading ? (
            <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: 0 }}>Transcription en cours…</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>Pas encore transcrit.</span>
              <button
                type="button"
                className="btn outline sm"
                onClick={transcribe}
                disabled={txLoading || recordingStatus === "none"}
              >
                {txLoading && <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />}
                Transcrire
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
