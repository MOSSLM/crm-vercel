"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSmsMessages,
  sendSms,
  type SmsMessage,
} from "@/lib/telephony/client";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * SMS conversation for a record: message bubbles + composer. Sends via the SMS
 * route (links the message to the contact/company) and re-fetches on send.
 */
export function SmsThread({
  to,
  contactId,
  entrepriseId,
}: {
  to: string | null | undefined;
  contactId?: string | null;
  entrepriseId?: number | null;
}) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const { messages: m } = await fetchSmsMessages({
      contact_id: contactId ?? undefined,
      entreprise_id: entrepriseId ?? undefined,
    });
    setMessages(m);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { messages: m } = await fetchSmsMessages({
        contact_id: contactId ?? undefined,
        entreprise_id: entrepriseId ?? undefined,
      });
      if (active) {
        setMessages(m);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, entrepriseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = async () => {
    const body = text.trim();
    if (!body || !to) return;
    setSending(true);
    const res = await sendSms({
      to,
      text: body,
      contact_id: contactId ?? null,
      entreprise_id: entrepriseId ?? null,
    });
    setSending(false);
    if (res.ok) {
      setText("");
      await load();
    } else {
      toast.error("SMS non envoyé", { description: res.error });
    }
  };

  if (!to) return <p className="text-sm text-muted-foreground">Aucun numéro pour ce contact.</p>;

  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-[var(--surface-2)] p-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun SMS pour l’instant.</p>
        ) : (
          messages.map((m) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                    out ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div
                    className={`mt-0.5 text-[10px] ${
                      out ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {formatTime(m.sent_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Votre message…"
          rows={2}
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
    </div>
  );
}
