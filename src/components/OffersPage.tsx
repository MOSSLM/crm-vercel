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
import { Checkbox } from './ui/checkbox';

const getBillingLabel = (billing?: string) => {
  if (billing === 'monthly') return 'MRR (mensuel)';
  if (billing === 'one_shot') return 'Ponctuel';
  if (!billing) return 'Non défini';
  return billing;
};

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
    package_discount_type: 'percent' as 'percent' | 'fixed',
    package_discount_value: '0',
  });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => a.qualification_order - b.qualification_order || a.nom.localeCompare(b.nom)),
    [offers],
  );

  const availableServices = useMemo(
    () => sortedOffers.filter((o) => o.type === 'service' && o.actif),
    [sortedOffers],
  );

  const packageBaseTotal = useMemo(
    () => selectedServiceIds.reduce((sum, id) => {
      const service = availableServices.find((s) => s.id === id);
      return sum + (service?.prix_ht || 0);
    }, 0),
    [selectedServiceIds, availableServices],
  );

  const packageDiscountValueNumber = Number.parseFloat(form.package_discount_value || '0');
  const packageDiscountAmount =
    form.package_discount_type === 'percent'
      ? (Number.isFinite(packageDiscountValueNumber) ? (packageBaseTotal * packageDiscountValueNumber) / 100 : 0)
      : (Number.isFinite(packageDiscountValueNumber) ? packageDiscountValueNumber : 0);
  const packageFinalTotal = Math.max(0, packageBaseTotal - packageDiscountAmount);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleCreate = async () => {
    if (!form.nom.trim()) return;

    const isPackage = form.type === 'package';
    const computedPrice = isPackage ? packageFinalTotal : Number.parseFloat(form.prix_ht);

    await addOffer({
      type: form.type,
      nom: form.nom.trim(),
      description: form.description.trim() || undefined,
      prix_ht: Number.isFinite(computedPrice) ? computedPrice : undefined,
      devise: form.devise.trim() || 'EUR',
      billing_period: form.billing_period,
      qualification_order: Number.parseInt(form.qualification_order, 10) || 100,
      visible_in_qualification: form.visible_in_qualification,
      actif: form.actif,
      tags: [],
      metadata: {},
      package_discount_type: isPackage ? form.package_discount_type : undefined,
      package_discount_value: isPackage && Number.isFinite(packageDiscountValueNumber)
        ? packageDiscountValueNumber
        : undefined,
      included_items: isPackage
        ? selectedServiceIds.map((id) => ({ included_offre_id: id, quantite: 1 }))
        : [],
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
      package_discount_type: 'percent',
      package_discount_value: '0',
    });
    setSelectedServiceIds([]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Offres</h1>
        <p className="text-muted-foreground">Créez des services ou des packages avec calcul auto du prix.</p>
      </div>

      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle>Nouvelle offre</CardTitle>
          <CardDescription>Pour les packages, sélectionnez les services et la réduction.</CardDescription>
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
            <Input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>

          {form.type === 'service' ? (
            <div className="space-y-2">
              <Label>Prix HT</Label>
              <Input type="number" value={form.prix_ht} onChange={(e) => setForm((p) => ({ ...p, prix_ht: e.target.value }))} />
            </div>
          ) : (
            <div className="space-y-2 md:col-span-2 rounded-lg border p-3 bg-muted/30">
              <Label>Services inclus</Label>
              <div className="grid md:grid-cols-2 gap-2 mt-2 max-h-48 overflow-auto">
                {availableServices.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedServiceIds.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <span>{service.nom}</span>
                    <span className="text-muted-foreground">({service.prix_ht?.toLocaleString('fr-FR') || 0}€)</span>
                  </label>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div className="space-y-2">
                  <Label>Type de réduction</Label>
                  <Select
                    value={form.package_discount_type}
                    onValueChange={(v) => setForm((p) => ({ ...p, package_discount_type: v as 'percent' | 'fixed' }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="fixed">€</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valeur réduction</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.package_discount_value}
                    onChange={(e) => setForm((p) => ({ ...p, package_discount_value: e.target.value }))}
                  />
                </div>
              </div>

              <div className="text-sm mt-2 space-y-1">
                <p>Total services: <strong>{packageBaseTotal.toLocaleString('fr-FR')}€</strong></p>
                <p>Réduction: <strong>-{packageDiscountAmount.toLocaleString('fr-FR')}€</strong></p>
                <p>Prix package final: <strong>{packageFinalTotal.toLocaleString('fr-FR')}€</strong></p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Devise</Label>
            <Input value={form.devise} onChange={(e) => setForm((p) => ({ ...p, devise: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Facturation</Label>
            <Select value={form.billing_period} onValueChange={(v) => setForm((p) => ({ ...p, billing_period: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_shot">Ponctuel</SelectItem>
                <SelectItem value="monthly">MRR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ordre qualification</Label>
            <Input type="number" value={form.qualification_order} onChange={(e) => setForm((p) => ({ ...p, qualification_order: e.target.value }))} />
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
            <CardContent className="space-y-2">
              <p className="text-sm">Prix: {typeof offer.prix_ht === 'number' ? `${offer.prix_ht.toLocaleString('fr-FR')} ${offer.devise}` : 'Non défini'}</p>
              {offer.type === 'package' && offer.package_discount_value !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Réduction: {offer.package_discount_type === 'percent' ? `${offer.package_discount_value}%` : `${offer.package_discount_value}€`}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={offer.visible_in_qualification} onCheckedChange={(v) => void updateOffer(offer.id, { visible_in_qualification: Boolean(v) })} />
                <Label>Visible en qualification</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={offer.actif} onCheckedChange={(v) => void updateOffer(offer.id, { actif: Boolean(v) })} />
                <Label>Actif</Label>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
