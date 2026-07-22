"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Send, Loader2, MessageSquare, Check, PhoneOutgoing } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSmsThreads,
  fetchSmsMessages,
  sendSms,
  type SmsThreadRow,
  type SmsMessage,
} from "@/lib/telephony/client";
import { useTelephonyOptional } from "./CallProvider";

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startToday) return hm(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
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

const AV_COLORS = ["#E2552B", "#3B7DD8", "#7A5AF0", "#2E9E6B", "#D8912E", "#C64B8C"];
function numColor(n: string): string {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function numInitials(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits.slice(-2) || "##";
}

function Ticks({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.includes("read"))
    return (
      <span className="tick read" title="Lu">
        <Check className="ico-xs" />
        Lu
      </span>
    );
  return (
    <span className="tick" title={s.includes("deliver") ? "Distribué" : "Envoyé"}>
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

/** SMS inbox (skin prototype msg-*): thread list + conversation & composer. */
export function SmsInbox() {
  const tel = useTelephonyOptional();
  const [threads, setThreads] = useState<SmsThreadRow[]>([]);
  const [active, setActive] = useState<SmsThreadRow | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );

  return (
    <div className="tel-skin" style={{ height: "min(78vh, 860px)", minHeight: 480 }}>
      <div className="msg-page" style={{ height: "100%", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {/* Thread list */}
        <aside className="msg-list">
          <div className="pros-tabs-bar" style={{ borderBottom: "1px solid var(--border)" }}>
            <button type="button" className="pros-tab" aria-selected>
              Boîte<span className="nb">{threads.length}</span>
            </button>
          </div>
          <div className="split-list-rows">
            {threads.length === 0 ? (
              <p style={{ padding: 14, fontSize: 13, color: "var(--text-3)" }}>Aucune conversation.</p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  className="inbox-row"
                  aria-selected={active?.id === t.id}
                  onClick={() => setActive(t)}
                >
                  <div className="av" style={{ background: numColor(t.counterpart_e164) }}>
                    {numInitials(t.counterpart_e164)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{t.counterpart_e164}</div>
                    <div className="pv">{t.last_snippet ?? "—"}</div>
                  </div>
                  <div className="right">
                    <span className="tm">{shortTime(t.last_message_at)}</span>
                    <span className="ch-mini sms">
                      <MessageSquare className="ico-xs" />
                    </span>
                    {t.unread && <span className="unread">1</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Conversation */}
        <main className="msg-thread-pane">
          {!active ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "var(--text-3)",
              }}
            >
              Sélectionnez une conversation.
            </div>
          ) : (
            <>
              <div className="msg-thread-hd">
                <div className="av" style={{ background: numColor(active.counterpart_e164) }}>
                  {numInitials(active.counterpart_e164)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="nm">{active.counterpart_e164}</div>
                  <div className="sb">Conversation SMS</div>
                </div>
                {tel && (
                  <div className="actions">
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() =>
                        void tel.dial({
                          to: active.counterpart_e164,
                          contactId: active.contact_id,
                          entrepriseId: active.entreprise_id,
                        })
                      }
                    >
                      <PhoneOutgoing className="ico-sm" />
                      Appeler
                    </button>
                  </div>
                )}
              </div>

              <div className="conv-thread" style={{ flex: 1, overflow: "auto" }}>
                {messages.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-3)" }}>Aucun message.</p>
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
