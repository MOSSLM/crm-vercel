"use client";

/**
 * Intégrations Cal.SAMA : agendas connectés (Google — busy réel + création
 * d'évènements avec lien Meet), widget d'embed pour sites externes, et état
 * de l'envoi d'emails (Resend).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarX2,
  Check,
  Code2,
  Link2,
  Loader2,
  Mail,
  Plug,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  disconnectConnection,
  fetchConnections,
  fetchEventTypes,
  fetchGoogleAuthUrl,
  fetchSchedulingPage,
  type CalendarConnection,
} from "@/lib/scheduling/client";
import type { EventType } from "@/lib/scheduling/types";
import EmbedGenerator from "./EmbedGenerator";

export default function IntegrationsPanel() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#E2552B");
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connData, pageData, typesData] = await Promise.all([
        fetchConnections(),
        fetchSchedulingPage(),
        fetchEventTypes().catch(() => ({ event_types: [] as EventType[] })),
      ]);
      setConnections(connData.connections);
      setGoogleAvailable(connData.google_available);
      setPublicUrl(pageData.public_url);
      setBrandColor(pageData.page.brand_color || "#E2552B");
      setEventTypes(typesData.event_types);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retour du flow OAuth Google (?google=connected|refused|…)
  useEffect(() => {
    const g = searchParams?.get("google");
    if (!g) return;
    if (g === "connected") toast.success("Google Calendar connecté !");
    else if (g === "refused") toast.error("Connexion Google refusée");
    else toast.error("La connexion Google a échoué", { description: g });
  }, [searchParams]);

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const { url } = await fetchGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "google_calendar_non_configure"
          ? "Google Calendar n'est pas configuré (GOOGLE_CALENDAR_CLIENT_ID/SECRET manquants)"
          : "Impossible de démarrer la connexion Google",
      );
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Agendas connectés */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4" /> Agendas connectés
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Le busy de vos agendas est soustrait de vos disponibilités, et chaque RDV confirmé y est
          créé — avec lien Google Meet automatique pour les visios.
        </p>

        <div className="mt-3 space-y-2">
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {c.provider === "google" ? "Google Calendar" : c.provider}
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <Check className="mr-0.5 h-3 w-3" /> Connecté
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">{c.account_email}</p>
                {c.last_error ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                    <TriangleAlert className="h-3 w-3" /> {c.last_error.slice(0, 80)}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  try {
                    await disconnectConnection(c.id);
                    setConnections((list) => list.filter((x) => x.id !== c.id));
                    toast.success("Agenda déconnecté");
                  } catch {
                    toast.error("Déconnexion impossible");
                  }
                }}
              >
                <CalendarX2 className="mr-1 h-4 w-4" /> Déconnecter
              </Button>
            </div>
          ))}

          {connections.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Aucun agenda connecté — vos dispos reposent sur votre planning et le calendrier CRM.
            </div>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            disabled={connecting || !googleAvailable}
            onClick={() => void connectGoogle()}
          >
            {connecting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-1 h-4 w-4" />
            )}
            {googleAvailable ? "Connecter Google Calendar" : "Google Calendar non configuré (env)"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Embed */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Code2 className="h-4 w-4" /> Intégrer sur un site (embed)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choisissez le type d&apos;intégration — comme Calendly — et collez le snippet généré.
          </p>
          <div className="mt-3">
            <EmbedGenerator
              publicUrl={publicUrl}
              eventTypes={eventTypes}
              brandColor={brandColor}
            />
          </div>
        </div>

        {/* Emails */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Mail className="h-4 w-4" /> Emails & rappels
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirmations, annulations, reprogrammations et rappels partent via le Resend du CRM
            (avec invitation .ics jointe) et sont journalisés dans l&apos;historique email. Les
            rappels se règlent par type d&apos;évènement (la veille + 1 h avant par défaut).
          </p>
        </div>
      </div>
    </div>
  );
}
