"use client";

/**
 * SMS inbox: conversations grouped by the external number, a thread view, and a
 * composer. Polls periodically for new messages (no realtime transport here).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authedFetch } from "@/utils/authedFetch";

interface SmsRow {
  id: string;
  direction: "inbound" | "outbound";
  from_e164: string | null;
  to_e164: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  body: string | null;
  status: string;
  sent_at: string;
}

interface Conversation {
  counterpart: string;
  contactId: string | null;
  entrepriseId: number | null;
  messages: SmsRow[];
  last: SmsRow;
}

const counterpartOf = (m: SmsRow) => (m.direction === "inbound" ? m.from_e164 : m.to_e164) ?? "—";

export function SmsInbox() {
  const [messages, setMessages] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/twilio/sms");
      if (res.ok) {
        const data = (await res.json()) as { messages: SmsRow[] };
        setMessages(data.messages);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Conversation>();
    // messages come newest-first; iterate reversed to build ascending threads.
    for (const m of [...messages].reverse()) {
      const key = counterpartOf(m);
      const existing = map.get(key);
      if (existing) {
        existing.messages.push(m);
        existing.last = m;
        if (!existing.contactId && m.contact_id) existing.contactId = m.contact_id;
        if (existing.entrepriseId == null && m.entreprise_id != null)
          existing.entrepriseId = m.entreprise_id;
      } else {
        map.set(key, {
          counterpart: key,
          contactId: m.contact_id,
          entrepriseId: m.entreprise_id,
          messages: [m],
          last: m,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.last.sent_at).getTime() - new Date(a.last.sent_at).getTime(),
    );
  }, [messages]);

  const active = conversations.find((c) => c.counterpart === selected) ?? null;

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [active?.messages.length, selected]);

  const send = async () => {
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      const res = await authedFetch("/api/twilio/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: active.counterpart,
          body: draft.trim(),
          contactId: active.contactId ?? undefined,
          entrepriseId: active.entrepriseId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDraft("");
      await load();
    } catch {
      toast.error("Envoi impossible.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-border sm:grid-cols-[280px_1fr]">
      {/* Conversation list */}
      <div className={`border-r border-border ${active ? "hidden sm:block" : ""} overflow-y-auto`}>
        {conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun message.</p>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li key={c.counterpart}>
                <button
                  type="button"
                  onClick={() => setSelected(c.counterpart)}
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition hover:bg-muted/50 ${
                    selected === c.counterpart ? "bg-muted" : ""
                  }`}
                >
                  <span className="text-sm font-medium">{c.counterpart}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {c.last.direction === "outbound" ? "Vous : " : ""}
                    {c.last.body}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Thread */}
      <div className={`flex flex-col ${!active ? "hidden sm:flex" : ""}`}>
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Sélectionnez une conversation.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <button
                type="button"
                className="text-sm text-muted-foreground sm:hidden"
                onClick={() => setSelected(null)}
              >
                ←
              </button>
              <span className="text-sm font-semibold">{active.counterpart}</span>
            </div>
            <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {active.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div>{m.body}</div>
                    <div
                      className={`mt-1 text-[10px] ${
                        m.direction === "outbound"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {new Date(m.sent_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-border p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder="Votre message…"
              />
              <Button onClick={send} disabled={sending || !draft.trim()} size="icon">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SmsInbox;
