"use client";
// Le contrôle de saisie d'un champ requis — défini UNE fois, pour ses deux
// écrans.
//
// La fiche l'entoure d'un libellé et d'une aide (`Field`) ; la grille de
// complétion en masse le pose nu dans une cellule, son en-tête de colonne
// faisant office de libellé. Dupliquer le JSX aurait fait dériver l'un des deux
// au premier correctif — c'est exactement la raison qui avait déjà fait naître
// `renderRequiredField` quand un champ requis existait en deux endroits de la
// même modale.
//
// Ce fichier ne connaît QUE les champs requis : ce qui relève du reste de la
// fiche (adresse, horaires, avis, zones) n'a pas à passer par ici.

import React from "react";
import { X } from "lucide-react";
import { serviceTagKey } from "@/utils/serviceTags";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoField } from "./LogoField";
import { toArr, type RequiredField, type RequiredValues } from "./required-fields";

export interface RequiredFieldControlProps {
  field: RequiredField;
  values: RequiredValues;
  /** Patch partiel : le champ ne connaît que sa propre clé. */
  onChange: (patch: Partial<RequiredValues>) => void;
  /** Rattache un logo importé à l'entreprise dans la médiathèque. */
  entrepriseId?: number | null;
  /** Tags autorisés (`/api/site-builder/service-tags`), chargés par l'écran. */
  tagCatalog: string[];
  /** Rendu resserré pour une cellule de tableau. */
  compact?: boolean;
  invalid?: boolean;
  /** Repris par les champs qui portent leur propre libellé (le logo). */
  required?: boolean;
  hint?: string;
}

/**
 * Le contrôle du champ, ou `null` si aucun n'est défini pour lui.
 *
 * Ce `null` n'est pas un oubli mais un garde-fou : une règle ajoutée à
 * `SITE_REQUIRED_WITH_PROJECT` sans son `case` ici afficherait une case vide
 * sous un libellé qui la réclame. Les deux écrans testent le retour (la fiche
 * laisse alors le champ à sa place d'origine, la grille n'ouvre pas la colonne)
 * — d'où une fonction plutôt qu'un composant : `<X/>` ne se compare pas à
 * `null`.
 */
export function requiredFieldControl({
  field,
  values,
  onChange,
  entrepriseId,
  tagCatalog,
  compact,
  invalid,
  required,
  hint,
}: RequiredFieldControlProps): React.ReactNode {
  const small = compact ? "h-8 text-xs" : undefined;
  const text = (key: RequiredField, extra?: { type?: string; step?: string; placeholder?: string }) => (
    <Input
      value={values[key]}
      className={small}
      onChange={(e) => onChange({ [key]: e.target.value } as Partial<RequiredValues>)}
      {...extra}
    />
  );

  switch (field) {
    case "name":
      return text("name");
    case "ville":
      return text("ville");
    case "code_postal":
      return text("code_postal");
    case "telephone":
      return text("telephone");
    case "lm_override_city":
      // Placeholder = la ville de l'entreprise : le repère le plus utile quand
      // on ne connaît pas la grande ville la plus proche.
      return text("lm_override_city", { placeholder: values.ville });
    // L'exigence de la note suit le nombre d'avis : sans avis, il n'y a rien à
    // noter, et la réclamer demanderait un chiffre que l'entreprise n'a pas.
    case "note_moyenne":
      return text("note_moyenne", { type: "number", step: "0.1", placeholder: "4.8" });
    case "lm_stat_years":
      return text("lm_stat_years", { type: "number" });
    case "lm_stat_clients":
      return text("lm_stat_clients", { type: "number" });
    case "lm_stat_installations":
      return text("lm_stat_installations", { type: "number" });
    case "service_tags":
      return (
        <ServiceTagsField
          value={values.service_tags}
          catalog={tagCatalog}
          compact={compact}
          onChange={(v) => onChange({ service_tags: v })}
        />
      );
    // Seul champ à porter son propre libellé : la zone de dépôt en a besoin pour
    // son `aria-label` et l'alternative textuelle de la vignette.
    case "lm_logo_url":
      return (
        <LogoField
          label="Logo"
          compact={compact}
          invalid={invalid}
          required={required}
          hint={hint}
          value={values.lm_logo_url}
          entrepriseId={entrepriseId ?? null}
          onChange={(url) => onChange({ lm_logo_url: url })}
        />
      );
    default:
      return null;
  }
}

/** Le champ porte-t-il son propre libellé ? (l'écran ne doit pas le doubler) */
export const SELF_LABELLED_FIELDS: ReadonlySet<RequiredField> = new Set<RequiredField>([
  "lm_logo_url",
]);

/**
 * Saisie des service tags : les tags explicitement autorisés se piochent dans
 * une liste déroulante (catalogue global `/api/site-builder/service-tags`,
 * allowlist `enrichment_tag_settings` déjà appliquée). La saisie libre est
 * volontairement absente : elle contournait l'autorisation et créait des tags
 * jumeaux — « climatisation » vs « climatisaton » — qu'aucune page, section ni
 * image de la médiathèque ne reconnaissait.
 *
 * La valeur reste la chaîne « a, b, c » du formulaire — le reste de l'écran
 * (et `toArr` à l'enregistrement) n'a pas à savoir d'où viennent les tags.
 */
export const ServiceTagsField: React.FC<{
  value: string;
  catalog: string[];
  onChange: (next: string) => void;
  compact?: boolean;
}> = ({ value, catalog, onChange, compact }) => {
  const selected = React.useMemo(() => toArr(value), [value]);
  // Comparaison par clé canonique (accents, casse, tirets) : « Pompe à chaleur »
  // et « pompe-a-chaleur » sont le même tag, il ne faut pas l'ajouter deux fois.
  const selectedKeys = React.useMemo(
    () => new Set(selected.map((t) => serviceTagKey(t))),
    [selected],
  );
  const available = React.useMemo(
    () => catalog.filter((t) => !selectedKeys.has(serviceTagKey(t))),
    [catalog, selectedKeys],
  );
  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || selectedKeys.has(serviceTagKey(t))) return;
    onChange([...selected, t].join(", "));
  };
  const remove = (tag: string) => onChange(selected.filter((t) => t !== tag).join(", "));
  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Retirer ${tag}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Resserré en cellule : le sélecteur conserve toute sa lisibilité dans
          une colonne étroite de la grille de complétion. */}
      <div className={compact ? "flex flex-col gap-1.5" : "flex items-center gap-2"}>
        <div className={compact ? "min-w-0" : "flex-1 min-w-0"}>
          <Select value="" onValueChange={add} disabled={available.length === 0}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue
                placeholder={
                  catalog.length === 0
                    ? "Catalogue indisponible"
                    : available.length === 0
                      ? "Tous les tags autorisés sont déjà là"
                      : "Ajouter un tag autorisé…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {catalog.length === 0 && (
          <p className="text-xs text-destructive">
            Aucun tag autorisé : autorisez-en un dans les réglages pour compléter cette fiche.
          </p>
        )}
      </div>
    </div>
  );
};
