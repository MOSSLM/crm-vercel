"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { FlaskConical, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/utils/supabase/client';
import { authedFetch } from '@/utils/authedFetch';
import { useAppData } from './AppDataContext';

interface TestAddress {
  id: string;
  label: string;
  email: string;
}

interface TestModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mode test des envois : gestion des adresses email personnelles et création
 * d'opportunités de test reliées à ces adresses (entreprise + contact fictifs).
 */
export function TestModeDialog({ open, onOpenChange }: TestModeDialogProps) {
  const { pipelines, pipelineStages, refreshData } = useAppData();

  const [addresses, setAddresses] = useState<TestAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const [addressId, setAddressId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoadingAddresses(true);
    try {
      const { data, error } = await supabase
        .from('test_email_addresses')
        .select('id,label,email')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setAddresses((data ?? []) as TestAddress[]);
    } catch {
      toast.error('Impossible de charger les adresses de test');
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadAddresses();
  }, [open, loadAddresses]);

  const visiblePipelines = useMemo(() => pipelines.filter((p) => p.visible !== false), [pipelines]);
  const stagesForPipeline = useMemo(
    () => pipelineStages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.ordre - b.ordre),
    [pipelineStages, pipelineId],
  );
  const selectedAddress = addresses.find((a) => a.id === addressId);
  const defaultName = selectedAddress ? `[TEST] ${selectedAddress.label || selectedAddress.email.split('@')[0]}` : '';

  const handleAddAddress = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email invalide');
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase
        .from('test_email_addresses')
        .insert({ label: newLabel.trim(), email });
      if (error) throw error;
      setNewLabel('');
      setNewEmail('');
      await loadAddresses();
      toast.success('Adresse de test ajoutée');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('duplicate') ? 'Cette adresse existe déjà' : "Erreur lors de l'ajout");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      const { error } = await supabase.from('test_email_addresses').delete().eq('id', id);
      if (error) throw error;
      if (addressId === id) setAddressId('');
      await loadAddresses();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleCreate = async () => {
    if (!addressId || !pipelineId || !stageId) {
      toast.error('Choisissez une adresse, un pipeline et une étape');
      return;
    }
    setCreating(true);
    try {
      const res = await authedFetch('/api/test-opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_address_id: addressId,
          pipeline_id: pipelineId,
          stage_id: Number(stageId),
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Échec de la création');
      toast.success(`Opportunité de test créée — les envois iront sur ${data.email}`);
      setName('');
      await refreshData();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-600" />
            Mode test
          </DialogTitle>
          <DialogDescription>
            Créez une opportunité reliée à une de vos adresses pour tester les séquences et envois
            en conditions réelles, sans toucher de vrais prospects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Adresses de test ── */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mes adresses de test
            </Label>
            {loadingAddresses ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Chargement…
              </div>
            ) : addresses.length === 0 ? (
              <p className="py-1 text-sm text-muted-foreground">
                Aucune adresse — ajoutez vos adresses personnelles ci-dessous.
              </p>
            ) : (
              <ul className="space-y-1">
                {addresses.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <span className="truncate">
                      {a.email}
                      {a.label && <span className="ml-2 text-xs text-muted-foreground">{a.label}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAddress(a.id)}
                      className="ml-2 shrink-0 text-muted-foreground transition-colors hover:text-red-600"
                      aria-label={`Supprimer ${a.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Libellé (ex: Gmail perso)"
                className="h-8 text-sm"
              />
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="adresse@exemple.com"
                type="email"
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddAddress} disabled={adding} className="h-8 shrink-0 gap-1">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Ajouter
              </Button>
            </div>
          </section>

          <Separator />

          {/* ── Créer une opportunité de test ── */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Créer une opportunité de test
            </Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse de réception</Label>
              <Select value={addressId} onValueChange={setAddressId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Choisir une adresse" />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.email}
                      {a.label ? ` — ${a.label}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pipeline</Label>
                <Select
                  value={pipelineId}
                  onValueChange={(v) => {
                    setPipelineId(v);
                    setStageId('');
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {visiblePipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Étape</Label>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Étape" />
                  </SelectTrigger>
                  <SelectContent>
                    {stagesForPipeline.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nom (optionnel)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName || '[TEST] …'}
                className="h-8 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Si une séquence est déclenchée sur l&apos;étape choisie, l&apos;inscription est
              automatique. Sinon, glissez ensuite la carte vers l&apos;étape déclencheuse.
            </p>
            <Button onClick={handleCreate} disabled={creating || !addressId || !pipelineId || !stageId} className="w-full gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Créer l&apos;opportunité de test
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
