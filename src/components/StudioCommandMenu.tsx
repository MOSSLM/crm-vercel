"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { User, Building2, Target, LayoutGrid, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useAppData } from "@/components/AppDataContext";
import { getAllTools } from "@/components/layout/spaces";

const MAX_PER_GROUP = 6;

function contactName(c: { first_name?: string; last_name?: string; nom?: string; prenom?: string }) {
  const a = [c.first_name ?? c.prenom, c.last_name ?? c.nom].filter(Boolean).join(" ").trim();
  return a || "Contact sans nom";
}

const QUICK_ACTIONS = [
  { title: "Nouvelle recherche", href: "/search/new", hint: "lancer une recherche d'entreprises" },
  { title: "Démarchage du jour", href: "/qualification", hint: "ouvrir la file de qualification" },
  { title: "Nouveau site", href: "/site-builder", hint: "Site builder" },
  { title: "Voir le pipeline", href: "/pipeline", hint: "opportunités en cours" },
];

/**
 * Universal Cmd+K palette. Mounted once in the shell. Searches the live
 * AppData (contacts, companies, opportunities), every Studio tool, and a set
 * of quick actions. Filtering is controlled so large datasets stay snappy.
 */
export function StudioCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { contacts, companies, opportunities } = useAppData();
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const match = (haystack: string) => q.length === 0 || haystack.toLowerCase().includes(q);

  const tools = React.useMemo(() => getAllTools(), []);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const contactResults = React.useMemo(() => {
    return contacts
      .filter((c) => match(`${contactName(c)} ${c.email ?? ""} ${c.role_title ?? ""}`))
      .slice(0, MAX_PER_GROUP);
  }, [contacts, q]);

  const companyResults = React.useMemo(() => {
    return companies
      .filter((c) => match(`${c.name ?? ""} ${c.email ?? ""}`))
      .slice(0, MAX_PER_GROUP);
  }, [companies, q]);

  const opportunityResults = React.useMemo(() => {
    return opportunities
      .filter((o) => match(`${o.name ?? ""} ${o.companyName ?? ""} ${o.contact_name ?? ""}`))
      .slice(0, MAX_PER_GROUP);
  }, [opportunities, q]);

  const toolResults = tools.filter((t) => match(`${t.title} ${t.spaceLabel}`)).slice(0, 8);
  const actionResults = QUICK_ACTIONS.filter((a) => match(`${a.title} ${a.hint}`));

  // Reset the query when the dialog closes so it reopens clean.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Recherche universelle</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Rechercher un contact, une entreprise, un outil, une action…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Aucun résultat.</CommandEmpty>

            {contactResults.length > 0 && (
              <CommandGroup heading="Contacts">
                {contactResults.map((c) => (
                  <CommandItem
                    key={`contact-${c.id}`}
                    value={`contact-${c.id}`}
                    onSelect={() => go(`/contacts/${c.id}`)}
                  >
                    <User className="text-muted-foreground" />
                    <span className="truncate">{contactName(c)}</span>
                    {c.role_title && (
                      <span className="ml-auto truncate text-xs text-muted-foreground">{c.role_title}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {companyResults.length > 0 && (
              <CommandGroup heading="Entreprises">
                {companyResults.map((c) => (
                  <CommandItem
                    key={`company-${c.id}`}
                    value={`company-${c.id}`}
                    onSelect={() => go(`/companies/${c.id}`)}
                  >
                    <Building2 className="text-muted-foreground" />
                    <span className="truncate">{c.name ?? `Entreprise #${c.id}`}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {opportunityResults.length > 0 && (
              <CommandGroup heading="Opportunités">
                {opportunityResults.map((o) => (
                  <CommandItem
                    key={`opp-${o.id}`}
                    value={`opp-${o.id}`}
                    onSelect={() => go("/opportunities")}
                  >
                    <Target className="text-muted-foreground" />
                    <span className="truncate">{o.name ?? o.companyName ?? `Opportunité #${o.id}`}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {actionResults.length > 0 && (
              <CommandGroup heading="Actions rapides">
                {actionResults.map((a) => (
                  <CommandItem key={`action-${a.href}-${a.title}`} value={`action-${a.title}`} onSelect={() => go(a.href)}>
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

export default StudioCommandMenu;
