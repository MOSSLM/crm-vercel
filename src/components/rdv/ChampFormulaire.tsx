"use client";

import React from "react";
import type { FormQuestion } from "@/types";

/**
 * Un champ du formulaire, en saisie rapide.
 *
 * Le `FormRuntime` du form builder existe déjà, mais il est fait pour un
 * prospect qui découvre un formulaire : une question par écran, grandes cartes,
 * animations. En plein appel il faut l'inverse — tout à l'écran, dense,
 * tabulable, sans une seule animation entre deux réponses. D'où ce rendu
 * séparé, qui consomme exactement le même `FormQuestion` : les questions
 * restent éditables depuis `/forms`, seul l'habillage change.
 */

const classeChamp =
  "w-full rounded-md border border-border/60 bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-primary";

interface Props {
  question: FormQuestion;
  valeur: unknown;
  onChange: (valeur: unknown) => void;
}

export function ChampFormulaire({ question: q, valeur, onChange }: Props) {
  switch (q.type) {
    case "long_text":
      return (
        <textarea
          className={`${classeChamp} min-h-[72px] resize-y`}
          placeholder={q.placeholder || "…"}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
    case "slider":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            className={classeChamp}
            placeholder={q.placeholder || "0"}
            min={q.min}
            max={q.max}
            step={q.step}
            value={(valeur as number | string) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          {q.unit && <span className="shrink-0 text-sm text-[var(--text-3)]">{q.unit}</span>}
        </div>
      );

    case "date":
      return (
        <input
          type="date"
          className={classeChamp}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "email":
      return (
        <input
          type="email"
          className={classeChamp}
          placeholder={q.placeholder || "nom@exemple.fr"}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "phone":
      return (
        <input
          type="tel"
          className={classeChamp}
          placeholder={q.placeholder || "06 12 34 56 78"}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "yes_no":
      return (
        <GroupeBoutons
          options={[
            { id: "yes", label: "Oui" },
            { id: "no", label: "Non" },
          ]}
          selection={typeof valeur === "string" ? [valeur] : []}
          onToggle={(id) => onChange(valeur === id ? undefined : id)}
        />
      );

    case "single_choice":
    case "dropdown": {
      const choix = q.choices ?? [];
      // Au-delà de six choix, les pastilles débordent : la liste déroulante
      // reste lisible et se pilote au clavier.
      if (q.type === "dropdown" || choix.length > 6) {
        return (
          <select
            className={classeChamp}
            value={(valeur as string) ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">—</option>
            {choix.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        );
      }
      return (
        <GroupeBoutons
          options={choix}
          selection={typeof valeur === "string" ? [valeur] : []}
          onToggle={(id) => onChange(valeur === id ? undefined : id)}
        />
      );
    }

    case "multi_choice": {
      const selection = Array.isArray(valeur) ? (valeur as string[]) : [];
      return (
        <GroupeBoutons
          options={q.choices ?? []}
          selection={selection}
          onToggle={(id) =>
            onChange(
              selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id],
            )
          }
        />
      );
    }

    case "rating":
    case "scale": {
      const max = q.type === "rating" ? (q.ratingMax ?? 5) : (q.scaleMax ?? 10);
      const notes = Array.from({ length: max }, (_, i) => i + 1);
      return (
        <GroupeBoutons
          options={notes.map((n) => ({ id: String(n), label: String(n) }))}
          selection={valeur == null ? [] : [String(valeur)]}
          onToggle={(id) => onChange(String(valeur) === id ? undefined : Number(id))}
        />
      );
    }

    // `file` n'a pas de sens en prise de notes téléphonique : on garde la
    // question visible, en champ texte, pour noter ce que le prospect enverra.
    default:
      return (
        <input
          type="text"
          className={classeChamp}
          placeholder={q.placeholder || "…"}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function GroupeBoutons({
  options,
  selection,
  onToggle,
}: {
  options: Array<{ id: string; label: string }>;
  selection: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const actif = selection.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={actif}
            onClick={() => onToggle(o.id)}
            className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
              actif
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-[var(--surface)] hover:bg-[var(--bg-2)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default ChampFormulaire;
