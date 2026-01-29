"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Edit3, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { ensureHttpsUrl } from "@/utils/displayHelpers";

type ColumnType = "text" | "timestamp" | "json" | "stringArray" | "number";

export type ProductionColumn = {
  key: string;
  label: string;
  type: ColumnType;
  isLong?: boolean;
  readOnly?: boolean;
};

type RowData = Record<string, unknown> & { id: string };

type ProductionDataTableProps = {
  title: string;
  description?: string;
  tableName: string;
  columns: ProductionColumn[];
  getWebsiteUrl?: (row: RowData) => string | null;
};

const formatValue = (value: unknown, type: ColumnType): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "timestamp" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const formatInputValue = (value: unknown, type: ColumnType): string => {
  if (value === null || value === undefined) return "";
  if (type === "json") {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if (type === "stringArray") {
    return Array.isArray(value) ? value.join(", ") : String(value);
  }
  return String(value);
};

const parseInputValue = (raw: string, type: ColumnType): { value?: unknown; error?: string } => {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null };

  if (type === "number") {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return { error: "Valeur numérique invalide." };
    return { value: parsed };
  }

  if (type === "json") {
    try {
      return { value: JSON.parse(trimmed) };
    } catch (error) {
      return { error: "JSON invalide." };
    }
  }

  if (type === "stringArray") {
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) return { error: "JSON invalide (tableau attendu)." };
        return { value: parsed };
      } catch (error) {
        return { error: "JSON invalide." };
      }
    }
    const items = trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return { value: items };
  }

  return { value: trimmed };
};

const toSearchString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const ProductionDataTable: React.FC<ProductionDataTableProps> = ({
  title,
  description,
  tableName,
  columns,
  getWebsiteUrl,
}) => {
  const supabase = createClient();
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(tableName).select("*");
    if (error) {
      toast.error("Erreur lors du chargement des données");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as RowData[]);
    setLoading(false);
  }, [supabase, tableName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const query = searchTerm.toLowerCase();
    return rows.filter((row) =>
      columns.some((column) =>
        toSearchString(row[column.key]).toLowerCase().includes(query)
      )
    );
  }, [rows, searchTerm, columns]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleOpenModal = (row: RowData) => {
    setEditingRow(row);
    const initialForm: Record<string, string> = {};
    columns.forEach((column) => {
      initialForm[column.key] = formatInputValue(row[column.key], column.type);
    });
    setEditForm(initialForm);
  };

  const handleSave = async () => {
    if (!editingRow) return;
    const payload: Record<string, unknown> = {};
    for (const column of columns) {
      if (column.readOnly) continue;
      const rawValue = editForm[column.key] ?? "";
      const parsed = parseInputValue(rawValue, column.type);
      if (parsed.error) {
        toast.error(`${column.label}: ${parsed.error}`);
        return;
      }
      payload[column.key] = parsed.value;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from(tableName)
      .update(payload)
      .eq("id", editingRow.id);
    setIsSaving(false);
    if (error) {
      toast.error("Erreur lors de la mise à jour");
      return;
    }

    setRows((prev) =>
      prev.map((row) => (row.id === editingRow.id ? { ...row, ...payload } : row))
    );
    toast.success("Mise à jour enregistrée");
    setEditingRow(null);
  };

  const rowsWithWebsite = getWebsiteUrl
    ? rows.filter((row) => {
        const url = getWebsiteUrl(row);
        return typeof url === "string" && url.trim() !== "";
      }).length
    : 0;

  const latestUpdate = rows
    .map((row) => row.updated_at)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total enregistrements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        {getWebsiteUrl && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sites web disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{rowsWithWebsite}</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dernière mise à jour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {latestUpdate
                ? new Date(latestUpdate).toLocaleString("fr-FR")
                : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Input
            placeholder="Rechercher dans les données..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Table {tableName}</CardTitle>
          <CardDescription>
            {loading
              ? "Chargement des données..."
              : `${filteredRows.length} ligne${filteredRows.length > 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((column) => {
                      const displayValue = formatValue(row[column.key], column.type);
                      return (
                        <TableCell key={column.key} className="max-w-[220px]">
                          <span className="block truncate" title={displayValue}>
                            {displayValue}
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const url = getWebsiteUrl?.(row);
                            if (!url) return;
                            window.open(ensureHttpsUrl(url), "_blank", "noopener,noreferrer");
                          }}
                          disabled={!getWebsiteUrl?.(row)}
                          title="Ouvrir le site"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenModal(row)}
                          title="Modifier"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {currentPage > 2 && (
                <>
                  <PaginationItem>
                    <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                      1
                    </PaginationLink>
                  </PaginationItem>
                  {currentPage > 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                </>
              )}
              {Array.from({ length: Math.min(3, totalPages) }, (_, index) => {
                let pageNum;
                if (totalPages <= 3) {
                  pageNum = index + 1;
                } else if (currentPage <= 2) {
                  pageNum = index + 1;
                } else if (currentPage >= totalPages - 1) {
                  pageNum = totalPages - 2 + index;
                } else {
                  pageNum = currentPage - 1 + index;
                }
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              {currentPage < totalPages - 1 && (
                <>
                  {currentPage < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationLink
                      onClick={() => setCurrentPage(totalPages)}
                      className="cursor-pointer"
                    >
                      {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages} ({filteredRows.length} ligne
            {filteredRows.length > 1 ? "s" : ""})
          </div>
        </div>
      )}

      {filteredRows.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Aucun enregistrement trouvé.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingRow} onOpenChange={() => setEditingRow(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Modifier l'enregistrement
            </DialogTitle>
            <DialogDescription>
              Mettez à jour les informations puis enregistrez.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {columns.map((column) => {
              const value = editForm[column.key] ?? "";
              const isTextarea = column.isLong || column.type === "json" || column.type === "stringArray";
              return (
                <div key={column.key} className="space-y-2">
                  <Label htmlFor={`field-${column.key}`}>{column.label}</Label>
                  {isTextarea ? (
                    <Textarea
                      id={`field-${column.key}`}
                      value={value}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, [column.key]: event.target.value }))
                      }
                      disabled={column.readOnly}
                      className="min-h-[120px]"
                    />
                  ) : (
                    <Input
                      id={`field-${column.key}`}
                      value={value}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, [column.key]: event.target.value }))
                      }
                      disabled={column.readOnly}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditingRow(null)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
