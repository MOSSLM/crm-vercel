"use client";

/**
 * Ma page — portage de `ScreenPage` (rdv-screens-d.jsx) : réglages de
 * l'identité publique à gauche, et aperçu navigateur de la page invité à
 * droite (profil / créneaux), rendu dans une fausse fenêtre.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchEventTypes,
  fetchSchedulingPage,
  patchSchedulingPage,
} from "@/lib/scheduling/client";
import type { EventType, SchedulingPage } from "@/lib/scheduling/types";
import { Blk, Btn, Field, Row, Seg, Stack, Sw } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import { SectionHeader } from "./CalShell";
import { getAppUrlClient } from "../rdv/shared";
import { timezoneOptions } from "./shared";

// Cinq choix de marque, donc cinq teintes qui ne se confondent pas : l'azur
// prend la place de l'orange, et l'ancien bleu voisin devient la sarcelle.
const BRAND_COLORS = ["#2F7AE0", "#122844", "#0E93A6", "#2E9E6B", "#7A5AE0"];

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export default function PageSettings() {
  const [page, setPage] = useState<SchedulingPage | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [types, setTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pv, setPv] = useState("profile");
  const [tid, setTid] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        fetchSchedulingPage(),
        fetchEventTypes().catch(() => ({ event_types: [] as EventType[] })),
      ]);
      setPage(p.page);
      setPublicUrl(p.public_url);
      setTypes(t.event_types);
      const first = t.event_types.find((x) => x.is_active);
      if (first) setTid(first.slug);
      setDirty(false);
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

  const set = <K extends keyof SchedulingPage>(k: K, v: SchedulingPage[K]) => {
    setPage((p) => (p ? { ...p, [k]: v } : p));
    setDirty(true);
  };

  const save = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const r = await patchSchedulingPage({
        username: page.username,
        display_name: page.display_name,
        bio: page.bio,
        brand_color: page.brand_color,
        timezone: page.timezone,
        is_active: page.is_active,
      });
      setPage(r.page);
      setPublicUrl(r.public_url);
      setDirty(false);
      toast.success("Page enregistrée");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "username_taken" ? "Ce nom d'utilisateur est déjà pris" : "Enregistrement impossible",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !page) {
    return (
      <>
        <SectionHeader title="Ma page" subtitle="Ce que voit le prospect sur votre lien public." />
        <div className="rv-empty" style={{ padding: 40 }}>
          Chargement…
        </div>
      </>
    );
  }

  const previewUrl = `${publicUrl}${pv === "profile" ? "" : `/${tid}`}?embed=1`;

  return (
    <>
      <SectionHeader
        title="Ma page"
        subtitle="Ce que voit le prospect : votre profil, l'ordre des types, et la réservation de bout en bout."
        actions={
          <>
            <Btn
              kind="outline"
              ic="copy"
              onClick={() => {
                void navigator.clipboard.writeText(publicUrl);
                toast.success("Lien public copié");
              }}
            >
              Copier le lien
            </Btn>
            <Btn kind="accent" ic="check" disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Btn>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 18, alignItems: "start" }}>
        <Stack gap={14}>
          <Blk title="Identité publique" ic="user">
            <Stack gap={11}>
              <Field label="Adresse de la page">
                <Row style={{ gap: 0 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-4)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-2)",
                      borderRight: 0,
                      borderRadius: "7px 0 0 7px",
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 7px",
                    }}
                  >
                    …/rdv/
                  </span>
                  <input
                    className="rv-in mono"
                    style={{ borderRadius: "0 7px 7px 0" }}
                    value={page.username}
                    onChange={(e) => set("username", slugify(e.target.value))}
                  />
                </Row>
              </Field>

              <Field label="Nom affiché">
                <input
                  className="rv-in"
                  value={page.display_name}
                  onChange={(e) => set("display_name", e.target.value)}
                />
              </Field>

              <Field label="Accroche" hint="2 lignes max — c'est la première chose lue.">
                <textarea
                  className="rv-in"
                  rows={2}
                  value={page.bio ?? ""}
                  onChange={(e) => set("bio", e.target.value || null)}
                  placeholder="Ce que vous faites, en une phrase."
                />
              </Field>

              <Field label="Couleur de marque">
                <Row style={{ gap: 6 }}>
                  {BRAND_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Couleur ${c}`}
                      onClick={() => set("brand_color", c)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: c,
                        border:
                          page.brand_color === c
                            ? "2px solid var(--text)"
                            : "1px solid var(--border-2)",
                      }}
                    />
                  ))}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-3)",
                      marginLeft: 4,
                    }}
                  >
                    {page.brand_color}
                  </span>
                </Row>
              </Field>

              <Field label="Fuseau de référence">
                <select
                  className="rv-in mono"
                  value={page.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                >
                  {timezoneOptions().map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>

              <div
                className="rv-opt-row"
                style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}
              >
                <div className="tx">
                  <div className="n">Page active</div>
                  <div className="d">Désactivée, le lien renvoie une page introuvable.</div>
                </div>
                <Sw on={page.is_active} onClick={() => set("is_active", !page.is_active)} />
              </div>
            </Stack>
          </Blk>

          <Blk title="Ce qui est affiché" ic="palette">
            <div className="rv-opt-row">
              <div className="tx">
                <div className="n">Photo de profil</div>
                <div className="d">Sinon, initiales sur la couleur de marque.</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-4)" }}>initiales</span>
            </div>
            <div className="rv-opt-row">
              <div className="tx">
                <div className="n">Durées et lieu sur chaque type</div>
                <div className="d">En pastilles, sous le titre.</div>
              </div>
              <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
            </div>
            <div className="rv-opt-row">
              <div className="tx">
                <div className="n">Ordre des types</div>
                <div className="d">Réglé dans « Types d&apos;évènements ».</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                {types.filter((t) => t.is_active).length} actifs
              </span>
            </div>
            <div className="rv-opt-row">
              <div className="tx">
                <div className="n">Fuseau de l&apos;invité</div>
                <div className="d">Détecté au chargement, modifiable par lui.</div>
              </div>
              <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
            </div>
          </Blk>
        </Stack>

        <div>
          <Row style={{ marginBottom: 10 }}>
            <Seg
              opts={[
                { id: "profile", lb: "Profil" },
                { id: "slots", lb: "Réservation" },
              ]}
              val={pv}
              set={setPv}
              lg
            />
            <span style={{ flex: 1 }} />
            {pv !== "profile" && types.length ? (
              <select
                className="rv-in"
                style={{ width: 210 }}
                value={tid}
                onChange={(e) => setTid(e.target.value)}
              >
                {types
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.title}
                    </option>
                  ))}
              </select>
            ) : null}
          </Row>

          <div className="rv-stage" style={{ padding: 0, overflow: "hidden", background: "var(--bg-3)" }}>
            <div style={{ width: "100%" }}>
              <Row
                style={{
                  padding: "9px 12px",
                  borderBottom: "1px solid var(--border-2)",
                  background: "var(--bg-2)",
                  gap: 10,
                }}
              >
                <Row style={{ gap: 5 }}>
                  {["#2F7AE0", "#C8881F", "#2E9E6B"].map((c) => (
                    <i
                      key={c}
                      style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }}
                    />
                  ))}
                </Row>
                <div
                  style={{
                    flex: 1,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px",
                    gap: 6,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-3)",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="shield" className="ico-xs" style={{ color: "var(--ok)" }} />
                  {publicUrl.replace(/^https?:\/\//, "")}
                  {pv !== "profile" && tid ? `/${tid}` : ""}
                </div>
                <Btn
                  kind="ghost"
                  size="xs"
                  ic="ext"
                  onClick={() =>
                    window.open(`${publicUrl}${pv === "profile" ? "" : `/${tid}`}`, "_blank")
                  }
                />
              </Row>
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="Aperçu de la page publique"
                style={{ width: "100%", height: 620, border: 0, background: "var(--bg-2)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
