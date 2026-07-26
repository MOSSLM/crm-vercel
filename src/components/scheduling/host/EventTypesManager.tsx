"use client";

/**
 * Types d'évènements — portage de `ScreenTypes` + `TypeEditor`
 * (rdv-screens-b.jsx) : grille de cartes `rv-type` et éditeur en tiroir à
 * onglets (Général / Disponibilité / Formulaire / Rappels / Avancé).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createEventType,
  deleteEventType,
  fetchEventTypes,
  fetchSchedulingPage,
  patchEventType,
} from "@/lib/scheduling/client";
import type { CustomQuestion, EventType } from "@/lib/scheduling/types";
import { Blk, Btn, Chip, Field, QT, RV_LOC, Row, Seg, Stack, Sw, fmtDur, fmtMin } from "../rdv/atoms";
import { Icon } from "../rdv/Icon";
import { SectionHeader } from "./CalShell";
import { getAppUrlClient } from "../rdv/shared";

const TABS = [
  { id: "gen", lb: "Général" },
  { id: "dis", lb: "Disponibilité" },
  { id: "form", lb: "Formulaire" },
  { id: "rem", lb: "Rappels" },
  { id: "adv", lb: "Avancé" },
];
const COLORS = ["#E2552B", "#3B7DD8", "#2E9E6B", "#7A5AE0", "#C8881F", "#B5322F", "#14120E"];
const REMINDER_CHOICES = [2880, 1440, 180, 60, 15];

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

type Draft = {
  title: string;
  slug: string;
  description: string;
  duration_minutes: number;
  slot_interval_minutes: number | null;
  location_type: EventType["location_type"];
  location_details: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_window_days: number;
  max_bookings_per_day: number | null;
  max_bookings_per_week: number | null;
  requires_confirmation: boolean;
  custom_questions: CustomQuestion[];
  reminder_minutes: number[];
  color: string | null;
  price_cents: number | null;
  success_redirect_url: string;
  is_active: boolean;
};

const EMPTY: Draft = {
  title: "",
  slug: "",
  description: "",
  duration_minutes: 30,
  slot_interval_minutes: null,
  location_type: "google_meet",
  location_details: "",
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 240,
  booking_window_days: 60,
  max_bookings_per_day: null,
  max_bookings_per_week: null,
  requires_confirmation: false,
  custom_questions: [],
  reminder_minutes: [1440, 60],
  color: "#E2552B",
  price_cents: null,
  success_redirect_url: "",
  is_active: true,
};

const toDraft = (t: EventType): Draft => ({
  title: t.title,
  slug: t.slug,
  description: t.description ?? "",
  duration_minutes: t.duration_minutes,
  slot_interval_minutes: t.slot_interval_minutes,
  location_type: t.location_type,
  location_details: t.location_details ?? "",
  buffer_before_minutes: t.buffer_before_minutes,
  buffer_after_minutes: t.buffer_after_minutes,
  minimum_notice_minutes: t.minimum_notice_minutes,
  booking_window_days: t.booking_window_days,
  max_bookings_per_day: t.max_bookings_per_day,
  max_bookings_per_week: t.max_bookings_per_week,
  requires_confirmation: t.requires_confirmation,
  custom_questions: t.custom_questions ?? [],
  reminder_minutes: t.reminder_minutes ?? [],
  color: t.color,
  price_cents: t.price_cents,
  success_redirect_url: t.success_redirect_url ?? "",
  is_active: t.is_active,
});

export default function EventTypesManager() {
  const [types, setTypes] = useState<EventType[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventType | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, page] = await Promise.all([fetchEventTypes(), fetchSchedulingPage()]);
      setTypes(t.event_types);
      setUsername(page.page.username);
      setPublicUrl(page.public_url);
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

  const toggle = async (t: EventType) => {
    setTypes((l) => l.map((x) => (x.id === t.id ? { ...x, is_active: !t.is_active } : x)));
    try {
      await patchEventType(t.id, { is_active: !t.is_active });
    } catch {
      toast.error("Impossible de changer l'état");
      void load();
    }
  };

  const copyLink = (t: EventType) => {
    void navigator.clipboard.writeText(`${getAppUrlClient()}/rdv/${username}/${t.slug}`);
    toast.success("Lien de réservation copié");
  };

  return (
    <>
      <SectionHeader
        title="Types d'évènements"
        subtitle="Chaque type a son lien, sa durée, ses règles et son formulaire. C'est ce que l'invité choisit sur votre page."
        actions={
          <>
            <Btn kind="outline" ic="eye" onClick={() => publicUrl && window.open(publicUrl, "_blank")}>
              Aperçu invité
            </Btn>
            <Btn kind="primary" ic="plus" onClick={() => setEditing("new")}>
              Nouveau type
            </Btn>
          </>
        }
      />

      {loading ? (
        <div className="rv-empty" style={{ padding: 40 }}>
          Chargement…
        </div>
      ) : (
        <div className="rv-types">
          {types.map((t) => {
            const loc = RV_LOC[t.location_type] ?? RV_LOC.custom;
            return (
              <div key={t.id} className={`rv-type ${t.is_active ? "" : "off"}`.trim()}>
                <div className="top">
                  <i className="cdot" style={{ background: t.color || "var(--accent)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="t">{t.title}</h3>
                    <div className="slug">
                      {getAppUrlClient().replace(/^https?:\/\//, "")}/rdv/{username}/{t.slug}
                    </div>
                  </div>
                </div>
                <p className="ds">{t.description || "Aucune description."}</p>
                <div className="chips">
                  <Chip ic="clock">{fmtDur(t.duration_minutes)}</Chip>
                  <Chip ic={loc.ic}>{loc.lb}</Chip>
                  {t.requires_confirmation && <Chip ic="hourglass">À valider</Chip>}
                  {!!t.custom_questions?.length && (
                    <Chip ic="doc">
                      {t.custom_questions.length} question
                      {t.custom_questions.length > 1 ? "s" : ""}
                    </Chip>
                  )}
                  {!!t.reminder_minutes?.length && (
                    <Chip ic="bell">
                      {t.reminder_minutes.length} rappel{t.reminder_minutes.length > 1 ? "s" : ""}
                    </Chip>
                  )}
                  {t.price_cents ? (
                    <Chip ic="euro">
                      {(t.price_cents / 100).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: t.currency || "EUR",
                      })}
                    </Chip>
                  ) : null}
                </div>
                <div className="ft">
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: t.is_active ? "var(--text-3)" : "var(--text-4)",
                    }}
                  >
                    {t.is_active ? `intervalle ${t.slot_interval_minutes ?? t.duration_minutes} min` : "masqué de votre page"}
                  </span>
                  <span className="sp" />
                  <Btn kind="outline" size="xs" ic="copy" onClick={() => copyLink(t)}>
                    Lien
                  </Btn>
                  <Btn kind="outline" size="xs" ic="sliders" onClick={() => setEditing(t)}>
                    Modifier
                  </Btn>
                  <Sw on={t.is_active} onClick={() => void toggle(t)} />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="rv-type"
            onClick={() => setEditing("new")}
            style={{
              borderStyle: "dashed",
              boxShadow: "none",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-3)",
              font: "inherit",
              fontSize: 12.5,
              minHeight: 168,
              background: "transparent",
            }}
          >
            <Icon name="plus" className="ico-xl" style={{ color: "var(--text-4)" }} />
            Créer un type de rendez-vous
          </button>
        </div>
      )}

      {editing ? (
        <TypeEditor
          source={editing}
          username={username}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function TypeEditor({
  source,
  username,
  onClose,
  onSaved,
}: {
  source: EventType | "new";
  username: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isNew = source === "new";
  const [tab, setTab] = useState("gen");
  const [d, setD] = useState<Draft>(isNew ? { ...EMPTY } : toDraft(source));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!d.title.trim() || !d.slug.trim()) {
      toast.error("Titre et lien sont requis");
      setTab("gen");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...d,
        title: d.title.trim(),
        slug: d.slug.trim(),
        description: d.description.trim() || null,
        location_details: d.location_details.trim() || null,
        success_redirect_url: d.success_redirect_url.trim() || null,
        custom_questions: d.custom_questions.map((q, i) => ({
          ...q,
          id: q.id || `q${i + 1}`,
          options: q.type === "select" ? q.options ?? [] : undefined,
        })),
      };
      if (isNew) await createEventType(payload);
      else await patchEventType(source.id, payload);
      toast.success(isNew ? "Type d'évènement créé" : "Modifications enregistrées");
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg === "slug_taken" ? "Ce lien est déjà utilisé" : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    try {
      await deleteEventType(source.id);
      toast.success("Type d'évènement supprimé");
      await onSaved();
    } catch {
      toast.error("Suppression impossible");
    }
  };

  const addQuestion = () =>
    set("custom_questions", [
      ...d.custom_questions,
      { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false },
    ]);

  const patchQuestion = (i: number, patch: Partial<CustomQuestion>) =>
    set(
      "custom_questions",
      d.custom_questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    );

  const moveQuestion = (i: number, delta: -1 | 1) => {
    const arr = [...d.custom_questions];
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set("custom_questions", arr);
  };

  return (
    <div
      className="rv-ov"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rv-drawer" role="dialog" aria-modal="true">
        <div className="rv-dr-hd">
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: d.color || "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="calCog" className="ico-lg" style={{ color: "#fff" }} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 className="t">{d.title || "Nouveau type de rendez-vous"}</h2>
            <div className="s">
              /rdv/{username}/{d.slug || "…"} · {fmtDur(d.duration_minutes)}
            </div>
          </div>
          <button type="button" className="cx" onClick={onClose} aria-label="Fermer">
            <Icon name="x" className="ico-sm" />
          </button>
        </div>

        <div className="rv-dr-tabs">
          {TABS.map((x) => (
            <button
              type="button"
              key={x.id}
              className={tab === x.id ? "on" : ""}
              onClick={() => setTab(x.id)}
            >
              {x.lb}
            </button>
          ))}
        </div>

        <div className="rv-dr-bd">
          {tab === "gen" && (
            <>
              <Blk title="Identité">
                <Stack gap={11}>
                  <Field label="Titre">
                    <input
                      className="rv-in"
                      value={d.title}
                      onChange={(e) => {
                        set("title", e.target.value);
                        if (!slugTouched) set("slug", slugify(e.target.value));
                      }}
                      placeholder="Appel découverte"
                    />
                  </Field>
                  <Field label="Lien public" hint="Minuscules, chiffres et tirets.">
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
                          whiteSpace: "nowrap",
                        }}
                      >
                        /rdv/{username}/
                      </span>
                      <input
                        className="rv-in mono"
                        style={{ borderRadius: "0 7px 7px 0" }}
                        value={d.slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          set("slug", slugify(e.target.value));
                        }}
                      />
                    </Row>
                  </Field>
                  <Field label="Description affichée à l'invité">
                    <textarea
                      className="rv-in"
                      rows={3}
                      value={d.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </Field>
                </Stack>
              </Blk>

              <Blk title="Format">
                <Stack gap={12}>
                  <Field label="Durée">
                    <Row style={{ gap: 8 }}>
                      <Seg
                        opts={[15, 20, 30, 45, 60, 90].map((m) => ({ id: String(m), lb: `${m}′` }))}
                        val={String(d.duration_minutes)}
                        set={(v) => set("duration_minutes", Number(v))}
                        accent
                      />
                      <span
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)" }}
                      >
                        ou{" "}
                        <input
                          className="rv-in mono"
                          style={{ width: 54, height: 24, display: "inline-block" }}
                          value={d.duration_minutes}
                          onChange={(e) => set("duration_minutes", Number(e.target.value) || 30)}
                        />{" "}
                        min
                      </span>
                    </Row>
                  </Field>

                  <Field label="Lieu">
                    <div className="rv-grid3">
                      {Object.entries(RV_LOC).map(([k, v]) => (
                        <button
                          type="button"
                          key={k}
                          className={`rv-kind ${d.location_type === k ? "on" : ""}`.trim()}
                          style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 7 }}
                          onClick={() => set("location_type", k as EventType["location_type"])}
                        >
                          <Icon name={v.ic} className="ico-sm" />
                          <span style={{ fontSize: 11.5, fontWeight: 500 }}>{v.lb}</span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field
                    label={
                      d.location_type === "in_person"
                        ? "Adresse communiquée à l'invité"
                        : d.location_type === "google_meet"
                          ? "Lien fixe (sinon Meet créé automatiquement)"
                          : "Lien ou consigne"
                    }
                  >
                    <input
                      className="rv-in"
                      value={d.location_details}
                      onChange={(e) => set("location_details", e.target.value)}
                      placeholder={
                        d.location_type === "in_person" ? "12 rue des Artisans, 94400 Vitry" : "https://…"
                      }
                    />
                  </Field>

                  <Field label="Couleur (agenda + page publique)">
                    <Row style={{ gap: 6 }}>
                      {COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => set("color", c)}
                          aria-label={`Couleur ${c}`}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            background: c,
                            border: d.color === c ? "2px solid var(--text)" : "1px solid var(--border-2)",
                            boxShadow: d.color === c ? "0 0 0 2px var(--bg)" : "none",
                          }}
                        />
                      ))}
                    </Row>
                  </Field>
                </Stack>
              </Blk>
            </>
          )}

          {tab === "dis" && (
            <>
              <Blk title="Règles de créneaux">
                <Stack gap={11}>
                  <div className="rv-grid2">
                    <Field label="Intervalle de départ" hint="Créneaux toutes les X min.">
                      <select
                        className="rv-in"
                        value={d.slot_interval_minutes ?? "auto"}
                        onChange={(e) =>
                          set(
                            "slot_interval_minutes",
                            e.target.value === "auto" ? null : Number(e.target.value),
                          )
                        }
                      >
                        <option value="auto">Comme la durée</option>
                        {[15, 20, 30, 60].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Préavis minimum" hint="Pas de réservation dans l'immédiat.">
                      <select
                        className="rv-in"
                        value={d.minimum_notice_minutes}
                        onChange={(e) => set("minimum_notice_minutes", Number(e.target.value))}
                      >
                        {[0, 60, 120, 240, 720, 1440, 2880].map((m) => (
                          <option key={m} value={m}>
                            {m === 0 ? "Aucun" : `${fmtMin(m)} avant`}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="rv-grid2">
                    <Field label="Battement avant">
                      <select
                        className="rv-in"
                        value={d.buffer_before_minutes}
                        onChange={(e) => set("buffer_before_minutes", Number(e.target.value))}
                      >
                        {[0, 5, 10, 15, 30, 45].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Battement après">
                      <select
                        className="rv-in"
                        value={d.buffer_after_minutes}
                        onChange={(e) => set("buffer_after_minutes", Number(e.target.value))}
                      >
                        {[0, 5, 10, 15, 30, 45].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="rv-grid2">
                    <Field label="Fenêtre de réservation">
                      <select
                        className="rv-in"
                        value={d.booking_window_days}
                        onChange={(e) => set("booking_window_days", Number(e.target.value))}
                      >
                        {[7, 14, 30, 60, 90, 180, 365].map((v) => (
                          <option key={v} value={v}>
                            {v} jours à l&apos;avance
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Validation manuelle" hint="Vous confirmez chaque demande.">
                      <Row style={{ gap: 8 }}>
                        <Sw
                          on={d.requires_confirmation}
                          onClick={() => set("requires_confirmation", !d.requires_confirmation)}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                          {d.requires_confirmation ? "Activée" : "Réservation immédiate"}
                        </span>
                      </Row>
                    </Field>
                  </div>
                  <div className="rv-grid2">
                    <Field label="Maximum par jour" hint="Vide = illimité.">
                      <input
                        className="rv-in"
                        type="number"
                        min={1}
                        value={d.max_bookings_per_day ?? ""}
                        onChange={(e) =>
                          set("max_bookings_per_day", e.target.value ? Number(e.target.value) : null)
                        }
                      />
                    </Field>
                    <Field label="Maximum par semaine" hint="Vide = illimité.">
                      <input
                        className="rv-in"
                        type="number"
                        min={1}
                        value={d.max_bookings_per_week ?? ""}
                        onChange={(e) =>
                          set("max_bookings_per_week", e.target.value ? Number(e.target.value) : null)
                        }
                      />
                    </Field>
                  </div>
                </Stack>
              </Blk>
            </>
          )}

          {tab === "form" && (
            <Blk
              title="Questions posées à l'invité"
              right={
                <Btn kind="ghost" size="xs" ic="plus" onClick={addQuestion}>
                  Question
                </Btn>
              }
            >
              {d.custom_questions.length === 0 ? (
                <div className="rv-empty">
                  Nom et email sont toujours demandés. Ajoutez des questions si besoin.
                </div>
              ) : (
                <Stack gap={8}>
                  {d.custom_questions.map((q, i) => (
                    <div
                      key={q.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 9,
                        padding: 10,
                        background: "var(--surface-2)",
                      }}
                    >
                      <Row style={{ gap: 6, flexWrap: "wrap" }}>
                        <input
                          className="rv-in"
                          style={{ flex: 1, minWidth: 150 }}
                          value={q.label}
                          placeholder="Intitulé de la question"
                          onChange={(e) => patchQuestion(i, { label: e.target.value })}
                        />
                        <select
                          className="rv-in"
                          style={{ width: 140 }}
                          value={q.type}
                          onChange={(e) =>
                            patchQuestion(i, { type: e.target.value as CustomQuestion["type"] })
                          }
                        >
                          {Object.entries(QT).map(([k, [, lb]]) => (
                            <option key={k} value={k}>
                              {lb}
                            </option>
                          ))}
                        </select>
                        <Row style={{ gap: 5 }}>
                          <Sw
                            on={q.required}
                            onClick={() => patchQuestion(i, { required: !q.required })}
                          />
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>Obligatoire</span>
                        </Row>
                        <Btn kind="ghost" size="xs" ic="chevup" onClick={() => moveQuestion(i, -1)} />
                        <Btn kind="ghost" size="xs" ic="chevdown" onClick={() => moveQuestion(i, 1)} />
                        <Btn
                          kind="ghost"
                          size="xs"
                          ic="trash"
                          onClick={() =>
                            set(
                              "custom_questions",
                              d.custom_questions.filter((_, idx) => idx !== i),
                            )
                          }
                        />
                      </Row>
                      {q.type === "select" ? (
                        <input
                          className="rv-in"
                          style={{ marginTop: 7 }}
                          value={(q.options ?? []).join(", ")}
                          placeholder="Options séparées par des virgules"
                          onChange={(e) =>
                            patchQuestion(i, {
                              options: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                </Stack>
              )}
            </Blk>
          )}

          {tab === "rem" && (
            <Blk title="Rappels par email" ic="bell">
              <Stack gap={9}>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Envoyés à l&apos;invité et à vous, avant le rendez-vous.
                </div>
                <Row style={{ gap: 6, flexWrap: "wrap" }}>
                  {REMINDER_CHOICES.map((m) => {
                    const on = d.reminder_minutes.includes(m);
                    return (
                      <button
                        type="button"
                        key={m}
                        className={`rv-kind ${on ? "on" : ""}`.trim()}
                        style={{ padding: "6px 11px", fontSize: 11.5, fontWeight: 500 }}
                        onClick={() =>
                          set(
                            "reminder_minutes",
                            on
                              ? d.reminder_minutes.filter((x) => x !== m)
                              : [...d.reminder_minutes, m],
                          )
                        }
                      >
                        {fmtMin(m)} avant
                      </button>
                    );
                  })}
                </Row>
              </Stack>
            </Blk>
          )}

          {tab === "adv" && (
            <>
              <Blk title="Paiement">
                <Field label="Prix (€)" hint="Vide = gratuit. Affiché sur la page publique.">
                  <input
                    className="rv-in"
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.price_cents == null ? "" : d.price_cents / 100}
                    onChange={(e) =>
                      set(
                        "price_cents",
                        e.target.value ? Math.round(Number(e.target.value) * 100) : null,
                      )
                    }
                  />
                </Field>
              </Blk>
              <Blk title="Après la réservation">
                <Field label="Redirection" hint="Laisser vide pour afficher la confirmation SAMA.">
                  <input
                    className="rv-in"
                    value={d.success_redirect_url}
                    onChange={(e) => set("success_redirect_url", e.target.value)}
                    placeholder="https://votre-site.fr/merci"
                  />
                </Field>
              </Blk>
              {!isNew ? (
                <Blk title="Zone de danger">
                  {confirmDelete ? (
                    <Row style={{ gap: 7 }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>
                        Le lien public cessera de fonctionner. Les RDV déjà pris sont conservés.
                      </span>
                      <Btn kind="outline" size="xs" onClick={() => setConfirmDelete(false)}>
                        Annuler
                      </Btn>
                      <Btn kind="danger" size="xs" ic="trash" onClick={() => void remove()}>
                        Supprimer
                      </Btn>
                    </Row>
                  ) : (
                    <Btn kind="danger" size="xs" ic="trash" onClick={() => setConfirmDelete(true)}>
                      Supprimer ce type
                    </Btn>
                  )}
                </Blk>
              ) : null}
            </>
          )}
        </div>

        <div className="rv-dr-ft">
          <Btn kind="outline" onClick={onClose}>
            Annuler
          </Btn>
          <span className="sp" />
          <Btn kind="primary" ic="check" disabled={saving} onClick={() => void save()}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
