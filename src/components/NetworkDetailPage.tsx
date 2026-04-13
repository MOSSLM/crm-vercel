"use client";

import React from "react";
import Link from "next/link";
import { useAppData } from "./AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { networksApi, companiesApi } from "../utils/api";
import { toast } from "sonner";
import { ArrowLeft, Eye, Trash2, Save } from "lucide-react";

interface Props {
  id: string;
}

const NetworkDetailPage: React.FC<Props> = ({ id }) => {
  const { networks, getNetworkMembers, refreshData } = useAppData();
  const network = networks.find((n) => n.id === id);
  const members = getNetworkMembers(id);
  const [form, setForm] = React.useState({
    label: network?.label || "",
    note: network?.note || "",
  });
  const [isSaving, setIsSaving] = React.useState(false);

  if (!network) {
    return (
      <div className="p-3 md:p-6">
        <h1>Réseau introuvable</h1>
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await networksApi.update(id, { label: form.label, note: form.note });
      await refreshData();
      toast.success("Réseau mis à jour");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (companyId: number) => {
    try {
      await companiesApi.update(companyId, { reseau_id: null });
      await refreshData();
      toast.success("Entreprise retirée du réseau");
    } catch (error) {
      toast.error("Erreur lors du retrait");
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/networks">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </Link>
        </Button>
        <h1>{form.label}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Label du réseau"
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
          />
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" /> Sauvegarder
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Notes"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" /> Sauvegarder
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entreprises membres</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground">Aucune entreprise</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{getCompanyDisplayName(c.name, c.canonical_url)}</TableCell>
                    <TableCell className="text-right flex gap-2 justify-end">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/companies/${c.id}`}>
                          <Eye className="h-4 w-4 mr-1" /> Voir
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveMember(c.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Retirer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NetworkDetailPage;
