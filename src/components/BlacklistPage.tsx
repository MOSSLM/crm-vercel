"use client";

import React from "react";
import { useAppData } from "./AppDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { toast } from "sonner";

const BlacklistPage: React.FC = () => {
  const { urlBlacklist, unblacklist } = useAppData();

  const handleUnblacklist = async (id: string, scope: "domain" | "exact_url", value: string) => {
    await unblacklist(id, scope, value);
    toast.success("Entrée déblacklistée");
  };

  return (
    <div className="p-6 space-y-6">
      <h1>Blacklist</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Valeur</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Raison</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {urlBlacklist.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.value}</TableCell>
              <TableCell>{entry.scope}</TableCell>
              <TableCell>{entry.reason || '-'}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnblacklist(entry.id, entry.scope, entry.value)}
                >
                  Déblacklister
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default BlacklistPage;
