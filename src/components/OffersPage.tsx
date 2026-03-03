"use client";

import React, { useMemo, useState } from 'react';
import { useAppData } from './AppDataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const getBillingLabel = (billing?: string) => {
  if (billing === 'monthly') return 'MRR (mensuel)';
  if (billing === 'one_shot') return 'Ponctuel (one-shot)';
  if (!billing) return 'Non défini';
  return billing;
};

const getDefaultOpportunityType = (billing?: string) => (billing === 'monthly' ? 'mrr' : 'one_shot');

export const OffersPage: React.FC = () => {
  const { offers, addOffer, updateOffer } = useAppData();
  const [form, setForm] = useState({
    type: 'service' as 'service' | 'package',
    nom: '',
    description: '',
    prix_ht: '',
    devise: 'EUR',
    billing_period: 'one_shot',
    qualification_order: '100',
    visible_in_qualification: true,
    actif: true,
    metadataPairs: '',
  });

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => a.qualification_order - b.qualification_order || a.nom.localeCompare(b.nom)),
    [offers],
  );

  const parseMetadataPairs = (raw: string): Record<string, unknown> => {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const meta: Record<string, unknown> = {};
    lines.forEach((line) => {
      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) return;
      const value = rest.join(':').trim();
      meta[key.trim()] = value;
    });
    return meta;
  };

  const handleCreate = async () => {
    if (!form.nom.trim()) return;

    const metadata = {
      ...parseMetadataPairs(form.metadataPairs),
      default_opportunity_type: getDefaultOpportunityType(form.billing_period),
    };

    await addOffer({
      type: form.type,
      nom: form.nom.trim(),
      description: form.description.trim() || undefined,
      prix_ht: form.prix_ht.trim() ? Number.parseFloat(form.prix_ht) : undefined,
      devise: form.devise.trim() || 'EUR',
      billing_period: form.billing_period,
      qualification_order: Number.parseInt(form.qualification_order, 10) || 100,
      visible_in_qualification: form.visible_in_qualification,
      actif: form.actif,
      tags: [],
      metadata,
    });

    setForm({
      type: 'service',
      nom: '',
      description: '',
      prix_ht: '',
      devise: 'EUR',
      billing_period: 'one_shot',
      qualification_order: '100',
      visible_in_qualification: true,
      actif: true,
      metadataPairs: '',
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Offres</h1>
        <p className="text-muted-foreground">
          Gérez vos services/packages et définissez si l&apos;opportunité auto doit être MRR ou ponctuelle.
        </p>
      </div>

      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle>Nouvelle offre</CardTitle>
          <CardDescription>Type, pricing, visibilité qualification et métadonnées complémentaires.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as 'service' | 'package' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="package">Package</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} placeholder="Ex: Pack SEO local" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Prix HT</Label>
            <Input type="number" value={form.prix_ht} onChange={(e) => setForm((p) => ({ ...p, prix_ht: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Devise</Label>
            <Input value={form.devise} onChange={(e) => setForm((p) => ({ ...p, devise: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Facturation / type d&apos;opportunité</Label>
            <Select value={form.billing_period} onValueChange={(v) => setForm((p) => ({ ...p, billing_period: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_shot">Ponctuel (one_shot)</SelectItem>
                <SelectItem value="monthly">MRR (monthly)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ordre qualification</Label>
            <Input type="number" value={form.qualification_order} onChange={(e) => setForm((p) => ({ ...p, qualification_order: e.target.value }))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Autres paires clé:valeur (1 par ligne)</Label>
            <Textarea
              value={form.metadataPairs}
              onChange={(e) => setForm((p) => ({ ...p, metadataPairs: e.target.value }))}
              placeholder={'persona: dentiste\ncanal: cold_call'}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.visible_in_qualification} onCheckedChange={(v) => setForm((p) => ({ ...p, visible_in_qualification: Boolean(v) }))} />
            <Label>Visible en qualification</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.actif} onCheckedChange={(v) => setForm((p) => ({ ...p, actif: Boolean(v) }))} />
            <Label>Actif</Label>
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleCreate}>Créer l&apos;offre</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedOffers.map((offer) => (
          <Card key={offer.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                {offer.nom}
                <Badge variant="secondary">{offer.type}</Badge>
                <Badge variant="outline">{getBillingLabel(offer.billing_period)}</Badge>
              </CardTitle>
              <CardDescription>{offer.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">Prix: {typeof offer.prix_ht === 'number' ? `${offer.prix_ht.toLocaleString('fr-FR')} ${offer.devise}` : 'Non défini'}</p>
              <p className="text-xs text-muted-foreground">Ordre qualification: {offer.qualification_order}</p>
              <div className="flex items-center gap-2">
                <Switch checked={offer.visible_in_qualification} onCheckedChange={(v) => void updateOffer(offer.id, { visible_in_qualification: Boolean(v) })} />
                <Label>Visible en qualification</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={offer.actif} onCheckedChange={(v) => void updateOffer(offer.id, { actif: Boolean(v) })} />
                <Label>Actif</Label>
              </div>
              {offer.included_items.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {offer.included_items.map((item) => (
                    <Badge key={item.id} variant="outline">{item.nom || item.included_offre_id}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
