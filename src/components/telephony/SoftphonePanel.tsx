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

/**
 * CRM-native softphone: dial pad + Contacts / Historique / Équipe tabs populated
 * with OUR data. The actual call is placed through the Zadarma widget (or the
 * server callback) via the shared `dial()`. Replaces Zadarma's own launcher.
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
    if (!q) return contacts.slice(0, 60);
    return contacts
      .filter((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return name.includes(q) || (c.tel ?? "").includes(q);
      })
      .slice(0, 60);
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

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[300] flex flex-col items-end gap-3">
      {open && (
        <div className="pointer-events-auto flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          {/* Header / dialer */}
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Téléphone</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {inCall ? (
              <div className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">En communication</div>
                  <div className="truncate text-sm font-medium">{inCall}</div>
                </div>
                <button
                  type="button"
                  onClick={hangup}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white"
                  aria-label="Raccrocher"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-1 rounded-md border px-2 py-1.5">
                  <input
                    value={number}
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, ""))}
                    placeholder="Saisissez le numéro"
                    inputMode="tel"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  {number && (
                    <button
                      type="button"
                      onClick={backspace}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Effacer"
                    >
                      <Delete className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {KEYS.map(([k, sub]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => press(k)}
                      className="flex flex-col items-center rounded-md border py-1.5 hover:bg-muted"
                    >
                      <span className="text-sm font-medium leading-none">{k}</span>
                      {sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => placeCall(number)}
                    disabled={!number.trim()}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 py-2 text-sm text-white disabled:opacity-50"
                  >
                    <Phone className="h-4 w-4" /> Appeler
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmsOpen((v) => !v)}
                    disabled={!number.trim()}
                    className="flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <MessageSquare className="h-4 w-4" /> SMS
                  </button>
                </div>
                {smsOpen && (
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                      rows={2}
                      placeholder="Message…"
                      className="min-h-[2.25rem] flex-1 resize-none rounded-md border bg-background px-2 py-1 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={submitSms}
                      disabled={sendingSms || !smsText.trim()}
                      className="flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-60"
                    >
                      {sendingSms ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b text-sm">
            {(
              [
                ["contacts", "Contacts", UserIcon],
                ["historique", "Historique", Clock],
                ["equipe", "Équipe", Users],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1 py-2 ${
                  tab === id
                    ? "border-b-2 border-primary font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Search + list */}
          <div className="border-b p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none"
            />
          </div>
          <div className="min-h-[120px] flex-1 overflow-y-auto">
            {!loaded ? (
              <p className="p-3 text-sm text-muted-foreground">Chargement…</p>
            ) : tab === "contacts" ? (
              filteredContacts.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Aucun contact.</p>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      placeCall(c.tel ?? "", { contactId: c.id, entrepriseId: c.entreprise_id })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.tel}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{c.tel}</span>
                    </span>
                    <Phone className="h-4 w-4 shrink-0 text-emerald-600" />
                  </button>
                ))
              )
            ) : tab === "historique" ? (
              filteredHistory.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Aucun appel.</p>
              ) : (
                filteredHistory.map((c) => {
                  const { name, number: num } = callCounterpart(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => placeCall(num, { contactId: c.contact_id, entrepriseId: c.entreprise_id })}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      {c.direction === "outbound" ? (
                        <PhoneOutgoing className="h-4 w-4 shrink-0 text-info" />
                      ) : (
                        <PhoneIncoming className="h-4 w-4 shrink-0 text-success" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {timeShort(c.started_at ?? c.created_at)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )
            ) : filteredTeam.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Aucune extension.</p>
            ) : (
              filteredTeam.map((t) => (
                <button
                  key={t.extension}
                  type="button"
                  onClick={() => placeCall(t.extension)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.name ?? `Extension ${t.extension}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.extension} · numéro interne
                    </span>
                  </span>
                  <Phone className="h-4 w-4 shrink-0 text-emerald-600" />
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
        aria-label="Téléphone"
      >
        <Phone className="h-5 w-5" />
      </button>
    </div>
  );
}
