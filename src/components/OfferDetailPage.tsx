"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppData } from './AppDataContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

export const OfferDetailPage: React.FC<{ offerId: string }> = ({ offerId }) => {
  const router = useRouter();
  const { offers, updateOffer } = useAppData();

  const offer = useMemo(() => offers.find((item) => item.id === offerId), [offers, offerId]);

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
  const [selectedServices, setSelectedServices] = useState<Record<string, { discountType: 'percent' | 'fixed'; discountValue: string }>>({});
  const formatCurrency = (value: number) => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;

  useEffect(() => {
    if (!offer) return;
    setForm({
      type: offer.type,
      nom: offer.nom,
      description: offer.description || '',
      prix_ht: typeof offer.prix_ht === 'number' ? String(offer.prix_ht) : '',
      devise: offer.devise || 'EUR',
      billing_period: offer.billing_period || 'one_shot',
      qualification_order: String(offer.qualification_order || 100),
      visible_in_qualification: offer.visible_in_qualification,
      actif: offer.actif,
      package_discount_type: offer.package_discount_type || 'percent',
      package_discount_value: String(offer.package_discount_value ?? 0),
    });
    const entries = (offer.included_items || []).map((item) => [
      item.included_offre_id,
      {
        discountType: item.discount_type || 'percent',
        discountValue: String(item.discount_value ?? 0),
      },
    ] as const);
    setSelectedServices(Object.fromEntries(entries));
  }, [offer]);

  const availableServices = useMemo(
    () => offers.filter((item) => item.type === 'service' && item.actif && item.id !== offerId),
    [offers, offerId],
  );

  const packageCalculation = useMemo(() => {
    const lines = Object.entries(selectedServices)
      .map(([serviceId, discountConfig]) => {
        const service = availableServices.find((s) => s.id === serviceId);
        if (!service) return null;
        const basePrice = service.prix_ht || 0;
        const rawDiscountValue = Number.parseFloat(discountConfig.discountValue || '0');
        const normalizedDiscountValue = Number.isFinite(rawDiscountValue) ? Math.max(0, rawDiscountValue) : 0;
        const discountAmount = discountConfig.discountType === 'percent'
          ? (basePrice * normalizedDiscountValue) / 100
          : normalizedDiscountValue;
        const finalPrice = Math.max(0, basePrice - discountAmount);
        return { serviceId, service, basePrice, discountConfig, discountAmount: Math.min(basePrice, discountAmount), finalPrice };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      lines,
      baseTotal: lines.reduce((sum, line) => sum + line.basePrice, 0),
      totalDiscount: lines.reduce((sum, line) => sum + line.discountAmount, 0),
      finalTotal: lines.reduce((sum, line) => sum + line.finalPrice, 0),
    };
  }, [selectedServices, availableServices]);

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) => {
      if (prev[serviceId]) {
        const clone = { ...prev };
        delete clone[serviceId];
        return clone;
      }
      return { ...prev, [serviceId]: { discountType: 'percent', discountValue: '0' } };
    });
  };

  const updateServiceDiscount = (serviceId: string, updates: Partial<{ discountType: 'percent' | 'fixed'; discountValue: string }>) => {
    setSelectedServices((prev) => {
      const current = prev[serviceId];
      if (!current) return prev;
      return { ...prev, [serviceId]: { ...current, ...updates } };
    });
  };

  const handleSave = async () => {
    if (!offer) return;

    const isPackage = form.type === 'package';
    const computedPrice = isPackage ? packageCalculation.finalTotal : Number.parseFloat(form.prix_ht);

    await updateOffer(offer.id, {
      type: form.type,
      nom: form.nom.trim(),
      description: form.description.trim() || undefined,
      prix_ht: Number.isFinite(computedPrice) ? computedPrice : undefined,
      devise: form.devise.trim() || 'EUR',
      billing_period: form.billing_period,
      qualification_order: Number.parseInt(form.qualification_order, 10) || 100,
      visible_in_qualification: form.visible_in_qualification,
      actif: form.actif,
      included_items: isPackage
        ? Object.entries(selectedServices).map(([id, config]) => ({
          included_offre_id: id,
          quantite: 1,
          discount_type: config.discountType,
          discount_value: Number.parseFloat(config.discountValue || '0') || 0,
        }))
        : [],
    });

    toast.success('Offre mise à jour.');
    router.push('/offres');
  };

  if (!offer) {
    return (
      <div className="p-3 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Offre introuvable</CardTitle>
            <CardDescription>Cette offre n’existe plus ou n’a pas encore été chargée.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/offres')}>Retour aux offres</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Modifier l&apos;offre</CardTitle>
          <CardDescription>{offer.nom}</CardDescription>
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
                      checked={Boolean(selectedServices[service.id])}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <span>{service.nom}</span>
                    <span className="text-muted-foreground">({service.prix_ht?.toLocaleString('fr-FR') || 0}€)</span>
                  </label>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div className="space-y-2">
                  <Label>Détail par service</Label>
                  <div className="space-y-2 max-h-56 overflow-auto pr-1">
                    {packageCalculation.lines.map((line) => (
                      <div key={line.serviceId} className="rounded border p-2 space-y-2 bg-background/80">
                        <p className="text-xs font-medium">{line.service.nom}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={line.discountConfig.discountType}
                            onValueChange={(v) => updateServiceDiscount(line.serviceId, { discountType: v as 'percent' | 'fixed' })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="fixed">€</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            value={line.discountConfig.discountValue}
                            onChange={(e) => updateServiceDiscount(line.serviceId, { discountValue: e.target.value })}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{formatCurrency(line.basePrice)} - {formatCurrency(line.discountAmount)} = <strong>{formatCurrency(line.finalPrice)}</strong></p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-sm mt-2 space-y-1">
                <p>Total services: <strong>{formatCurrency(packageCalculation.baseTotal)}</strong></p>
                <p>Réduction totale: <strong>-{formatCurrency(packageCalculation.totalDiscount)}</strong></p>
                <p>Prix package final: <strong>{formatCurrency(packageCalculation.finalTotal)}</strong></p>
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
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/offres')}>Annuler</Button>
            <Button onClick={handleSave}>Enregistrer</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
