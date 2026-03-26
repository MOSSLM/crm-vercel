"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { formatServiceTag } from "@/utils/serviceTags";

interface ServiceTagPickerProps {
  value: string[];
  allOptions: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}

export const ServiceTagPicker: React.FC<ServiceTagPickerProps> = ({
  value,
  allOptions,
  onChange,
  placeholder = "Ajouter un service...",
  emptyLabel = "Aucun service",
}) => {
  const [query, setQuery] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);

  const selectedNormalized = React.useMemo(
    () => new Set(value.map((item) => formatServiceTag(item))),
    [value]
  );

  const trimmedQuery = query.trim();
  const normalizedQuery = formatServiceTag(trimmedQuery);

  const filteredOptions = React.useMemo(
    () =>
      allOptions
        .filter((option) => !selectedNormalized.has(formatServiceTag(option)))
        .filter((option) => {
          if (!normalizedQuery) return true;
          return formatServiceTag(option).includes(normalizedQuery);
        })
        .slice(0, 8),
    [allOptions, normalizedQuery, selectedNormalized]
  );

  const canCreate =
    !!trimmedQuery &&
    !selectedNormalized.has(normalizedQuery) &&
    !allOptions.some((option) => formatServiceTag(option) === normalizedQuery);

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    const normalized = formatServiceTag(clean);
    if (selectedNormalized.has(normalized)) return;
    onChange([...value, clean]);
    setQuery("");
  };

  const removeTag = (tag: string) => {
    const normalized = formatServiceTag(tag);
    onChange(value.filter((item) => formatServiceTag(item) !== normalized));
  };

  const showSuggestions = isFocused && (!!trimmedQuery || filteredOptions.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 p-2 bg-muted rounded min-h-10">
        {value.length > 0 ? (
          value.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs flex items-center gap-1">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600" aria-label={`Retirer ${tag}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        )}
      </div>

      <div className="relative">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (trimmedQuery) addTag(trimmedQuery);
            }
          }}
          placeholder={placeholder}
        />

        {showSuggestions && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-background p-1 shadow-sm space-y-1 max-h-52 overflow-auto">
            {canCreate && (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start h-8"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(trimmedQuery)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Créer “{trimmedQuery}”
              </Button>
            )}

            {filteredOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant="ghost"
                className="w-full justify-start h-8"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(option)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {option}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
