"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Pipeline } from "@/types";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedPipeline = React.useMemo(
    () => pipelines.find((p) => p.id === selectedValue),
    [pipelines, selectedValue]
  );

  const displayLabel =
    includeAllOption && selectedValue === "all"
      ? allOptionLabel
      : (selectedPipeline?.nom ?? placeholder);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const filteredPipelines = React.useMemo(
    () =>
      pipelines.filter((p) =>
        !normalizedQuery || p.nom.toLowerCase().includes(normalizedQuery)
      ),
    [normalizedQuery, pipelines]
  );

  const exactMatch = pipelines.find(
    (p) => p.nom.trim().toLowerCase() === normalizedQuery
  );

  const matchesAllOption =
    includeAllOption &&
    normalizedQuery.length > 0 &&
    allOptionLabel.toLowerCase().includes(normalizedQuery);

  const canCreate = !!trimmedQuery && !exactMatch && !matchesAllOption;

  const handleSelect = (value: string) => {
    onSelect(value);
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    const created = await onCreate(trimmedQuery);
    if (created) {
      handleSelect(created.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-56 justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <Command>
          <CommandInput
            placeholder="Rechercher..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {includeAllOption && (
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => handleSelect("all")}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedValue === "all" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {allOptionLabel}
                </CommandItem>
              </CommandGroup>
            )}

            {includeAllOption && (filteredPipelines.length > 0 || canCreate) && (
              <CommandSeparator />
            )}

            {filteredPipelines.length > 0 && (
              <CommandGroup heading="Pipelines">
                {filteredPipelines.map((pipeline) => (
                  <CommandItem
                    key={pipeline.id}
                    value={pipeline.id}
                    keywords={[pipeline.nom]}
                    onSelect={() => handleSelect(pipeline.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedValue === pipeline.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {pipeline.nom}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {canCreate && (
              <>
                {filteredPipelines.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem
                    value={`create:${trimmedQuery}`}
                    onSelect={() => void handleCreate()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Créer &quot;{trimmedQuery}&quot;
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!canCreate && filteredPipelines.length === 0 && (
              <CommandEmpty>Aucun pipeline trouvé.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
