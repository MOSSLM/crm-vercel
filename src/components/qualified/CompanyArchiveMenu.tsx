"use client";

import React from "react";
import { Archive, ArchiveRestore, Eye, MoreVertical } from "lucide-react";

import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Company } from "../../types";

interface CompanyArchiveMenuProps {
  company: Company;
  onOpen: (company: Company) => void;
  /** Absent = pas de menu : la vue ne sait pas archiver. */
  onArchive?: (company: Company) => void;
}

/**
 * Le menu ⋮ des cartes et lignes « Entreprises qualifiées ».
 *
 * Le wrapper avale le clic (`stopPropagation`) : la carte entière est un lien
 * vers la fiche, ouvrir le menu ne doit pas y naviguer. Même précaution que
 * dans `app/(crm)/planches/page.tsx`.
 */
export const CompanyArchiveMenu: React.FC<CompanyArchiveMenuProps> = ({
  company,
  onOpen,
  onArchive,
}) => {
  if (!onArchive) return null;

  const archived = !!company.archived_at;

  return (
    <div
      className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions ${company.name ?? company.id}`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpen(company)}>
            <Eye className="h-4 w-4 mr-2" /> Voir la fiche
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {archived ? (
            <DropdownMenuItem onClick={() => onArchive(company)}>
              <ArchiveRestore className="h-4 w-4 mr-2" /> Désarchiver
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => onArchive(company)}
            >
              <Archive className="h-4 w-4 mr-2" /> Archiver l’entreprise…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
