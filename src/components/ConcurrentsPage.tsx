"use client";

import React from "react";
import { ExternalLink, Loader2, Swords, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  STATUTS_CONCURRENT,
  STATUT_CONCURRENT_LABEL,
  type StatutConcurrent,
} from "@/lib/archive/reasons";
import { authedFetch } from "@/utils/authedFetch";

/**
 * Le registre des concurrents : qui nous prend nos chantiers, et combien.
 *
 * Les lignes ne se saisissent pas ici — elles arrivent par l'archivage, quand
 * on range une fiche avec le motif « a refait son site avec un concurrent ».
 * Cette page sert à exploiter ce qui s'est accumulé : trier par nombre de
 * prises, qualifier, et décider qui démarcher (sous-traitance, partenariat).
 */

interface Concurrent {
  id: string;
  domaine: string;
  nom: string | null;
  site_url: string | null;
  statut: StatutConcurrent;
  notes: string | null;
  nb_entreprises: number;
  nb_opportunites: number;
  derniere_prise_at: string | null;
  created_at: string;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

export const ConcurrentsPage: React.FC = () => {
  const [rows, setRows] = React.useState<Concurrent[]>([]);
  const [loading, setLoading] = React.useState(true);
  /** Notes en cours d'édition, non encore enregistrées. */
  const [draftNotes, setDraftNotes] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/concurrents");
      const data = (await res.json().catch(() => ({}))) as {
        concurrents?: Concurrent[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setRows(data.concurrents ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du chargement des concurrents");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, fields: Partial<Pick<Concurrent, "nom" | "statut" | "notes">>) => {
    // Mise à jour optimiste : la table est éditable en place, attendre l'API à
    // chaque frappe de statut ferait clignoter la ligne.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const res = await authedFetch("/api/concurrents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error || "Enregistrement impossible");
      void load();
    }
  };

  const remove = async (row: Concurrent) => {
    if (!window.confirm(`Retirer ${row.domaine} du registre ?`)) return;
    const res = await authedFetch(`/api/concurrents?id=${encodeURIComponent(row.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error || "Suppression impossible");
      return;
    }
    // Les fiches restent archivées avec leur motif : `on delete set null` ne
    // retire que le lien vers le concurrent.
    toast.success(`${row.domaine} retiré du registre`);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const prospectsPerdus = rows.reduce((n, r) => n + r.nb_entreprises, 0);
  const aDemarcher = rows.filter((r) => r.statut === "a_demarcher").length;
  const partenaires = rows.filter((r) => r.statut === "partenaire").length;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Concurrents</h1>
        <p className="text-muted-foreground">
          Les agences qui ont refait le site de nos prospects, classées par nombre de chantiers
          pris. De la matière à démarcher.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Concurrents suivis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Prospects perdus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-red-600">{prospectsPerdus}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">À démarcher</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{aDemarcher}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Partenaires</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">{partenaires}</div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <Swords className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm md:text-base">Aucun concurrent enregistré</h3>
          <p className="text-muted-foreground text-xs md:text-sm">
            Le registre se remplit tout seul&nbsp;: archivez une fiche avec le motif « a refait son
            site avec un concurrent » et indiquez son adresse.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domaine</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead className="text-right">Prospects pris</TableHead>
                <TableHead>Dernière prise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <a
                      href={row.site_url || `https://${row.domaine}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600"
                    >
                      {row.domaine}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={row.nom ?? ""}
                      placeholder="Nom de l’agence"
                      className="h-8 min-w-40"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (row.nom ?? "")) void patch(row.id, { nom: value || null });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.nb_entreprises}
                    {row.nb_opportunites > row.nb_entreprises && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        ({row.nb_opportunites} opp.)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(row.derniere_prise_at)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.statut}
                      onValueChange={(v) => void patch(row.id, { statut: v as StatutConcurrent })}
                    >
                      <SelectTrigger className="h-8 w-40" aria-label={`Statut ${row.domaine}`}>
                        <SelectValue>{STATUT_CONCURRENT_LABEL[row.statut]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUTS_CONCURRENT.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={draftNotes[row.id] ?? row.notes ?? ""}
                      placeholder="Ce qu’on sait d’eux"
                      className="h-8 min-w-56"
                      onChange={(e) =>
                        setDraftNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        setDraftNotes((prev) => {
                          const next = { ...prev };
                          delete next[row.id];
                          return next;
                        });
                        if (value !== (row.notes ?? "")) void patch(row.id, { notes: value || null });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600"
                      title="Retirer du registre"
                      aria-label={`Retirer ${row.domaine}`}
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ConcurrentsPage;
