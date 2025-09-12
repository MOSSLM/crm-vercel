"use client";

import React from "react";
import { useAppData } from "./AppDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";

const BlacklistPage: React.FC = () => {
  const { urlBlacklist, unblacklist } = useAppData();
  const [viewMode, setViewMode] = React.useState<'cards' | 'list'>('list');

  const totalEntries = urlBlacklist.length;
  const domainCount = urlBlacklist.filter((e) => e.scope === 'domain').length;
  const urlCount = urlBlacklist.filter((e) => e.scope === 'exact_url').length;
  const withReasonCount = urlBlacklist.filter((e) => e.reason && e.reason.trim().length > 0).length;

  const handleUnblacklist = async (id: string, scope: 'domain' | 'exact_url', value: string) => {
    await unblacklist(id, scope, value);
    toast.success('Entrée déblacklistée');
  };

  const BlacklistCard: React.FC<{ entry: typeof urlBlacklist[number] }> = ({ entry }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm break-words">{entry.value}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xs text-muted-foreground">{entry.scope}</div>
        <div className="text-sm">{entry.reason || '-'}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleUnblacklist(entry.id, entry.scope, entry.value)}
        >
          Déblacklister
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Blacklist</h1>
        <p className="text-muted-foreground">Gérez les entrées bloquées</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total entrées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{totalEntries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Domaines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{domainCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">URLs exactes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">{urlCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec raison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-purple-600">{withReasonCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <div className="flex border rounded-lg">
          <Button
            variant={viewMode === 'cards' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('cards')}
            className="rounded-r-none"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-l-none"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {urlBlacklist.map((entry) => (
            <BlacklistCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
};

export default BlacklistPage;
