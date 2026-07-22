"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, X, Delete, PhoneIncoming, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelephony } from "./CallProvider";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/**
 * Floating softphone dock (bottom-right, all staff pages): a dial pad for free
 * dialing and the incoming-call pop. Calls go through the callback route.
 *
 * The Zadarma WebRTC widget (true in-browser audio) mounts here once the account
 * is configured — see the marked slot below. Until then dialing rings the
 * agent's assigned phone/extension and bridges the customer.
 */
export function SoftphoneDock() {
  const { dialerOpen, openDialer, closeDialer, dial, calling, incoming, dismissIncoming } =
    useTelephony();
  const [number, setNumber] = useState("");

  const press = (k: string) => setNumber((n) => (n + k).slice(0, 24));
  const backspace = () => setNumber((n) => n.slice(0, -1));

  const call = async () => {
    if (!number.trim()) return;
    await dial({ to: number.trim() });
    setNumber("");
    closeDialer();
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {/* Incoming-call pop */}
      {incoming && (
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
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/espace-agent/contacts/${incoming.contactId}`} onClick={dismissIncoming}>
                  Ouvrir la fiche
                </Link>
              </Button>
            ) : incoming.entrepriseId ? (
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link
                  href={`/espace-agent/entreprises/${incoming.entrepriseId}`}
                  onClick={dismissIncoming}
                >
                  Ouvrir la fiche
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="flex-1" disabled>
                <UserPlus className="mr-1 h-4 w-4" /> Inconnu
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismissIncoming}>
              Ignorer
            </Button>
          </div>
        </div>
      )}

      {/* Dial pad */}
      {dialerOpen && (
        <div className="pointer-events-auto w-64 rounded-xl border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Composer</span>
            <button
              type="button"
              onClick={closeDialer}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* WebRTC widget mount point — Zadarma web phone attaches here once
              the account/domain is configured (server-minted key via
              /api/telephony/webrtc-key). */}
          <div className="mb-2 flex items-center gap-1 rounded-md border px-2 py-1.5">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, ""))}
              placeholder="+33…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              inputMode="tel"
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
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="rounded-md border py-2 text-sm font-medium hover:bg-muted"
              >
                {k}
              </button>
            ))}
          </div>
          <Button className="mt-2 w-full gap-1" onClick={call} disabled={calling || !number.trim()}>
            <Phone className="h-4 w-4" /> Appeler
          </Button>
        </div>
      )}

      {/* Toggle */}
      <button
        type="button"
        onClick={dialerOpen ? closeDialer : openDialer}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
        aria-label="Softphone"
      >
        <Phone className="h-5 w-5" />
      </button>
    </div>
  );
}
