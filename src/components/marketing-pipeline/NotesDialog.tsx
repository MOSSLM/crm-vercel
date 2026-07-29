"use client";

import React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BoardItem, Note, NoteSeverity, NoteStatus, NoteSubject } from "./types";
import "./mp-skin.css";

/**
 * Panneau « Tickets » d'une ligne du board.
 *
 * L'agent y signale ce qu'il ne veut pas corriger lui-même (donnée fausse,
 * section cassée, doute sur un audit) ; l'admin lit le fil, répond et clôt.
 * Les deux côtés tapent la même API à un préfixe près — `apiBase` — donc le
 * composant est strictement identique en mode admin et en mode agent, aux
 * libellés près.
 */

const SUBJECT_LABEL: Record<NoteSubject, string> = {
  enrichment: "Enrichissement",
  site: "Site démo",
  audit: "Audit",
  other: "Autre",
};

const SEVERITY_LABEL: Record<NoteSeverity, string> = {
  info: "Info",
  probleme: "Problème",
  bloquant: "Bloquant",
};

const STATUS_LABEL: Record<NoteStatus, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
};

const severityClass = (s: NoteSeverity) => (s === "bloquant" ? "danger" : s === "probleme" ? "warn" : "");
const statusClass = (s: NoteStatus) => (s === "resolved" ? "ok" : s === "in_progress" ? "accent" : "warn");

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export interface NotesDialogProps {
  /** Ligne visée. `null` + `inbox` = vue « tous les tickets ». */
  item: BoardItem | null;
  /** Boîte de réception : tous les tickets, toutes lignes confondues. */
  inbox?: boolean;
  /** `/api/marketing-pipeline/notes` ou `/api/agent/marketing-pipeline/notes`. */
  apiBase: string;
  /** Étape pré-sélectionnée quand on arrive depuis une carte. */
  initialSubject?: NoteSubject;
  /** Rôle du caller : détermine le libellé « vous » dans le fil. */
  role: "agent" | "admin";
  onClose: () => void;
  /** Appelé après toute écriture, pour rafraîchir les compteurs du board. */
  onChanged: () => void;
}

export const NotesDialog: React.FC<NotesDialogProps> = ({
  item,
  inbox = false,
  apiBase,
  initialSubject,
  role,
  onClose,
  onChanged,
}) => {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [subject, setSubject] = React.useState<NoteSubject>(initialSubject ?? "site");
  const [severity, setSeverity] = React.useState<NoteSeverity>("probleme");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  /** Vue « tous les tickets » : masquer les résolus par défaut. */
  const [showResolved, setShowResolved] = React.useState(false);

  const opportuniteId = item?.id ?? null;
  const open = !!item || inbox;

  const load = React.useCallback(async () => {
    if (!opportuniteId && !inbox) return;
    setLoading(true);
    try {
      const query = opportuniteId
        ? `?opportunite_id=${encodeURIComponent(opportuniteId)}`
        : showResolved
          ? ""
          : "?status=open";
      const res = await authedFetch(`${apiBase}${query}`);
      const data = (await res.json().catch(() => ({}))) as { notes?: Note[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setNotes(data.notes ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du chargement des tickets");
    } finally {
      setLoading(false);
    }
  }, [apiBase, opportuniteId, inbox, showResolved]);

  // Ouverture du panneau : on repart d'un formulaire vierge. Séparé du
  // chargement, sinon basculer « voir les résolus » effacerait une réponse en
  // cours de frappe.
  React.useEffect(() => {
    if (!open) return;
    setComposing(false);
    setTitle("");
    setBody("");
    setReplies({});
    setSubject(initialSubject ?? "site");
    setSeverity("probleme");
  }, [open, opportuniteId, initialSubject]);

  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Une carte sans ticket ouvre directement le formulaire : le geste attendu là
  // est « je signale », pas « je consulte une liste vide ».
  React.useEffect(() => {
    if (!loading && opportuniteId && notes.length === 0) setComposing(true);
  }, [loading, notes.length, opportuniteId]);

  const post = async (payload: Record<string, unknown>, okMessage: string): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await authedFetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Échec");
      toast.success(okMessage);
      await load();
      onChanged();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitNote = async () => {
    if (!opportuniteId || !title.trim()) {
      toast.error("Donne un titre au ticket");
      return;
    }
    const ok = await post(
      {
        action: "create",
        opportunite_id: opportuniteId,
        subject,
        severity,
        title: title.trim(),
        body: body.trim(),
      },
      "Ticket envoyé",
    );
    if (ok) {
      setTitle("");
      setBody("");
      setComposing(false);
    }
  };

  const submitReply = async (noteId: string) => {
    const text = (replies[noteId] ?? "").trim();
    if (!text) return;
    const ok = await post({ action: "reply", note_id: noteId, body: text }, "Réponse envoyée");
    if (ok) setReplies((r) => ({ ...r, [noteId]: "" }));
  };

  const changeStatus = (noteId: string, status: NoteStatus) =>
    post({ action: "status", note_id: noteId, status }, `Ticket ${STATUS_LABEL[status].toLowerCase()}`);

  const openCount = notes.filter((n) => n.status !== "resolved").length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="ico-sm" />
            {item ? `${item.company_name || item.name} — Tickets` : "Tickets du pipeline"}
          </DialogTitle>
        </DialogHeader>

        <div className="mp-scope mp-embed">
          <div className="notes-head">
            <span className="muted" style={{ fontSize: 12 }}>
              {loading
                ? "Chargement…"
                : notes.length === 0
                  ? item
                    ? "Aucun ticket sur cette ligne."
                    : "Aucun ticket en cours."
                  : `${notes.length} ticket${notes.length > 1 ? "s" : ""} · ${openCount} en cours`}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              {!item && (
                <label className="note-lb" style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)}
                  />
                  Voir les résolus
                </label>
              )}
              <button type="button" className="btn ghost sm icon" title="Rafraîchir" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={"ico-sm" + (loading ? " spin" : "")} />
              </button>
              {item && (
                <button type="button" className="btn sm" onClick={() => setComposing((v) => !v)} disabled={busy}>
                  <Plus className="ico-sm" />
                  Nouveau ticket
                </button>
              )}
            </div>
          </div>

          {composing && item && (
            <div className="note-form">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="note-lb">
                  Étape
                  <select
                    className="mp-select"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as NoteSubject)}
                  >
                    {(Object.keys(SUBJECT_LABEL) as NoteSubject[]).map((s) => (
                      <option key={s} value={s}>
                        {SUBJECT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="note-lb">
                  Gravité
                  <select
                    className="mp-select"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as NoteSeverity)}
                  >
                    {(Object.keys(SEVERITY_LABEL) as NoteSeverity[]).map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : le bloc avis affiche les avis d'une autre entreprise"
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder={
                  role === "agent"
                    ? "Décris ce qui cloche et ce dont tu as besoin (l'admin le verra sur cette ligne)."
                    : "Contexte / consigne pour l'agent."
                }
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" className="btn ghost sm" onClick={() => setComposing(false)} disabled={busy}>
                  Annuler
                </button>
                <button type="button" className="btn accent sm" onClick={() => void submitNote()} disabled={busy || !title.trim()}>
                  {busy ? <Loader2 className="ico-sm spin" /> : <Send className="ico-sm" />}
                  Envoyer
                </button>
              </div>
            </div>
          )}

          <div className="note-list">
            {notes.map((n) => (
              <div key={n.id} className={"note-card" + (n.status === "resolved" ? " is-resolved" : "")}>
                <div className="note-top">
                  <span className={"pill " + severityClass(n.severity)}>
                    {n.severity === "info" ? null : <AlertTriangle className="ico-xs" />}
                    {SEVERITY_LABEL[n.severity]}
                  </span>
                  <span className="pill">{SUBJECT_LABEL[n.subject]}</span>
                  <span className={"pill " + statusClass(n.status)}>{STATUS_LABEL[n.status]}</span>
                  <span className="note-when">
                    {n.created_by_name} · {when(n.created_at)}
                  </span>
                </div>
                {!item && n.company_name ? <div className="note-company">{n.company_name}</div> : null}
                <div className="note-title">{n.title}</div>

                <div className="note-thread">
                  {n.messages.map((m) => (
                    <div key={m.id} className={"note-msg " + (m.author_role === role ? "mine" : "")}>
                      <div className="who">
                        {m.author_name}
                        <span className="role">{m.author_role === "admin" ? "admin" : "agent"}</span>
                        <span className="at">{when(m.created_at)}</span>
                      </div>
                      <div className="body">{m.body}</div>
                    </div>
                  ))}
                  {n.messages.length === 0 && <div className="muted" style={{ fontSize: 11.5 }}>Pas de message.</div>}
                </div>

                <div className="note-actions">
                  <input
                    className="note-reply"
                    value={replies[n.id] ?? ""}
                    onChange={(e) => setReplies((r) => ({ ...r, [n.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitReply(n.id);
                      }
                    }}
                    placeholder="Répondre…"
                  />
                  <button
                    type="button"
                    className="btn ghost sm icon"
                    title="Envoyer la réponse"
                    disabled={busy || !(replies[n.id] ?? "").trim()}
                    onClick={() => void submitReply(n.id)}
                  >
                    <Send className="ico-sm" />
                  </button>
                  {n.status !== "resolved" ? (
                    <>
                      {n.status === "open" && (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busy}
                          title="Marquer comme pris en charge"
                          onClick={() => void changeStatus(n.id, "in_progress")}
                        >
                          Prendre en charge
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn ok sm"
                        disabled={busy}
                        title="Clore le ticket"
                        onClick={() => void changeStatus(n.id, "resolved")}
                      >
                        <Check className="ico-sm" />
                        Résolu
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void changeStatus(n.id, "open")}>
                      Rouvrir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotesDialog;
