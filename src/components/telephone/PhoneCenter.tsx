"use client";

/**
 * Centrale d'appels — shared shell mounted by both the admin route (/telephone)
 * and the agent route (/espace-agent/telephone).
 *
 * Phase 0: surfaces the Twilio integration state (live vs simulation) so the
 * operator knows whether calls will actually reach the PSTN. Later phases mount
 * the softphone, call history, numbers admin, and SMS inbox inside this shell.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Radio, FlaskConical, Loader2, Hash, ArrowRightLeft } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";
import { useDialer } from "@/components/telephone/DialerProvider";
import { CallHistory } from "@/components/telephone/CallHistory";
import { PhoneSettings } from "@/components/telephone/PhoneSettings";

type Health = {
  mock: boolean;
  restConfigured: boolean;
  voiceConfigured: boolean;
};

export function PhoneCenter({ scope = "admin" }: { scope?: "admin" | "agent" }) {
  const dialer = useDialer();
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/twilio/health");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Health;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Centrale d&apos;appels</h1>
            <p className="text-sm text-muted-foreground">
              Téléphonie &amp; SMS intégrés — propulsé par Twilio
            </p>
          </div>
        </div>
        <Button onClick={dialer.openWidget} className="gap-2">
          <Phone className="h-4 w-4" />
          Passer un appel
        </Button>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">État de l&apos;intégration</CardTitle>
              <CardDescription>
                Mode actuel de la centrale et fonctionnalités disponibles.
              </CardDescription>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : health?.mock ? (
              <Badge variant="secondary" className="gap-1">
                <FlaskConical className="h-3 w-3" />
                Simulation
              </Badge>
            ) : (
              <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                <Radio className="h-3 w-3" />
                En ligne
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading ? (
            <p className="text-muted-foreground">Chargement…</p>
          ) : health?.mock ? (
            <p className="text-muted-foreground">
              La centrale tourne en <strong>mode simulation</strong> : les appels et SMS sont
              factices, aucun coût ni appel réel. Renseignez les identifiants Twilio pour passer
              en production (voir <code>docs/twilio-setup.md</code>).
            </p>
          ) : (
            <p className="text-muted-foreground">
              La centrale est connectée à Twilio. Les appels et SMS sont réels.
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            <StatusRow label="API REST (numéros, SMS)" ok={!!health && (health.restConfigured || health.mock)} />
            <StatusRow label="Voix navigateur (softphone)" ok={!!health && (health.voiceConfigured || health.mock)} />
          </ul>
        </CardContent>
      </Card>

      {scope === "admin" && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/telephone/numeros">
            <Card className="h-full transition hover:border-primary/50 hover:shadow-sm">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Numéros</div>
                  <div className="text-xs text-muted-foreground">Acheter, attribuer, libérer</div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/telephone/portabilite">
            <Card className="h-full transition hover:border-primary/50 hover:shadow-sm">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Portabilité</div>
                  <div className="text-xs text-muted-foreground">Porter un numéro existant</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      <div className="mt-6">
        <PhoneSettings />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Appels récents</CardTitle>
          <CardDescription>
            {scope === "agent" ? "Vos derniers appels." : "Les derniers appels de l'équipe."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallHistory limit={25} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
      />
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export default PhoneCenter;
