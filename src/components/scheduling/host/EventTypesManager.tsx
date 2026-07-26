"use client";

/**
 * Builder des types d'évènements : liste + éditeur complet (durée, lieu,
 * buffers, préavis, fenêtre, limites, questions custom, validation manuelle,
 * rappels, couleur, prix, redirection). Copie de lien en un clic.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createEventType,
  deleteEventType,
  fetchEventTypes,
  fetchSchedulingPage,
  patchEventType,
} from "@/lib/scheduling/client";
import type { CustomQuestion, EventType } from "@/lib/scheduling/types";
import { LOCATION_LABELS } from "@/lib/scheduling/types";
import { getAppUrlClient } from "./shared";

const DEFAULT_FORM = {
  title: "",
  slug: "",
  description: "",
  duration_minutes: 30,
  slot_interval_minutes: null as number | null,
  location_type: "google_meet" as EventType["location_type"],
  location_details: "",
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 240,
  booking_window_days: 60,
  max_bookings_per_day: null as number | null,
  max_bookings_per_week: null as number | null,
  requires_confirmation: false,
  custom_questions: [] as CustomQuestion[],
  reminder_minutes: [1440, 60] as number[],
  color: null as string | null,
  price_cents: null as number | null,
  success_redirect_url: "",
  is_active: true,
};

type FormState = typeof DEFAULT_FORM;

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${Math.floor(m / 60)} h`;

const REMINDER_CHOICES = [
  { minutes: 2880, label: "2 jours avant" },
  { minutes: 1440, label: "La veille" },
  { minutes: 180, label: "3 h avant" },
  { minutes: 60, label: "1 h avant" },
  { minutes: 15, label: "15 min avant" },
];

export default function EventTypesManager() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventType | "new" | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [types, page] = await Promise.all([fetchEventTypes(), fetchSchedulingPage()]);
      setEventTypes(types.event_types);
      setUsername(page.page.username);
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

  const openEditor = (et: EventType | "new") => {
    setEditing(et);
    setSlugTouched(et !== "new");
    setForm(
      et === "new"
        ? { ...DEFAULT_FORM }
        : {
            title: et.title,
            slug: et.slug,
            description: et.description ?? "",
            duration_minutes: et.duration_minutes,
            slot_interval_minutes: et.slot_interval_minutes,
            location_type: et.location_type,
            location_details: et.location_details ?? "",
            buffer_before_minutes: et.buffer_before_minutes,
            buffer_after_minutes: et.buffer_after_minutes,
            minimum_notice_minutes: et.minimum_notice_minutes,
            booking_window_days: et.booking_window_days,
            max_bookings_per_day: et.max_bookings_per_day,
            max_bookings_per_week: et.max_bookings_per_week,
            requires_confirmation: et.requires_confirmation,
            custom_questions: et.custom_questions ?? [],
            reminder_minutes: et.reminder_minutes ?? [1440, 60],
            color: et.color,
            price_cents: et.price_cents,
            success_redirect_url: et.success_redirect_url ?? "",
            is_active: et.is_active,
          },
    );
  };

  const save = async () => {
    if (!form.title.trim() || !form.slug.trim()) {
      toast.error("Titre et slug sont requis");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        location_details: form.location_details.trim() || null,
        success_redirect_url: form.success_redirect_url.trim() || null,
        custom_questions: form.custom_questions.map((q, i) => ({
          ...q,
          id: q.id || `q${i + 1}`,
          options: q.type === "select" ? q.options ?? [] : undefined,
        })),
      };
      if (editing === "new") {
        await createEventType(payload);
        toast.success("Type d'évènement créé");
      } else if (editing) {
        await patchEventType(editing.id, payload);
        toast.success("Modifications enregistrées");
      }
      setEditing(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg === "slug_taken" ? "Ce slug est déjà utilisé" : "Enregistrement impossible", {
        description: msg && msg !== "slug_taken" ? msg : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (et: EventType) => {
    try {
      await patchEventType(et.id, { is_active: !et.is_active });
      setEventTypes((list) =>
        list.map((x) => (x.id === et.id ? { ...x, is_active: !et.is_active } : x)),
      );
    } catch {
      toast.error("Impossible de changer l'état");
    }
  };

  const copyLink = (et: EventType) => {
    if (!username) return;
    void navigator.clipboard.writeText(`${getAppUrlClient()}/rdv/${username}/${et.slug}`);
    toast.success("Lien de réservation copié");
  };

  const removeQuestion = (idx: number) =>
    setForm((f) => ({
      ...f,
      custom_questions: f.custom_questions.filter((_, i) => i !== idx),
    }));

  const moveQuestion = (idx: number, delta: -1 | 1) =>
    setForm((f) => {
      const arr = [...f.custom_questions];
      const j = idx + delta;
      if (j < 0 || j >= arr.length) return f;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...f, custom_questions: arr };
    });

  const numField = (v: number | null): string => (v == null ? "" : `${v}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Chaque type d&apos;évènement a son lien public réservable.
        </p>
        <Button size="sm" onClick={() => openEditor("new")}>
          <Plus className="mr-1.5 h-4 w-4" /> Nouveau type
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : eventTypes.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center">
          <CalendarPlus className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Créez votre premier type d&apos;évènement pour obtenir un lien réservable.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {eventTypes.map((et) => (
            <div
              key={et.id}
              className={`rounded-xl border bg-card p-4 shadow-sm ${et.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-10 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: et.color || "var(--primary)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{et.title}</p>
                    {!et.is_active ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        Désactivé
                      </span>
                    ) : null}
                    {et.requires_confirmation ? (
                      <span className="rounded-full bg-[var(--warn-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
                        Validation manuelle
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {durationLabel(et.duration_minutes)} ·{" "}
                    {LOCATION_LABELS[et.location_type] ?? et.location_type}
                    {et.price_cents
                      ? ` · ${(et.price_cents / 100).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: et.currency || "EUR",
                        })}`
                      : ""}
                  </p>
                  <p className="cal-mono mt-1 truncate text-[11px] text-muted-foreground">
                    /rdv/{username ?? "…"}/{et.slug}
                  </p>
                </div>
                <Switch
                  checked={et.is_active}
                  onCheckedChange={() => void toggleActive(et)}
                  aria-label="Activer / désactiver"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyLink(et)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copier le lien
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditor(et)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--danger)] hover:text-[var(--danger)]"
                  onClick={() => setDeleteTarget(et)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Éditeur */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Nouveau type d'évènement" : "Modifier le type d'évènement"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Essentiel */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="et-title">Titre *</Label>
                <Input
                  id="et-title"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((f) => ({
                      ...f,
                      title,
                      slug: slugTouched ? f.slug : slugify(title),
                    }));
                  }}
                  placeholder="Appel découverte"
                />
              </div>
              <div>
                <Label htmlFor="et-slug">Slug (URL) *</Label>
                <Input
                  id="et-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                  }}
                  placeholder="appel-decouverte"
                />
              </div>
              <div>
                <Label htmlFor="et-color">Couleur</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="et-color"
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border bg-transparent"
                    value={form.color ?? "#2A6FDB"}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  />
                  {form.color ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm((f) => ({ ...f, color: null }))}
                    >
                      Réinitialiser
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="et-desc">Description</Label>
                <Textarea
                  id="et-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Affichée sur la page publique."
                />
              </div>
              <div>
                <Label>Durée</Label>
                <Select
                  value={`${form.duration_minutes}`}
                  onValueChange={(v) => setForm((f) => ({ ...f, duration_minutes: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                      <SelectItem key={m} value={`${m}`}>
                        {durationLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grille de départ</Label>
                <Select
                  value={form.slot_interval_minutes == null ? "auto" : `${form.slot_interval_minutes}`}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      slot_interval_minutes: v === "auto" ? null : Number(v),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Comme la durée</SelectItem>
                    {[15, 30, 60].map((m) => (
                      <SelectItem key={m} value={`${m}`}>
                        Toutes les {m} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lieu</Label>
                <Select
                  value={form.location_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, location_type: v as EventType["location_type"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LOCATION_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="et-locdetails">
                  {form.location_type === "in_person"
                    ? "Adresse"
                    : form.location_type === "google_meet"
                      ? "Lien fixe (optionnel — sinon Meet auto via Google)"
                      : form.location_type === "phone"
                        ? "Consigne (optionnel)"
                        : "Lien / consigne"}
                </Label>
                <Input
                  id="et-locdetails"
                  value={form.location_details}
                  onChange={(e) => setForm((f) => ({ ...f, location_details: e.target.value }))}
                  placeholder={
                    form.location_type === "in_person"
                      ? "12 rue de la Paix, Paris"
                      : "https://…"
                  }
                />
              </div>
            </div>

            {/* Règles de planification */}
            <div>
              <p className="mb-2 text-sm font-semibold">Règles de planification</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="et-buffer-before">Buffer avant (min)</Label>
                  <Input
                    id="et-buffer-before"
                    type="number"
                    min={0}
                    max={720}
                    value={form.buffer_before_minutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, buffer_before_minutes: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="et-buffer-after">Buffer après (min)</Label>
                  <Input
                    id="et-buffer-after"
                    type="number"
                    min={0}
                    max={720}
                    value={form.buffer_after_minutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, buffer_after_minutes: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <Label>Préavis minimum</Label>
                  <Select
                    value={`${form.minimum_notice_minutes}`}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, minimum_notice_minutes: Number(v) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Aucun</SelectItem>
                      <SelectItem value="60">1 h</SelectItem>
                      <SelectItem value="240">4 h</SelectItem>
                      <SelectItem value="720">12 h</SelectItem>
                      <SelectItem value="1440">24 h</SelectItem>
                      <SelectItem value="2880">48 h</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fenêtre de réservation</Label>
                  <Select
                    value={`${form.booking_window_days}`}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, booking_window_days: Number(v) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                        <SelectItem key={d} value={`${d}`}>
                          {d} jours à l&apos;avance
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="et-max-day">Max / jour (vide = illimité)</Label>
                  <Input
                    id="et-max-day"
                    type="number"
                    min={1}
                    value={numField(form.max_bookings_per_day)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_bookings_per_day: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="et-max-week">Max / semaine (vide = illimité)</Label>
                  <Input
                    id="et-max-week"
                    type="number"
                    min={1}
                    value={numField(form.max_bookings_per_week)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_bookings_per_week: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Questions custom */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Questions posées à l&apos;invité</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      custom_questions: [
                        ...f.custom_questions,
                        {
                          id: `q${Date.now().toString(36)}`,
                          label: "",
                          type: "text",
                          required: false,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Question
                </Button>
              </div>
              {form.custom_questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nom et email sont toujours demandés. Ajoutez des questions si besoin.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.custom_questions.map((q, idx) => (
                    <div key={q.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="min-w-40 flex-1"
                          value={q.label}
                          placeholder="Intitulé de la question"
                          onChange={(e) =>
                            setForm((f) => {
                              const arr = [...f.custom_questions];
                              arr[idx] = { ...arr[idx], label: e.target.value };
                              return { ...f, custom_questions: arr };
                            })
                          }
                        />
                        <Select
                          value={q.type}
                          onValueChange={(v) =>
                            setForm((f) => {
                              const arr = [...f.custom_questions];
                              arr[idx] = { ...arr[idx], type: v as CustomQuestion["type"] };
                              return { ...f, custom_questions: arr };
                            })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texte court</SelectItem>
                            <SelectItem value="textarea">Texte long</SelectItem>
                            <SelectItem value="select">Choix</SelectItem>
                            <SelectItem value="checkbox">Case à cocher</SelectItem>
                            <SelectItem value="phone">Téléphone</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={q.required}
                            onCheckedChange={(v) =>
                              setForm((f) => {
                                const arr = [...f.custom_questions];
                                arr[idx] = { ...arr[idx], required: v };
                                return { ...f, custom_questions: arr };
                              })
                            }
                          />
                          Obligatoire
                        </label>
                        <div className="flex items-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => moveQuestion(idx, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => moveQuestion(idx, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600"
                            onClick={() => removeQuestion(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {q.type === "select" ? (
                        <Input
                          className="mt-2"
                          value={(q.options ?? []).join(", ")}
                          placeholder="Options séparées par des virgules"
                          onChange={(e) =>
                            setForm((f) => {
                              const arr = [...f.custom_questions];
                              arr[idx] = {
                                ...arr[idx],
                                options: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              };
                              return { ...f, custom_questions: arr };
                            })
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Options */}
            <div>
              <p className="mb-2 text-sm font-semibold">Options</p>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    Validation manuelle
                    <span className="block text-xs text-muted-foreground">
                      Vous confirmez ou refusez chaque demande avant qu&apos;elle soit définitive.
                    </span>
                  </span>
                  <Switch
                    checked={form.requires_confirmation}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, requires_confirmation: v }))}
                  />
                </label>
                <div>
                  <p className="text-sm">Rappels email (invité + vous)</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {REMINDER_CHOICES.map((r) => {
                      const active = form.reminder_minutes.includes(r.minutes);
                      return (
                        <button
                          key={r.minutes}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              reminder_minutes: active
                                ? f.reminder_minutes.filter((m) => m !== r.minutes)
                                : [...f.reminder_minutes, r.minutes].slice(0, 5),
                            }))
                          }
                          className={
                            "rounded-full border px-3 py-1 text-xs font-medium transition " +
                            (active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted")
                          }
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="et-price">Prix (€, vide = gratuit)</Label>
                    <Input
                      id="et-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.price_cents == null ? "" : `${form.price_cents / 100}`}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          price_cents: e.target.value
                            ? Math.round(Number(e.target.value) * 100)
                            : null,
                        }))
                      }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Affiché sur la page publique (encaissement Stripe à venir).
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="et-redirect">Redirection après réservation</Label>
                    <Input
                      id="et-redirect"
                      value={form.success_redirect_url}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, success_redirect_url: e.target.value }))
                      }
                      placeholder="https://votre-site.fr/merci"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {deleteTarget?.title} » ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le lien public cessera de fonctionner. Les rendez-vous déjà réservés sont conservés
            dans l&apos;historique.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteEventType(deleteTarget.id);
                  toast.success("Type d'évènement supprimé");
                  setDeleteTarget(null);
                  await load();
                } catch {
                  toast.error("Suppression impossible");
                }
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
