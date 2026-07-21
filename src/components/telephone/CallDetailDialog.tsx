"use client";

/**
 * Call detail: recording playback, transcript, AI evaluation (Claude), plus
 * editable tags / disposition / notes. Opened from the call history.
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, X, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";

interface CallRow {
  id: string;
  direction: "inbound" | "outbound";
  from_e164: string | null;
  to_e164: string | null;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  disposition: string | null;
  notes: string | null;
  tags: string[] | null;
}
interface Transcript {
  text: string;
}
interface Evaluation {
  summary: string | null;
  sentiment: string | null;
  score: number | null;
  objections: string[] | null;
  next_action: string | null;
  topics: string[] | null;
}

const DISPOSITIONS = [
  "positif",
  "negatif",
  "repondeur",
  "rappel",
  "injoignable",
  "transfere",
];

const sentimentColor = (s: string | null) =>
  s === "positif"
    ? "bg-emerald-600"
    : s === "negatif"
      ? "bg-red-600"
      : "bg-muted-foreground";

export function CallDetailDialog({
  callId,
  open,
  onOpenChange,
  onUpdated,
}: {
  callId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated?: () => void;
}) {
  const [call, setCall] = useState<CallRow | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState<string>("");
  const [manualTranscript, setManualTranscript] = useState("");

  const load = useCallback(async () => {
    if (!callId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/twilio/calls/${callId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          call: CallRow;
          transcript: Transcript | null;
          evaluation: Evaluation | null;
        };
        setCall(data.call);
        setTranscript(data.transcript);
        setEvaluation(data.evaluation);
        setTags(data.call.tags ?? []);
        setNotes(data.call.notes ?? "");
        setDisposition(data.call.disposition ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    if (open && callId) void load();
  }, [open, callId, load]);

  const patch = async (body: Record<string, unknown>) => {
    if (!callId) return;
    await authedFetch(`/api/twilio/calls/${callId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onUpdated?.();
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 25) return;
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    void patch({ tags: next });
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void patch({ tags: next });
  };

  const analyze = async () => {
    if (!callId) return;
    setAnalyzing(true);
    try {
      const res = await authedFetch(`/api/twilio/calls/${callId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualTranscript.trim() ? { transcript: manualTranscript.trim() } : {}),
      });
      if (res.status === 503) {
        toast.error("IA non configurée (ANTHROPIC_API_KEY).");
        return;
      }
      if (res.status === 400) {
        toast.error("Aucune transcription à analyser. Collez-en une ci-dessous.");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { evaluation: Evaluation };
      setEvaluation(data.evaluation);
      if (manualTranscript.trim()) setTranscript({ text: manualTranscript.trim() });
      toast.success("Analyse terminée.");
    } catch {
      toast.error("Analyse impossible.");
    } finally {
      setAnalyzing(false);
    }
  };

  const counterpart = call
    ? call.direction === "inbound"
      ? call.from_e164
      : call.to_e164
    : null;
  const Icon = call?.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {call && <Icon className="h-4 w-4" />}
            {counterpart ?? "Appel"}
          </DialogTitle>
        </DialogHeader>

        {loading || !call ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-xs text-muted-foreground">
              {new Date(call.started_at).toLocaleString("fr-FR")}
              {call.duration_seconds ? ` · ${call.duration_seconds}s` : ""}
            </div>

            {call.recording_url && (
              <div>
                <div className="mb-1 text-sm font-medium">Enregistrement</div>
                <audio controls preload="none" src={`${call.recording_url}.mp3`} className="w-full" />
              </div>
            )}

            {/* AI evaluation */}
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" /> Évaluation IA
                </span>
                <Button size="sm" variant="outline" onClick={analyze} disabled={analyzing}>
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyser"}
                </Button>
              </div>
              {evaluation ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={`${sentimentColor(evaluation.sentiment)} text-white`}>
                      {evaluation.sentiment ?? "—"}
                    </Badge>
                    {evaluation.score != null && (
                      <span className="text-muted-foreground">Score : {evaluation.score}/100</span>
                    )}
                  </div>
                  {evaluation.summary && <p>{evaluation.summary}</p>}
                  {evaluation.next_action && (
                    <p className="text-muted-foreground">
                      <strong>Prochaine action :</strong> {evaluation.next_action}
                    </p>
                  )}
                  {evaluation.objections && evaluation.objections.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {evaluation.objections.map((o, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {o}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {transcript?.text
                      ? "Transcription disponible — lancez l'analyse."
                      : "Aucune transcription. Collez-en une pour tester l'analyse IA."}
                  </p>
                  {!transcript?.text && (
                    <Textarea
                      value={manualTranscript}
                      onChange={(e) => setManualTranscript(e.target.value)}
                      placeholder="Collez ici la transcription de l'appel…"
                      rows={3}
                    />
                  )}
                </div>
              )}
            </div>

            {transcript?.text && (
              <div>
                <div className="mb-1 text-sm font-medium">Transcription</div>
                <p className="max-h-32 overflow-y-auto rounded-lg bg-muted/40 p-2 text-xs">
                  {transcript.text}
                </p>
              </div>
            )}

            {/* Tags */}
            <div>
              <div className="mb-1 text-sm font-medium">Tags</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} aria-label="Retirer">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Ajouter un tag + Entrée"
                className="h-8"
              />
            </div>

            {/* Disposition */}
            <div>
              <div className="mb-1 text-sm font-medium">Issue de l&apos;appel</div>
              <Select
                value={disposition || "none"}
                onValueChange={(v) => {
                  const val = v === "none" ? null : v;
                  setDisposition(val ?? "");
                  void patch({ disposition: val });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Non définie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non définie</SelectItem>
                  {DISPOSITIONS.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <div className="mb-1 text-sm font-medium">Notes</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => patch({ notes: notes || null })}
                placeholder="Notes d'appel…"
                rows={3}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CallDetailDialog;
