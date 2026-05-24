'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Form } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { authedFetch } from "@/utils/authedFetch";

export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    authedFetch('/api/forms')
      .then((r) => r.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch(() => setForms([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await authedFetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nouveau formulaire' }),
      });
      if (!res.ok) throw new Error('Failed');
      const form = await res.json();
      router.push(`/forms/${form.id}/edit`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formulaires</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Créez et gérez vos formulaires de capture de leads.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          <Plus className="w-4 h-4 mr-2" />
          {creating ? 'Création…' : 'Nouveau formulaire'}
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Chargement…</div>
      ) : forms.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <p className="text-sm">Aucun formulaire. Créez votre premier formulaire.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => (
                <TableRow
                  key={form.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/forms/${form.id}/edit`)}
                >
                  <TableCell className="font-medium">{form.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(form.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {form.questions?.length ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={form.is_published ? 'default' : 'outline'}>
                      {form.is_published ? 'Publié' : 'Brouillon'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(form.created_at).toLocaleDateString('fr-FR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
