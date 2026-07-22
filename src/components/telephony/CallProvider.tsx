"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { supabase } from "@/utils/supabase/client";
import { placeCallback, type CallbackPayload } from "@/lib/telephony/client";
import { SoftphoneDock } from "./SoftphoneDock";

export interface IncomingCall {
  id: string;
  from: string;
  who: string | null;
  contactId: string | null;
  entrepriseId: number | null;
}

interface TelephonyContextValue {
  calling: boolean;
  dialerOpen: boolean;
  incoming: IncomingCall | null;
  openDialer: () => void;
  closeDialer: () => void;
  dismissIncoming: () => void;
  dial: (payload: CallbackPayload) => Promise<void>;
}

const TelephonyContext = createContext<TelephonyContextValue | null>(null);

export function useTelephony(): TelephonyContextValue {
  const ctx = useContext(TelephonyContext);
  if (!ctx) throw new Error("useTelephony must be used within a CallProvider");
  return ctx;
}

/**
 * Global telephony context. Mounted once (in providers.tsx) so both the admin
 * and agent shells inherit it. Only active for staff (admin/freelance): it
 * subscribes to Supabase Realtime for calls routed to this agent and surfaces
 * an incoming-call pop, and exposes the dialer used by the softphone dock.
 *
 * NOTE: in-browser *audio* (the Zadarma WebRTC widget) mounts inside the dock —
 * see SoftphoneDock. Dialing here uses the callback route (rings the agent's
 * phone then the customer), which works without WebRTC.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "freelance";

  const [dialerOpen, setDialerOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  const dial = useCallback(async (payload: CallbackPayload) => {
    setCalling(true);
    const res = await placeCallback(payload);
    setCalling(false);
    if (res.ok) {
      toast.success("Appel lancé", {
        description: "Votre téléphone va sonner, puis le correspondant sera appelé.",
      });
    } else {
      toast.error("Appel impossible", { description: res.error });
    }
  }, []);

  useEffect(() => {
    if (!isStaff || !user?.id) return;
    const channel = supabase
      .channel("telephony-incoming")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `agent_id=eq.${user.id}`,
        },
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
      value={{
        calling,
        dialerOpen,
        incoming,
        openDialer: () => setDialerOpen(true),
        closeDialer: () => setDialerOpen(false),
        dismissIncoming: () => setIncoming(null),
        dial,
      }}
    >
      {children}
      <SoftphoneDock />
    </TelephonyContext.Provider>
  );
}
