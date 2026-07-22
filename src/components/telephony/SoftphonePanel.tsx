"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Phone,
  PhoneOff,
  X,
  Delete,
  MessageSquare,
  Users,
  Clock,
  User as UserIcon,
  Send,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { fetchCalls, sendSms, type CallRow } from "@/lib/telephony/client";
import { hangupViaWidget } from "./ZadarmaWidget";
import type { DialInput } from "./CallProvider";

const KEYS: Array<[string, string]> = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

const AV_COLORS = ["#E2552B", "#2A6FDB", "#1F8A5B", "#7A5AE0", "#C8881F", "#B5322F"];
function avatarFor(name: string): { initials: string; color: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { initials, color: AV_COLORS[h % AV_COLORS.length] };
}

type Tab = "contacts" | "historique" | "equipe";

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  entreprise_id: number | null;
}
interface TeamRow {
  extension: string;
  agent_id: string | null;
  name: string | null;
}

function callCounterpart(c: CallRow): { name: string; number: string } {
  const name = c.contact
    ? [c.contact.first_name, c.contact.last_name].filter(Boolean).join(" ")
    : c.entreprise?.name ?? "";
  const number = (c.direction === "outbound" ? c.to_e164 : c.from_e164) ?? "";
  return { name: name || number || "—", number };
}
function timeShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ name }: { name: string }) {
  const { initials, color } = avatarFor(name);
  return (
    <span className="av" style={{ background: color }}>
      {initials}
    </span>
  );
}

/**
 * CRM-native softphone (prototype "sp-*" skin): dial pad + Contacts / Historique
 * / Équipe tabs populated with OUR data. Places the real call through the
 * Zadarma widget (or callback) via the shared dial(). Wrapped in `.tel-skin`.
 */
export function SoftphonePanel({ dial }: { dial: (i: DialInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("contacts");
  const [number, setNumber] = useState("");
  const [search, setSearch] = useState("");
  const [inCall, setInCall] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [history, setHistory] = useState<CallRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [ct, hist, ext] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, tel, entreprise_id")
        .not("tel", "is", null)
        .order("last_name", { ascending: true })
        .limit(300),
      fetchCalls({ limit: 40 }),
      supabase
        .from("phone_extensions")
        .select("extension, agent_id, agent:user_profiles(full_name)")
        .eq("active", true),
    ]);
    setContacts((ct.data as ContactRow[]) ?? []);
    setHistory(hist);
    setTeam(
      (ext.data ?? []).map((e) => {
        const agent = Array.isArray(e.agent) ? e.agent[0] : e.agent;
        return {
          extension: e.extension as string,
          agent_id: (e.agent_id as string | null) ?? null,
          name: (agent?.full_name as string | null) ?? null,
        };
      }),
    );
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (open && !loaded) void loadData();
  }, [open, loaded, loadData]);

  const press = (k: string) => setNumber((n) => (n + k).slice(0, 24));
  const backspace = () => setNumber((n) => n.slice(0, -1));

  const placeCall = async (to: string, links?: Partial<DialInput>) => {
    const target = to.trim();
    if (!target) return;
    await dial({ to: target, ...links });
    setInCall(target);
  };
  const hangup = () => {
    hangupViaWidget();
    setInCall(null);
  };

  const submitSms = async () => {
    if (!number.trim() || !smsText.trim()) return;
    setSendingSms(true);
    const res = await sendSms({ to: number.trim(), text: smsText.trim() });
    setSendingSms(false);
    if (res.ok) {
      toast.success("SMS envoyé");
      setSmsText("");
      setSmsOpen(false);
    } else {
      toast.error("SMS non envoyé", { description: res.error });
    }
  };

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? contacts.filter((c) => {
          const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
          return name.includes(q) || (c.tel ?? "").includes(q);
        })
      : contacts;
    return base.slice(0, 60);
  }, [contacts, search]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((c) => {
      const { name, number: num } = callCounterpart(c);
      return name.toLowerCase().includes(q) || num.includes(q);
    });
  }, [history, search]);

  const filteredTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter(
      (t) => (t.name ?? "").toLowerCase().includes(q) || t.extension.includes(q),
    );
  }, [team, search]);

  const TABS: Array<[Tab, string, typeof UserIcon]> = [
    ["contacts", "Contacts", UserIcon],
    ["historique", "Historique", Clock],
    ["equipe", "Équipe", Users],
  ];

  return (
    <div className="tel-skin">
      <div className="sp-root">
        {!open ? (
          <button type="button" className="sp-launch" onClick={() => setOpen(true)}>
            <Phone className="ico-sm" style={{ width: 18, height: 18 }} />
            <span className="sp-launch-lb">Téléphone</span>
          </button>
        ) : (
          <div className="sp-panel">
            {/* Header */}
            <div className="sp-hd">
              <div className="sp-hd-l">
                <Phone style={{ width: 15, height: 15 }} /> Téléphone
              </div>
              <button type="button" className="sp-x" onClick={() => setOpen(false)} aria-label="Fermer">
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>

            {inCall ? (
              <>
                <div className="sp-call-hd" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div className="sp-call-id">
                    <div className="nm">{inCall}</div>
                    <div className="sb">En communication…</div>
                  </div>
                  <div className="sp-call-tm">
                    <span className="run">
                      <span className="rec-dot" /> live
                    </span>
                  </div>
                </div>
                <button type="button" className="sp-hangup" onClick={hangup}>
                  <PhoneOff style={{ width: 16, height: 16 }} /> Raccrocher
                </button>
              </>
            ) : (
              <>
                <div className="sp-dialdisplay">
                  <input
                    value={number}
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, ""))}
                    placeholder="Numéro"
                    inputMode="tel"
                  />
                  {number && (
                    <button type="button" className="sp-x" onClick={backspace} aria-label="Effacer">
                      <Delete style={{ width: 16, height: 16 }} />
                    </button>
                  )}
                </div>
                <div className="dialpad">
                  {KEYS.map(([k, sub]) => (
                    <button key={k} type="button" className="dialkey" onClick={() => press(k)}>
                      <span className="d">{k}</span>
                      {sub && <span className="l">{sub}</span>}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, padding: "0 14px 4px" }}>
                  <button
                    type="button"
                    className="sp-callbtn"
                    style={{ margin: 0, width: "auto", flex: 1 }}
                    onClick={() => placeCall(number)}
                    disabled={!number.trim()}
                  >
                    <Phone style={{ width: 18, height: 18 }} /> Appeler
                  </button>
                  <button
                    type="button"
                    className="btn subtle"
                    onClick={() => setSmsOpen((v) => !v)}
                    disabled={!number.trim()}
                  >
                    <MessageSquare style={{ width: 16, height: 16 }} /> SMS
                  </button>
                </div>
                {smsOpen && (
                  <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", alignItems: "flex-end" }}>
                    <textarea
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                      rows={2}
                      placeholder="Message…"
                      className="composer-input"
                      style={{ flex: 1, resize: "none" }}
                    />
                    <button
                      type="button"
                      className="composer-send"
                      onClick={submitSms}
                      disabled={sendingSms || !smsText.trim()}
                    >
                      {sendingSms ? (
                        <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
                      ) : (
                        <Send style={{ width: 15, height: 15 }} />
                      )}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Tabs */}
            <div className="pros-tabs-bar" style={{ display: "flex", gap: 4, padding: "6px 10px 0" }}>
              {TABS.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className="pros-tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  <Icon style={{ width: 14, height: 14 }} /> {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ padding: "8px 10px 4px" }}>
              <input
                className="composer-input"
                style={{ width: "100%" }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
              />
            </div>

            {/* List */}
            <div className="sp-quick" style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {!loaded ? (
                <div className="sp-quick-lb">Chargement…</div>
              ) : tab === "contacts" ? (
                filteredContacts.length === 0 ? (
                  <div className="sp-quick-lb">Aucun contact</div>
                ) : (
                  filteredContacts.map((c) => {
                    const nm = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.tel ?? "");
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="sp-quick-row"
                        onClick={() =>
                          placeCall(c.tel ?? "", { contactId: c.id, entrepriseId: c.entreprise_id })
                        }
                      >
                        <Avatar name={nm} />
                        <span className="nm">{nm}</span>
                        <span className="ph">{c.tel}</span>
                        <Phone style={{ width: 15, height: 15 }} />
                      </button>
                    );
                  })
                )
              ) : tab === "historique" ? (
                filteredHistory.length === 0 ? (
                  <div className="sp-quick-lb">Aucun appel</div>
                ) : (
                  filteredHistory.map((c) => {
                    const { name, number: num } = callCounterpart(c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="sp-quick-row"
                        onClick={() =>
                          placeCall(num, { contactId: c.contact_id, entrepriseId: c.entreprise_id })
                        }
                      >
                        {c.direction === "outbound" ? (
                          <PhoneOutgoing style={{ width: 15, height: 15, color: "var(--info)" }} />
                        ) : (
                          <PhoneIncoming style={{ width: 15, height: 15, color: "var(--ok)" }} />
                        )}
                        <span className="nm">{name}</span>
                        <span className="ph">{timeShort(c.started_at ?? c.created_at)}</span>
                        <Phone style={{ width: 15, height: 15 }} />
                      </button>
                    );
                  })
                )
              ) : filteredTeam.length === 0 ? (
                <div className="sp-quick-lb">Aucune extension</div>
              ) : (
                filteredTeam.map((t) => (
                  <button
                    key={t.extension}
                    type="button"
                    className="sp-quick-row"
                    onClick={() => placeCall(t.extension)}
                  >
                    <Avatar name={t.name ?? t.extension} />
                    <span className="nm">{t.name ?? `Extension ${t.extension}`}</span>
                    <span className="ph">{t.extension}</span>
                    <Phone style={{ width: 15, height: 15 }} />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
