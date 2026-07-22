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

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Expanded call detail: recording, on-demand transcription, and AI evaluation.
 * Everything is lazy — nothing is requested until the row is expanded.
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
    // Poll a few times for the result.
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
    <div className="space-y-4 rounded-md border bg-[var(--surface-2)] p-4">
      {/* Recording */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Enregistrement</span>
        <RecordingPlayer callId={callId} status={recordingStatus} />
      </div>

      {/* Transcript */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Transcription
          </span>
          {transcript.status !== "done" && (
            <button
              type="button"
              onClick={transcribe}
              disabled={txLoading || recordingStatus === "none"}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
            >
              {txLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {txLoading ? "En cours…" : "Transcrire"}
            </button>
          )}
        </div>
        {transcript.status === "done" && transcript.full_text ? (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-3 text-sm">
            {transcript.full_text}
          </p>
        ) : transcript.status === "pending" || txLoading ? (
          <p className="text-xs text-muted-foreground">Transcription en cours…</p>
        ) : (
          <p className="text-xs text-muted-foreground">Pas encore transcrit.</p>
        )}
      </div>

      {/* AI evaluation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Évaluation IA
          </span>
          <button
            type="button"
            onClick={evaluate}
            disabled={evLoading || transcript.status !== "done"}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
            title={transcript.status !== "done" ? "Transcris d'abord l'appel" : undefined}
          >
            {evLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {evaluation ? "Réévaluer" : "Évaluer"}
          </button>
        </div>
        {evaluation ? (
          <div className="space-y-2 rounded-md border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{evaluation.score}</span>
              <span className="text-xs text-muted-foreground">/ 100 · {evaluation.sentiment}</span>
            </div>
            <div className="space-y-1">
              {Object.entries(evaluation.criteria).map(([k, v]) => (
                <ScoreBar key={k} label={CRITERIA_LABELS[k] ?? k} value={v} />
              ))}
            </div>
            {evaluation.summary && (
              <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pas encore évalué.</p>
        )}
      </div>
    </div>
  );
}
