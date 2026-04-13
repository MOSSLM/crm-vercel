"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Pencil, Target } from "lucide-react";
import { formatCurrency } from "./helpers";

const PLAYBOOK_WD = 22;

interface Projection {
  decideurs: number;
  interesses: number;
  ventesParMois: number;
  caParMois: number;
}

interface Props {
  appelsParJour: number;
  tauxInteretReel: number;
  tauxClosingReel: number;
  avgPaidPrice: number;
  pickupRate: number;
  pickupDraft: number;
  pickupEditing: boolean;
  onPickupDraftChange: (value: number) => void;
  onPickupEditToggle: () => void;
  onPickupSave: (value: number) => void;
  projection: Projection;
}

export function ColdCallProjectionCard({
  appelsParJour,
  tauxInteretReel,
  tauxClosingReel,
  avgPaidPrice,
  pickupRate,
  pickupDraft,
  pickupEditing,
  onPickupDraftChange,
  onPickupEditToggle,
  onPickupSave,
  projection,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle>Projection Cold Call</CardTitle>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            Données réelles
          </span>
        </div>
        <CardDescription>
          Calculé sur le mois courant ({PLAYBOOK_WD} jours ouvrés) • Prix moyen issu des contrats payés
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Input metrics */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricBox label="Appels / jour" badge="Réel" color="blue">
            {appelsParJour.toFixed(1)}
          </MetricBox>

          {/* Taux décroché — éditable */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            {pickupEditing ? (
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={pickupDraft}
                  onChange={(e) => onPickupDraftChange(Number(e.target.value))}
                  className="w-14 rounded border border-amber-300 bg-white px-1 py-0.5 text-center text-lg font-bold text-amber-700 focus:outline-none"
                  autoFocus
                />
                <span className="text-lg font-bold text-amber-700">%</span>
                <button
                  type="button"
                  className="ml-1 rounded bg-amber-500 p-0.5 text-white hover:bg-amber-600"
                  onClick={() => {
                    const clamped = Math.min(100, Math.max(1, pickupDraft));
                    onPickupSave(clamped);
                  }}
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="text-2xl font-bold text-amber-700">{pickupRate}%</div>
            )}
            <div className="mt-1 text-xs text-amber-600 font-medium">Taux décroché</div>
            <button
              type="button"
              className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600 hover:bg-amber-200"
              onClick={onPickupEditToggle}
            >
              <Pencil className="h-2.5 w-2.5" />
              Cible
            </button>
          </div>

          <MetricBox label="Taux d'intérêt" badge="Réel (appel→RDV)" color="blue">
            {tauxInteretReel.toFixed(1)}%
          </MetricBox>
          <MetricBox label="Taux de closing" badge="Réel (RDV→signature)" color="blue">
            {tauxClosingReel.toFixed(1)}%
          </MetricBox>
          <MetricBox
            label="Prix moyen"
            badge={avgPaidPrice > 0 ? "Réel (contrats payés)" : "Aucun contrat payé"}
            color="blue"
          >
            {avgPaidPrice > 0 ? formatCurrency(Math.round(avgPaidPrice)) : "—"}
          </MetricBox>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 border-t border-border/50" />
          <span>Projection mensuelle</span>
          <div className="flex-1 border-t border-border/50" />
        </div>

        {/* Projection outputs */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <ProjectionBox label="Décideurs / jour" value={String(projection.decideurs)} />
          <ProjectionBox label="Intéressés / jour" value={String(projection.interesses)} color="text-amber-500" />
          <ProjectionBox label="Ventes / mois" value={String(projection.ventesParMois)} color="text-emerald-500" />
          <ProjectionBox label="CA / mois projeté" value={formatCurrency(projection.caParMois)} color="text-emerald-500" />
        </div>

        <p className="text-xs text-muted-foreground">
          Calcul sur {PLAYBOOK_WD} jours ouvrés. Taux d&apos;intérêt = appels→RDV • Taux de closing = RDV→signature • Taux décroché = cible saisie manuellement.
        </p>
      </CardContent>
    </Card>
  );
}

function MetricBox({
  label,
  badge,
  color,
  children,
}: {
  label: string;
  badge: string;
  color: string;
  children: React.ReactNode;
}) {
  const classes =
    color === "blue"
      ? "rounded-lg border border-blue-200 bg-blue-50 p-3 text-center"
      : "rounded-lg border border-border/60 bg-muted/40 p-3 text-center";
  const textColor = color === "blue" ? "text-blue-700" : "";
  const badgeColor = color === "blue" ? "bg-blue-100 text-blue-600" : "bg-muted text-muted-foreground";

  return (
    <div className={classes}>
      <div className={`text-2xl font-bold ${textColor}`}>{children}</div>
      <div className={`mt-1 text-xs font-medium ${textColor}`}>{label}</div>
      <span className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${badgeColor}`}>
        {badge}
      </span>
    </div>
  );
}

function ProjectionBox({
  label,
  value,
  color = "",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-center">
      <div className={`text-xl md:text-3xl font-semibold ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
