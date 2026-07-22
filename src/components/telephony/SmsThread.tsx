"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageSquare, Check } from "lucide-react";
import { toast } from "sonner";
import { fetchSmsMessages, sendSms, type SmsMessage } from "@/lib/telephony/client";

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return "Aujourd'hui";
  if (t >= startToday - 86400000) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}

/** Delivery ticks for an outbound message, driven by its status string. */
function Ticks({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.includes("read"))
    return (
      <span className="tick read" title="Lu">
        <Check className="ico-xs" />
        Lu
      </span>
    );
  if (s.includes("deliver"))
    return (
      <span className="tick" title="Distribué">
        <Check className="ico-xs" />
      </span>
    );
  return (
    <span className="tick" title="Envoyé">
      <Check className="ico-xs" />
    </span>
  );
}

function Bubbles({ messages }: { messages: SmsMessage[] }) {
  let lastDay: string | null = null;
  return (
    <>
      {messages.map((m) => {
        const day = dayLabel(m.sent_at);
        const showDay = day !== lastDay;
        lastDay = day;
        const out = m.direction === "outbound";
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && <div className="conv-day">{day}</div>}
            <div className={`bub-row ${out ? "out" : "in"}`}>
              <div className="bubble">{m.body}</div>
              <div className="bub-meta">
                <span className="bub-channel sms">
                  <MessageSquare className="ico-xs" />
                  SMS
                </span>
                <span>· {hm(m.sent_at)}</span>
                {out && <Ticks status={m.status} />}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * SMS conversation for a record (skin prototype conv/composer): message bubbles
 * + composer. Sends via the SMS route and re-fetches on send.
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

  if (!to)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Aucun numéro pour ce contact.</p>
      </div>
    );

  return (
    <div className="tel-skin">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <div className="conv-thread" style={{ maxHeight: 340 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
          ) : messages.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Aucun SMS pour l&apos;instant.</p>
          ) : (
            <Bubbles messages={messages} />
          )}
          <div ref={endRef} style={{ height: 1 }} />
        </div>

        <div className="msg-composer">
          <div className="composer-input">
            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Écrire un SMS…"
            />
            <button
              type="button"
              className="composer-send"
              onClick={submit}
              disabled={sending || !text.trim()}
              title="Envoyer"
            >
              {sending ? (
                <Loader2 className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Send className="ico-sm" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
