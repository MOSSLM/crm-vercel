"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PhoneIncoming, UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { supabase } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { placeCallback } from "@/lib/telephony/client";
import { ZadarmaWidget, dialViaWidget } from "./ZadarmaWidget";

export interface IncomingCall {
  id: string;
  from: string;
  who: string | null;
  contactId: string | null;
  entrepriseId: number | null;
}

export interface DialInput {
  to: string;
  contactId?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
}

interface TelephonyProfile {
  configured: boolean;
  hasExtension: boolean;
  sip: string | null;
  call_mode: "browser" | "callback";
}

interface TelephonyContextValue {
  profile: TelephonyProfile | null;
  calling: boolean;
  incoming: IncomingCall | null;
  dial: (input: DialInput) => Promise<void>;
  dismissIncoming: () => void;
}

const TelephonyContext = createContext<TelephonyContextValue | null>(null);

/** Throws if used outside a CallProvider. */
export function useTelephony(): TelephonyContextValue {
  const ctx = useContext(TelephonyContext);
  if (!ctx) throw new Error("useTelephony must be used within a CallProvider");
  return ctx;
}

/** Returns the context, or null when no CallProvider is mounted (safe fallback). */
export function useTelephonyOptional(): TelephonyContextValue | null {
  return useContext(TelephonyContext);
}

/**
 * Global telephony context, mounted inside the admin/agent shells (never on the
 * public site). It:
 *  - loads the official Zadarma WebRTC widget (real in-browser softphone) when
 *    the agent has an extension,
 *  - routes click-to-call to the widget or the server callback per the agent's
 *    chosen mode,
 *  - surfaces an incoming-call screen-pop (from Supabase Realtime) that opens
 *    the matched CRM record while the widget rings.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "freelance";

  const [profile, setProfile] = useState<TelephonyProfile | null>(null);
  const [calling, setCalling] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  // Load the agent's telephony profile (extension + preferred call mode).
  useEffect(() => {
    if (!isStaff) return;
    let active = true;
    (async () => {
      try {
        const res = await authedFetch("/api/telephony/me");
        const data = await res.json().catch(() => null);
        if (active && res.ok) setProfile(data);
      } catch {
        /* leave profile null → callback-only */
      }
    })();
    return () => {
      active = false;
    };
  }, [isStaff]);

  const dial = useCallback(
    async (input: DialInput) => {
      const number = input.to?.trim();
      if (!number) return;

      // Browser mode: dial through the loaded Zadarma widget when available.
      if (profile?.call_mode === "browser" && dialViaWidget(number)) {
        toast.success("Appel en cours…", { description: number });
        return;
      }

      // Callback mode (or fallback): server bridges the two legs.
      setCalling(true);
      const res = await placeCallback({
        to: number,
        contact_id: input.contactId ?? null,
        entreprise_id: input.entrepriseId ?? null,
        opportunite_id: input.opportuniteId ?? null,
      });
      setCalling(false);
      if (res.ok) {
        toast.success("Appel lancé", {
          description: "Votre téléphone va sonner, puis le correspondant sera appelé.",
        });
      } else {
        toast.error("Appel impossible", { description: res.error });
      }
    },
    [profile],
  );

  // Realtime incoming-call pop for calls routed to this agent.
  useEffect(() => {
    if (!isStaff || !user?.id) return;
    const channel = supabase
      .channel("telephony-incoming")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `agent_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            direction: string;
            from_e164: string | null;
            contact_id: string | null;
            entreprise_id: number | null;
          };
          if (row.direction !== "inbound") return;

          let who: string | null = null;
          if (row.contact_id) {
            const { data } = await supabase
              .from("contacts")
              .select("first_name, last_name")
              .eq("id", row.contact_id)
              .maybeSingle();
            if (data) who = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
          } else if (row.entreprise_id) {
            const { data } = await supabase
              .from("entreprises")
              .select("name")
              .eq("id", row.entreprise_id)
              .maybeSingle();
            who = data?.name ?? null;
          }

          setIncoming({
            id: row.id,
            from: row.from_e164 ?? "Inconnu",
            who,
            contactId: row.contact_id,
            entrepriseId: row.entreprise_id,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isStaff, user?.id]);

  if (!isStaff) return <>{children}</>;

  return (
    <TelephonyContext.Provider
      value={{ profile, calling, incoming, dial, dismissIncoming: () => setIncoming(null) }}
    >
      {children}
      {profile?.configured && profile?.hasExtension && profile?.sip && (
        <ZadarmaWidget sip={profile.sip} />
      )}
      {incoming && <IncomingCallPop incoming={incoming} onDismiss={() => setIncoming(null)} />}
    </TelephonyContext.Provider>
  );
}

/** Screen-pop shown when an inbound call is routed to this agent. */
function IncomingCallPop({
  incoming,
  onDismiss,
}: {
  incoming: IncomingCall;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[310] flex justify-end">
      <div className="pointer-events-auto w-72 rounded-xl border bg-card p-4 shadow-lg">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <PhoneIncoming className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{incoming.who ?? "Appel entrant"}</div>
            <div className="truncate text-xs text-muted-foreground">{incoming.from}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {incoming.contactId ? (
            <Link
              href={`/espace-agent/contacts/${incoming.contactId}`}
              onClick={onDismiss}
              className="flex-1 rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted"
            >
              Ouvrir la fiche
            </Link>
          ) : incoming.entrepriseId ? (
            <Link
              href={`/espace-agent/entreprises/${incoming.entrepriseId}`}
              onClick={onDismiss}
              className="flex-1 rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted"
            >
              Ouvrir la fiche
            </Link>
          ) : (
            <span className="flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
              <UserPlus className="h-4 w-4" /> Inconnu
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  );
}
