"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/utils/supabase/client";
import type { CalendarEventModel, RecurrenceRule } from "@/lib/recurrence";
import { toDateKey } from "@/lib/recurrence";
import { RecurrencePicker } from "./RecurrencePicker";
import { CALENDAR_PALETTE, DEFAULT_EVENT_COLOR, type CalendarCategory } from "./types";

const CUSTOM = "__custom__";

const pad = (n: number) => `${n}`.padStart(2, "0");
const dateInputValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInputValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CalendarCategory[];
  /** Évènement à éditer (sinon création). */
  event?: CalendarEventModel | null;
  /** Date 'yyyy-MM-dd' de l'occurrence cliquée (pour "supprimer cette occurrence"). */
  occurrenceDate?: string | null;
  /** Début pré-rempli en création (clic sur une case horaire). */
  defaultStart?: Date | null;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  categoryId: string; // id de catégorie ou CUSTOM
  customColor: string;
  allDay: boolean;
  date: string;
  startTime: string;
  endTime: string;
  rule: RecurrenceRule;
}

const blankForm = (defaultStart?: Date | null): FormState => {
  const base = defaultStart ?? new Date();
  const start = new Date(base);
  if (!defaultStart) start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    description: "",
    categoryId: CUSTOM,
    customColor: DEFAULT_EVENT_COLOR,
    allDay: false,
    date: dateInputValue(start),
    startTime: timeInputValue(start),
    endTime: timeInputValue(end),
    rule: { freq: "none", interval: 1, weekdays: [], until: null },
  };
};

const formFromEvent = (event: CalendarEventModel): FormState => {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return {
    title: event.title,
    description: event.description ?? "",
    categoryId: event.categoryId ?? CUSTOM,
    customColor: event.color || DEFAULT_EVENT_COLOR,
    allDay: event.allDay,
    date: dateInputValue(start),
    startTime: timeInputValue(start),
    endTime: timeInputValue(end),
    rule: {
      freq: event.rule.freq,
      interval: event.rule.interval,
      weekdays: event.rule.weekdays ?? [],
      until: event.rule.until ?? null,
      exceptions: event.rule.exceptions ?? [],
    },
  };
};

export const EventDialog = ({
  open,
  onOpenChange,
  categories,
  event,
  occurrenceDate,
  defaultStart,
  onSaved,
}: EventDialogProps) => {
  const isEdit = Boolean(event);
  const [form, setForm] = React.useState<FormState>(() => blankForm(defaultStart));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Réinitialise le formulaire à chaque ouverture.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(event ? formFromEvent(event) : blankForm(defaultStart));
  }, [open, event, defaultStart]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const resolvedColor =
    form.categoryId !== CUSTOM
      ? categories.find((c) => c.id === form.categoryId)?.color ?? form.customColor
      : form.customColor;

  const buildPayload = () => {
    const startTime = form.allDay ? "00:00" : form.startTime;
    const endTime = form.allDay ? "23:59" : form.endTime;
    const start_at = `${form.date}T${startTime}:00`;
    const end_at = `${form.date}T${endTime}:00`;
    const weekly = form.rule.freq === "weekly";
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category_id: form.categoryId === CUSTOM ? null : form.categoryId,
      color: form.categoryId === CUSTOM ? form.customColor : null,
      all_day: form.allDay,
      start_at,
      end_at,
      recurrence_freq: form.rule.freq,
      recurrence_interval: Math.max(1, form.rule.interval || 1),
      recurrence_weekdays: weekly && form.rule.weekdays?.length ? form.rule.weekdays : null,
      recurrence_until: form.rule.freq !== "none" ? form.rule.until || null : null,
    };
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!form.allDay && form.endTime < form.startTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = buildPayload();
    const res = event
      ? await supabase.from("crm_calendar_events").update(payload).eq("id", event.id)
      : await supabase
          .from("crm_calendar_events")
          .insert({ ...payload, recurrence_exceptions: [] });
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  const handleDeleteSeries = async () => {
    if (!event) return;
    setSaving(true);
    const { error: err } = await supabase.from("crm_calendar_events").delete().eq("id", event.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  const handleDeleteOccurrence = async () => {
    if (!event) return;
    // Évènement non récurrent → supprimer purement et simplement.
    if (event.rule.freq === "none") {
      await handleDeleteSeries();
      return;
    }
    const dateKey = occurrenceDate ?? toDateKey(new Date(event.startAt));
    const exceptions = Array.from(new Set([...(event.rule.exceptions ?? []), dateKey]));
    setSaving(true);
    const { error: err } = await supabase
      .from("crm_calendar_events")
      .update({ recurrence_exceptions: exceptions })
      .eq("id", event.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  const isRecurring = isEdit && event?.rule.freq !== "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le bloc" : "Nouveau bloc de travail"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label className="mb-1 block">Titre</Label>
            <Input
              value={form.title}
              autoFocus
              placeholder="Ex. Deep work, Réunion équipe…"
              onChange={(e) => update("title", e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-1 block">Catégorie / couleur</Label>
            <div className="flex items-center gap-2">
              <Select value={form.categoryId} onValueChange={(v) => update("categoryId", v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.nom}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Couleur personnalisée…</SelectItem>
                </SelectContent>
              </Select>
              <span
                className="h-9 w-9 shrink-0 rounded-md border"
                style={{ backgroundColor: resolvedColor }}
                aria-hidden
              />
            </div>
            {form.categoryId === CUSTOM && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {CALENDAR_PALETTE.map((p) => (
                  <button
                    key={p.color}
                    type="button"
                    title={p.name}
                    onClick={() => update("customColor", p.color)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      form.customColor.toLowerCase() === p.color.toLowerCase()
                        ? "border-foreground"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: p.color }}
                  />
                ))}
                <Input
                  type="color"
                  value={form.customColor}
                  onChange={(e) => update("customColor", e.target.value)}
                  className="h-8 w-12 p-1"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label htmlFor="all-day">Journée entière</Label>
            <Switch
              id="all-day"
              checked={form.allDay}
              onCheckedChange={(v) => update("allDay", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={form.allDay ? "col-span-2" : ""}>
              <Label className="mb-1 block">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
            {!form.allDay && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1 block">Début</Label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => update("startTime", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1 block">Fin</Label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => update("endTime", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <RecurrencePicker value={form.rule} onChange={(rule) => update("rule", rule)} />

          <div>
            <Label className="mb-1 block">Notes (optionnel)</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {isEdit ? (
            <div className="flex flex-wrap gap-2">
              {isRecurring && (
                <Button variant="outline" size="sm" onClick={handleDeleteOccurrence} disabled={saving}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cette occurrence
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={handleDeleteSeries} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isRecurring ? "Toute la série" : "Supprimer"}
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {isEdit ? "Enregistrer" : "Créer le bloc"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
