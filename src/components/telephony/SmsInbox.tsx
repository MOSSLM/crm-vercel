"use client";

import { useEffect, useState, useCallback } from "react";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSmsThreads,
  fetchSmsMessages,
  sendSms,
  type SmsThreadRow,
  type SmsMessage,
} from "@/lib/telephony/client";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** SMS inbox: thread list (left) + conversation & composer (right). */
export function SmsInbox() {
  const [threads, setThreads] = useState<SmsThreadRow[]>([]);
  const [active, setActive] = useState<SmsThreadRow | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadThreads = useCallback(async () => {
    const rows = await fetchSmsThreads();
    setThreads(rows);
    setLoading(false);
    setActive((cur) => cur ?? rows[0] ?? null);
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadMessages = useCallback(async (t: SmsThreadRow | null) => {
    if (!t) {
      setMessages([]);
      return;
    }
    const { messages: m } = await fetchSmsMessages({ counterpart: t.counterpart_e164 });
    setMessages(m);
  }, []);

  useEffect(() => {
    void loadMessages(active);
  }, [active, loadMessages]);

  const submit = async () => {
    const body = text.trim();
    if (!body || !active) return;
    setSending(true);
    const res = await sendSms({
      to: active.counterpart_e164,
      text: body,
      contact_id: active.contact_id,
      entreprise_id: active.entreprise_id,
    });
    setSending(false);
    if (res.ok) {
      setText("");
      await loadMessages(active);
      await loadThreads();
    } else {
      toast.error("SMS non envoyé", { description: res.error });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      {/* Thread list */}
      <div className="space-y-1 rounded-lg border p-2">
        {threads.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Aucune conversation.</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t)}
              className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left ${
                active?.id === t.id ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.counterpart_e164}</span>
                  {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.last_snippet ?? "—"}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Conversation */}
      <div className="flex min-h-[400px] flex-col rounded-lg border">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Sélectionnez une conversation.
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-3">
              <div className="font-medium">{active.counterpart_e164}</div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[var(--surface-2)] p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun message.</p>
              ) : (
                messages.map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                          out ? "bg-primary text-primary-foreground" : "border bg-card"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div
                          className={`mt-0.5 text-[10px] ${
                            out ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {timeAgo(m.sent_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-end gap-2 border-t p-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                placeholder="Votre message…"
                className="min-h-[2.5rem] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={submit}
                disabled={sending || !text.trim()}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
