"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import type { RecurrenceFreq, RecurrenceRule } from "@/lib/recurrence";

const WEEKDAYS: { iso: number; label: string; full: string }[] = [
  { iso: 1, label: "L", full: "Lundi" },
  { iso: 2, label: "M", full: "Mardi" },
  { iso: 3, label: "M", full: "Mercredi" },
  { iso: 4, label: "J", full: "Jeudi" },
  { iso: 5, label: "V", full: "Vendredi" },
  { iso: 6, label: "S", full: "Samedi" },
  { iso: 7, label: "D", full: "Dimanche" },
];

const FREQ_LABEL: Record<RecurrenceFreq, string> = {
  none: "Ne se répète pas",
  daily: "Tous les jours",
  weekly: "Toutes les semaines",
  monthly: "Tous les mois",
};

const UNIT_LABEL: Record<Exclude<RecurrenceFreq, "none">, string> = {
  daily: "jour(s)",
  weekly: "semaine(s)",
  monthly: "mois",
};

export interface RecurrencePickerProps {
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
}

export const RecurrencePicker = ({ value, onChange }: RecurrencePickerProps) => {
  const setFreq = (freq: RecurrenceFreq) => {
    onChange({ ...value, freq });
  };

  const setWeekdays = (days: string[]) => {
    const weekdays = days.map(Number).sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  };

  const setPreset = (weekdays: number[]) => {
    onChange({ ...value, freq: "weekly", weekdays });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <Label className="mb-1 block">Récurrence</Label>
        <Select value={value.freq} onValueChange={(v) => setFreq(v as RecurrenceFreq)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FREQ_LABEL) as RecurrenceFreq[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FREQ_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.freq === "weekly" && (
        <div className="space-y-2">
          <Label className="block">Jours</Label>
          <ToggleGroup
            type="multiple"
            size="sm"
            className="flex-wrap justify-start"
            value={(value.weekdays ?? []).map(String)}
            onValueChange={setWeekdays}
          >
            {WEEKDAYS.map((d) => (
              <ToggleGroupItem
                key={d.iso}
                value={String(d.iso)}
                aria-label={d.full}
                title={d.full}
                className="h-8 w-8 px-0"
              >
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset([1, 2, 3, 4, 5])}>
              Jours de semaine
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset([6, 7])}>
              Week-end
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreset([1, 2, 3, 4, 5, 6, 7])}>
              Tous les jours
            </Button>
          </div>
        </div>
      )}

      {value.freq !== "none" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block">Répéter toutes les</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={value.interval}
                onChange={(e) =>
                  onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                {UNIT_LABEL[value.freq]}
              </span>
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Jusqu&apos;au (optionnel)</Label>
            <Input
              type="date"
              value={value.until ?? ""}
              onChange={(e) => onChange({ ...value, until: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
