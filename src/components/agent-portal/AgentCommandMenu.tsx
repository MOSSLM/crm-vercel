"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { getAllAgentTools } from "@/components/agent-portal/agentSpaces";

const QUICK_ACTIONS = [
  { title: "Démarchage du jour", href: "/espace-agent/demarchage", hint: "ouvrir la file de démarchage" },
  { title: "Cockpit d'appel", href: "/espace-agent/telephonie/cockpit", hint: "lancer une session d'appels" },
  { title: "Voir le pipeline", href: "/espace-agent/pipeline", hint: "opportunités en cours" },
  { title: "Mes offres SAMA", href: "/espace-agent/offres", hint: "offres à présenter" },
];

/**
 * Agent ⌘K palette. Mounted once in the shell. Searches every agent tool and a
 * set of quick actions. Mirrors the admin StudioCommandMenu but scoped to the
 * agent's own routes.
 */
export function AgentCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const match = (haystack: string) => q.length === 0 || haystack.toLowerCase().includes(q);

  const tools = React.useMemo(() => getAllAgentTools(), []);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const toolResults = tools.filter((t) => match(`${t.title} ${t.spaceLabel}`));
  const actionResults = QUICK_ACTIONS.filter((a) => match(`${a.title} ${a.hint}`));

  // Reset the query when the dialog closes so it reopens clean.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Rechercher un outil, une action…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Aucun résultat.</CommandEmpty>

            {actionResults.length > 0 && (
              <CommandGroup heading="Actions rapides">
                {actionResults.map((a) => (
                  <CommandItem
                    key={`action-${a.href}-${a.title}`}
                    value={`action-${a.title}`}
                    onSelect={() => go(a.href)}
                  >
                    <Plus className="text-muted-foreground" />
                    <span className="truncate">{a.title}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{a.hint}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {toolResults.length > 0 && (
              <CommandGroup heading="Outils & navigation">
                {toolResults.map((t) => {
                  const Icon = t.icon ?? LayoutGrid;
                  return (
                    <CommandItem
                      key={`tool-${t.href}-${t.title}`}
                      value={`tool-${t.href}-${t.title}`}
                      onSelect={() => go(t.href)}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{t.spaceLabel}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default AgentCommandMenu;
