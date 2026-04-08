"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Phone, Calendar, FileText, Handshake } from "lucide-react";
import { formatCurrency, formatCompactCurrency } from "./helpers";
import { PipelineBreakdownData } from "./types";

interface Props {
  totalSigned: number;
  totalCollected: number;
  totalPending: number;
  callsToBeMade: number;
  contactToCallRate: number;
  callToMeetingRate: number;
  meetingToQuoteRate: number;
  quoteToSignRate: number;
  totalAppels: number;
  totalRdv: number;
  totalDevis: number;
  totalSignatures: number;
  contactsCount: number;
  pipelineBreakdown: PipelineBreakdownData[];
  isMobile: boolean;
}

export function CommercialTabContent({
  totalSigned,
  totalCollected,
  totalPending,
  callsToBeMade,
  contactToCallRate,
  callToMeetingRate,
  meetingToQuoteRate,
  quoteToSignRate,
  totalAppels,
  totalRdv,
  totalDevis,
  totalSignatures,
  contactsCount,
  pipelineBreakdown,
  isMobile,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Résumé financier */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé financier</CardTitle>
          <CardDescription>Suivi des revenus et encaissements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {[
              { label: "Total signé", value: totalSigned, color: "text-green-600" },
              { label: "Total encaissé", value: totalCollected, color: "text-blue-600" },
              { label: "Restant à encaisser", value: totalPending, color: "text-orange-600" },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 md:p-4 border rounded-lg">
                <div className={`text-lg md:text-2xl font-bold ${item.color}`}>
                  <span className="md:hidden">{formatCompactCurrency(item.value)}</span>
                  <span className="hidden md:inline">{formatCurrency(item.value)}</span>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">{item.label}</p>
              </div>
            ))}
            <div className="text-center p-3 md:p-4 border rounded-lg">
              <div className="text-lg md:text-2xl font-bold text-purple-600">{callsToBeMade}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Appels à passer</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Taux de conversion */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        {[
          {
            title: "Taux contact→appel",
            value: contactToCallRate,
            icon: Phone,
            color: "text-blue-600",
            detail: `${totalAppels}/${contactsCount} contacts`,
          },
          {
            title: "Taux appel→RDV",
            value: callToMeetingRate,
            icon: Calendar,
            color: "text-green-600",
            detail: `${totalRdv}/${totalAppels} appels`,
          },
          {
            title: "Taux RDV→devis",
            value: meetingToQuoteRate,
            icon: FileText,
            color: "text-purple-600",
            detail: `${totalDevis}/${totalRdv} RDV`,
          },
          {
            title: "Taux devis→signature",
            value: quoteToSignRate,
            icon: Handshake,
            color: "text-orange-600",
            detail: `${totalSignatures}/${totalDevis} devis`,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm font-medium">{metric.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-lg md:text-2xl font-bold ${metric.color}`}>
                  {metric.value.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Répartition du pipeline</CardTitle>
          <CardDescription>Valeur et nombre d&apos;opportunités par étape</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineBreakdown} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={isMobile ? 10 : 12}
                />
                <YAxis />
                <RechartsTooltip
                  formatter={(value, name) => [
                    name === "value" ? formatCurrency(Number(value)) : value,
                    name === "value" ? "Valeur" : "Opportunités",
                  ]}
                />
                <Legend />
                <Bar
                  dataKey="opportunities"
                  fill="var(--chart-1)"
                  radius={[6, 6, 0, 0]}
                  name="Opportunités"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
