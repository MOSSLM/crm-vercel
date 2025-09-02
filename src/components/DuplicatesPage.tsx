"use client";

import React from "react";
import { useAppData } from "./AppDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { ensureHttpsUrl, getCompanyDisplayName } from "../utils/displayHelpers";

const DuplicatesPage: React.FC = () => {
  const { duplicateGroups, markAsNetwork, blacklistCompany } = useAppData();

  const handleVisit = (url?: string) => {
    if (!url) return;
    const safeUrl = ensureHttpsUrl(url);
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  };

  const handleMarkNetwork = async (ids: number[]) => {
    await Promise.all(ids.map((id) => markAsNetwork(id)));
    toast.success("Entreprises ajoutées au réseau");
  };

  const handleBlacklist = async (ids: number[]) => {
    await Promise.all(ids.map((id) => blacklistCompany(id)));
    toast.success("Entreprises black-listées");
  };

  if (duplicateGroups.length === 0) {
    return (
      <div className="p-6">
        <h1>Duplicats</h1>
        <p className="text-muted-foreground">Aucun duplicat détecté.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1>Duplicats</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domaine</TableHead>
            <TableHead>Entreprises</TableHead>
            <TableHead className="w-1/3">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {duplicateGroups.map((group, index) => (
            <TableRow key={index}>
              <TableCell>{group.domain}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {group.companies.map((c) => (
                    <Badge key={c.id} variant="secondary">
                      {getCompanyDisplayName(c.name, c.canonical_url)}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleVisit(group.companies[0].canonical_url)}
                >
                  Visiter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleMarkNetwork(group.companies.map((c) => c.id))}
                >
                  Réseau d’entreprise
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleBlacklist(group.companies.map((c) => c.id))}
                >
                  Blacklister
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default DuplicatesPage;
