"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, Banknote, Clock, PhoneCall } from "lucide-react";
import { formatCurrency, formatCompactCurrency } from "./helpers";

interface Props {
  totalSigned: number;
  totalCollected: number;
  totalPending: number;
  totalSignatures: number;
  totalAcomptes: number;
  callsToBeMade: number;
}

export function FinancialMetricCards({
  totalSigned,
  totalCollected,
  totalPending,
  totalSignatures,
  totalAcomptes,
  callsToBeMade,
}: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">Total signé</CardTitle>
          <Award className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg md:text-2xl font-bold text-green-600">
            <span className="md:hidden">{formatCompactCurrency(totalSigned)}</span>
            <span className="hidden md:inline">{formatCurrency(totalSigned)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{totalSignatures} contrats</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">Total encaissé</CardTitle>
          <Banknote className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg md:text-2xl font-bold text-blue-600">
            <span className="md:hidden">{formatCompactCurrency(totalCollected)}</span>
            <span className="hidden md:inline">{formatCurrency(totalCollected)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{totalAcomptes} acomptes</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">Restant à encaisser</CardTitle>
          <Clock className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg md:text-2xl font-bold text-orange-600">
            <span className="md:hidden">{formatCompactCurrency(totalPending)}</span>
            <span className="hidden md:inline">{formatCurrency(totalPending)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Solde restant</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">Appels à passer</CardTitle>
          <PhoneCall className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg md:text-2xl font-bold text-purple-600">{callsToBeMade}</div>
          <p className="text-xs text-muted-foreground">Prospects qualifiés</p>
        </CardContent>
      </Card>
    </div>
  );
}
