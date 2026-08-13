"use client";

import { User, Mail, Linkedin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import type { CompanyBundle } from "./types";

/**
 * "À qui parler" — colonne de droite, bloc allégé (pas de `Card`) façon
 * cockpit d'appel : un simple filet en pied de section, pas d'encadré.
 */
export function ContactsPanel({ company }: { company: CompanyBundle }) {
  const { entreprise, contacts } = company;
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-2 border-b pb-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <User className="h-4 w-4 text-muted-foreground" /> Contacts
      </div>
      <div className="space-y-2">
        {contacts.map((c) => {
          const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact";
          return (
            <div key={c.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {name}
                  {c.is_decision_maker && (
                    <Badge variant="secondary" className="text-[10px]">
                      Décideur
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {c.role_title && <span>{c.role_title}</span>}
                  {c.tel && <span>{c.tel}</span>}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:underline">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                      <Linkedin className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
              </div>
              {c.tel && (
                <ClickToCallButton to={c.tel} contactId={c.id} entrepriseId={entreprise.id} size="icon" variant="ghost" label="Appeler" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
