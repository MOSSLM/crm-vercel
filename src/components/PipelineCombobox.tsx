"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pipeline } from "@/types";
import { Check, Plus } from "lucide-react";

interface PipelineComboboxProps {
  pipelines: Pipeline[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onCreate: (name: string) => Promise<Pipeline | null>;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  placeholder?: string;
}

export const PipelineCombobox: React.FC<PipelineComboboxProps> = ({
  pipelines,
  selectedValue,
  onSelect,
  onCreate,
  includeAllOption = false,
  allOptionLabel = "Tous les pipelines",
  placeholder = "Choisir ou créer un pipeline...",
}) => {
  const [query, setQuery] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);

  const selectedPipeline = React.useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedValue),
    [pipelines, selectedValue]
  );

  React.useEffect(() => {
    if (isFocused) return;
    if (includeAllOption && selectedValue === "all") {
      setQuery(allOptionLabel);
      return;
    }
    setQuery(selectedPipeline?.nom || "");
  }, [allOptionLabel, includeAllOption, isFocused, selectedPipeline?.nom, selectedValue]);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const matchesAllOption =
    includeAllOption &&
    normalizedQuery.length > 0 &&
    allOptionLabel.toLowerCase() === normalizedQuery;

  const filteredPipelines = React.useMemo(
    () =>
      pipelines
        .filter((pipeline) => {
          if (!normalizedQuery) return true;
          return pipeline.nom.toLowerCase().includes(normalizedQuery);
        })
        .slice(0, 8),
    [normalizedQuery, pipelines]
  );

  const exactMatch = pipelines.find(
    (pipeline) => pipeline.nom.trim().toLowerCase() === normalizedQuery
  );

  const canCreate =
    !!trimmedQuery &&
    !exactMatch &&
    !matchesAllOption;

  const showSuggestions =
    isFocused &&
    (!!trimmedQuery || filteredPipelines.length > 0 || includeAllOption);

  const selectOption = (value: string) => {
    onSelect(value);
    setIsFocused(false);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    const created = await onCreate(trimmedQuery);
    if (created) {
      onSelect(created.id);
      setQuery(created.nom);
      setIsFocused(false);
    }
  };

  return (
    <div className="relative w-56">
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (exactMatch) {
            selectOption(exactMatch.id);
            return;
          }
          if (matchesAllOption) {
            selectOption("all");
            return;
          }
          if (canCreate) {
            void handleCreate();
            return;
          }
          if (filteredPipelines[0]) {
            selectOption(filteredPipelines[0].id);
          }
        }}
      />

      {showSuggestions && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-background p-1 shadow-sm space-y-1 max-h-56 overflow-auto">
          {includeAllOption && (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start h-8"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption("all")}
            >
              {selectedValue === "all" ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <span className="inline-block w-4 mr-2" />
              )}
              {allOptionLabel}
            </Button>
          )}

          {canCreate && (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start h-8"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void handleCreate()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer “{trimmedQuery}”
            </Button>
          )}

          {filteredPipelines.map((pipeline) => (
            <Button
              key={pipeline.id}
              type="button"
              variant="ghost"
              className="w-full justify-start h-8"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(pipeline.id)}
            >
              {selectedValue === pipeline.id ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <span className="inline-block w-4 mr-2" />
              )}
              {pipeline.nom}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
