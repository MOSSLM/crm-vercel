"use client";

/**
 * Intégrations — portage de `ScreenIntegrations` (rdv-screens-d.jsx) :
 * agendas connectés, état des emails, et générateur d'embed avec aperçu
 * visuel sur un faux site (inline / bouton flottant / popup au clic).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  disconnectConnection,
  fetchConnections,
  fetchEventTypes,
  fetchGoogleAuthUrl,
  fetchSchedulingPage,
  type CalendarConnection,
} from "@/lib/scheduling/client";
import type { EventType } from "@/lib/scheduling/types";
import { Blk, Btn, Field, Pill, Row, Seg, Stack, Sw } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import { SectionHeader } from "./CalShell";
import { getAppUrlClient } from "../rdv/shared";

const EMBED_KINDS = [
  { id: "inline", ic: "layout", n: "Inline", d: "Le calendrier s'affiche dans la page." },
  { id: "floating", ic: "panelBottom", n: "Bouton flottant", d: "Bouton fixe en bas d'écran → popup." },
  { id: "popup", ic: "pointer", n: "Popup au clic", d: "N'importe quel bouton de votre site." },
];

function Code({ lines }: { lines: string[] }) {
  return (
    <div className="rv-code">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export default function IntegrationsPanel() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [types, setTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [kind, setKind] = useState("floating");
  const [target, setTarget] = useState("");
  const [txt, setTxt] = useState("Prendre rendez-vous");
  const [pos, setPos] = useState("right");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conn, page, tps] = await Promise.all([
        fetchConnections(),
        fetchSchedulingPage(),
        fetchEventTypes().catch(() => ({ event_types: [] as EventType[] })),
      ]);
      setConnections(conn.connections);
      setGoogleAvailable(conn.google_available);
      setPublicUrl(conn.connections ? page.public_url : page.public_url);
      setTypes(tps.event_types);
      const first = tps.event_types.find((t) => t.is_active);
      if (first) setTarget(first.slug);
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
          ? "Google Calendar n'est pas configuré (variables d'environnement manquantes)"
          : "Impossible de démarrer la connexion Google",
      );
      setConnecting(false);
    }
  };

  const google = connections.find((c) => c.provider === "google");
  const embedJs = `${getAppUrlClient()}/api/public/scheduling/embed.js`;
  const url = target ? `${publicUrl}/${target}` : publicUrl;
  const snip =
    kind === "inline"
      ? [`<div class="sama-rdv" data-url="${url}"></div>`, `<script src="${embedJs}" async></script>`]
      : kind === "popup"
        ? [
            `<button data-sama-rdv-popup="${url}">${txt}</button>`,
            `<script src="${embedJs}" async></script>`,
          ]
        : [
            `<script src="${embedJs}" async`,
            `  data-button-url="${url}"`,
            `  data-button-text="${txt}"`,
            `  data-button-color="#E2552B"`,
            `  data-button-position="${pos}"></script>`,
          ];

  if (loading) {
    return (
      <>
        <SectionHeader
          title="Intégrations"
          subtitle="Agendas connectés, emails, et le widget à coller sur vos sites clients ou votre landing."
        />
        <div className="rv-empty" style={{ padding: 40 }}>
          Chargement…
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title="Intégrations"
        subtitle="Agendas connectés, emails, et le widget à coller sur vos sites clients ou votre landing."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Stack gap={16}>
          <Blk title="Agendas connectés" ic="plug">
            <div className="rv-conn">
              <span className="lg">
                <Icon name="google" className="ico-lg" style={{ color: "#EA4335" }} />
              </span>
              <div>
                <div className="n">
                  Google Calendar
                  {google ? (
                    <Pill kind="ok" dot>
                      connecté
                    </Pill>
                  ) : null}
                </div>
                <div className="e">
                  {google
                    ? `${google.account_email ?? "compte lié"} · ${google.busy_calendar_ids.length} agenda(s) lus`
                    : googleAvailable
                      ? "non connecté"
                      : "non configuré (variables d'environnement)"}
                </div>
              </div>
              {google ? (
                <Row style={{ gap: 5 }}>
                  <Btn
                    kind="ghost"
                    size="xs"
                    ic="x"
                    onClick={async () => {
                      try {
                        await disconnectConnection(google.id);
                        setConnections((l) => l.filter((x) => x.id !== google.id));
                        toast.success("Agenda déconnecté");
                      } catch {
                        toast.error("Déconnexion impossible");
                      }
                    }}
                  />
                </Row>
              ) : (
                <Btn
                  kind="outline"
                  size="xs"
                  ic="link"
                  disabled={connecting || !googleAvailable}
                  onClick={() => void connectGoogle()}
                >
                  Connecter
                </Btn>
              )}
            </div>

            <div className="rv-conn">
              <span className="lg">
                <Icon name="calendar" className="ico-lg" style={{ color: "var(--accent-2)" }} />
              </span>
              <div>
                <div className="n">
                  Calendrier CRM
                  <Pill kind="accent" dot>
                    natif
                  </Pill>
                </div>
                <div className="e">RDV, tâches et évènements récurrents</div>
              </div>
              <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
            </div>

            {google?.last_error ? (
              <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 8 }}>
                Dernière erreur de synchronisation : {google.last_error.slice(0, 120)}
              </div>
            ) : null}

            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
              L&apos;occupé de ces agendas est soustrait de vos créneaux, et chaque RDV confirmé y
              est créé — avec lien Google Meet automatique pour les visios.
            </div>
          </Blk>

          <Blk
            title="Emails & rappels"
            ic="mail"
            right={
              <Pill kind="ok" dot>
                Resend actif
              </Pill>
            }
          >
            <Stack gap={0}>
              {(
                [
                  ["Confirmation à l'invité", "immédiat · avec .ics + lien de gestion"],
                  ["Notification à l'hôte", "immédiat · in-app + email"],
                  ["Rappels avant le RDV", "réglés par type d'évènement · cron toutes les 5 min"],
                  ["Annulation / report", "aux deux parties, avec .ics de mise à jour"],
                ] as [string, string][]
              ).map(([n, d], i) => (
                <Row
                  key={n}
                  style={{ padding: "8px 0", borderTop: i ? "1px solid var(--border)" : 0, gap: 9 }}
                >
                  <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5 }}>{n}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>{d}</div>
                  </div>
                </Row>
              ))}
            </Stack>
          </Blk>
        </Stack>

        <Blk title="Intégrer sur un site" ic="code">
          <Stack gap={12}>
            <Field label="Quoi intégrer ?">
              <select
                className="rv-in"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Ma page complète (tous les types)</option>
                {types
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.title} ({t.duration_minutes} min)
                    </option>
                  ))}
              </select>
            </Field>

            <div className="rv-kinds">
              {EMBED_KINDS.map((k) => (
                <button
                  type="button"
                  key={k.id}
                  className={`rv-kind ${kind === k.id ? "on" : ""}`.trim()}
                  onClick={() => setKind(k.id)}
                >
                  <Icon name={k.ic} className="ico-lg" />
                  <div className="n">{k.n}</div>
                  <div className="d">{k.d}</div>
                </button>
              ))}
            </div>

            {kind !== "inline" && (
              <div className="rv-grid2">
                <Field label="Texte du bouton">
                  <input className="rv-in" value={txt} onChange={(e) => setTxt(e.target.value)} />
                </Field>
                {kind === "floating" && (
                  <Field label="Position">
                    <Seg
                      opts={[
                        { id: "left", lb: "Bas gauche" },
                        { id: "right", lb: "Bas droite" },
                      ]}
                      val={pos}
                      set={setPos}
                    />
                  </Field>
                )}
              </div>
            )}

            <div>
              <span className="rv-lb">Aperçu sur le site client</span>
              <div className="rv-embed-prev" style={{ marginTop: 6 }}>
                <div className="fake">
                  <i className="t" />
                  <i style={{ width: "88%" }} />
                  <i style={{ width: "72%" }} />
                  <i style={{ width: "80%" }} />
                </div>
                {kind === "inline" ? (
                  <div className="inl">calendrier Cal.SAMA · hauteur auto</div>
                ) : (
                  <div className={`fb ${pos === "left" ? "left" : ""}`.trim()}>
                    <Icon name="calendar" className="ico-sm" />
                    {txt}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Row style={{ marginBottom: 6 }}>
                <span className="rv-lb">Snippet</span>
                <span style={{ flex: 1 }} />
                <Btn
                  kind="outline"
                  size="xs"
                  ic="copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(snip.join("\n"));
                    toast.success("Snippet d'intégration copié");
                  }}
                >
                  Copier
                </Btn>
              </Row>
              <Code lines={snip} />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              Préremplissage possible avec{" "}
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--bg-2)",
                  padding: "1px 4px",
                  borderRadius: 4,
                }}
              >
                ?name=&amp;email=
              </code>
              . L&apos;iframe s&apos;auto-redimensionne, la popup se ferme avec Échap.
            </div>
          </Stack>
        </Blk>
      </div>
    </>
  );
}
