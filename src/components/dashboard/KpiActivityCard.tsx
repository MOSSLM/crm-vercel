"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  Repeat,
  Calendar,
  FileText,
  Handshake,
  Banknote,
  Star,
  TrendingUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import { JournalKpiTotals } from "@/utils/journalApi";
import { PeriodType } from "./types";
import { getPeriodLabel } from "./helpers";

interface Props {
  journalKpis: JournalKpiTotals;
  selectedPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  totalAppels: number;
  totalRelances: number;
  totalRdv: number;
  totalDevis: number;
  totalSignatures: number;
  totalAcomptes: number;
  totalLeadMagnets: number;
  loadingKpis: boolean;
  kpiError: string | null;
}

const kpiItems = [
  { key: "appels", label: "Appels", icon: Phone, color: "blue" },
  { key: "relances", label: "Relances", icon: Repeat, color: "orange" },
  { key: "rdv", label: "RDV", icon: Calendar, color: "purple" },
  { key: "devis", label: "Devis", icon: FileText, color: "yellow" },
  { key: "signatures", label: "Signatures", icon: Handshake, color: "green" },
  { key: "acomptes", label: "Acomptes", icon: Banknote, color: "emerald" },
  { key: "leadMagnets", label: "Lead Magnets", icon: Star, color: "pink" },
] as const;

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-600",
  orange: "bg-orange-50 border-orange-200 text-orange-600",
  purple: "bg-purple-50 border-purple-200 text-purple-600",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-600",
  green: "bg-green-50 border-green-200 text-green-600",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
  pink: "bg-pink-50 border-pink-200 text-pink-600",
};

export function KpiActivityCard({
  journalKpis,
  selectedPeriod,
  onPeriodChange,
  totalAppels,
  totalRelances,
  totalRdv,
  totalDevis,
  totalSignatures,
  totalAcomptes,
  totalLeadMagnets,
  loadingKpis,
  kpiError,
}: Props) {
  const values = [totalAppels, totalRelances, totalRdv, totalDevis, totalSignatures, totalAcomptes, totalLeadMagnets];
  const totals = [
    journalKpis.total_appels,
    journalKpis.total_relances,
    journalKpis.total_rdvs,
    journalKpis.total_devis,
    journalKpis.total_signatures,
    journalKpis.total_acomptes,
    journalKpis.total_lead_magnets,
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Activité commerciale réelle</CardTitle>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Temps réel
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Période :</span>
            <Select value={selectedPeriod} onValueChange={(v) => onPeriodChange(v as PeriodType)}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semaine</SelectItem>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Année</SelectItem>
                <SelectItem value="total">Total</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardDescription>
          Données précises extraites du journal d&apos;activité • Affichage {getPeriodLabel(selectedPeriod)}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loadingKpis ? (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : kpiError ? (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="text-sm text-muted-foreground mb-1">Erreur de chargement des KPI</p>
            <p className="text-xs text-destructive">{kpiError}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
              {kpiItems.map((item, index) => {
                const Icon = item.icon;
                const classes = colorMap[item.color];
                return (
                  <div key={item.key} className={`text-center p-3 border rounded-lg ${classes}`}>
                    <Icon className="h-5 w-5 mx-auto mb-2" />
                    <div className="text-xl font-bold">{values[index]}</div>
                    <div className="text-xs">
                      {item.label} {selectedPeriod !== "total" ? getPeriodLabel(selectedPeriod) : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedPeriod !== "total" && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800">Comparaison avec le total</span>
                  <Badge variant="outline" className="text-xs">
                    {getPeriodLabel(selectedPeriod)} vs total
                  </Badge>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                  {kpiItems.map((item, index) => (
                    <div key={item.key} className="text-center">
                      <div className="font-medium">{item.label.slice(0, 3)}</div>
                      <div>
                        {values[index]}/{totals[index]}
                        <div className="opacity-75">
                          ({totals[index] > 0 ? ((values[index] / totals[index]) * 100).toFixed(1) : 0}%)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
              {[
                {
                  label: "Taux Appels → RDV",
                  value: totalAppels > 0 ? ((totalRdv / totalAppels) * 100).toFixed(1) : "0",
                  color: "text-purple-600",
                },
                {
                  label: "Taux RDV → Devis",
                  value: totalRdv > 0 ? ((totalDevis / totalRdv) * 100).toFixed(1) : "0",
                  color: "text-yellow-600",
                },
                {
                  label: "Taux Devis → Signature",
                  value: totalDevis > 0 ? ((totalSignatures / totalDevis) * 100).toFixed(1) : "0",
                  color: "text-green-600",
                },
              ].map((rate) => (
                <div key={rate.label} className="p-3 bg-muted border border-border rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{rate.label}</span>
                    <span className={`text-lg font-bold ${rate.color}`}>{rate.value}%</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{getPeriodLabel(selectedPeriod)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
