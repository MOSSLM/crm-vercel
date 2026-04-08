"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Users, DollarSign, Phone } from "lucide-react";
import { formatCurrency, formatCompactCurrency } from "./helpers";

interface Props {
  totalCompanies: number;
  totalQualifiedCompanies: number;
  contactsCount: number;
  opportunitiesCount: number;
  totalPipelineValue: number;
  averageDealValue: number;
  totalAppels: number;
}

export function MainStatsCards({
  totalCompanies,
  totalQualifiedCompanies,
  contactsCount,
  opportunitiesCount,
  totalPipelineValue,
  averageDealValue,
  totalAppels,
}: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">
            <span className="md:hidden flex items-center gap-1">
              <Building className="h-3 w-3" />
              Entreprises
            </span>
            <span className="hidden md:inline">Entreprises totales</span>
          </CardTitle>
          <Building className="hidden md:block h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pb-2 md:pb-6">
          <div className="text-lg md:text-2xl font-bold">{totalCompanies}</div>
          <p className="text-xs text-muted-foreground">
            {totalQualifiedCompanies} qual. ({totalCompanies > 0 ? Math.round((totalQualifiedCompanies / totalCompanies) * 100) : 0}%)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">
            <span className="md:hidden flex items-center gap-1">
              <Users className="h-3 w-3" />
              Contacts
            </span>
            <span className="hidden md:inline">Contacts actifs</span>
          </CardTitle>
          <Users className="hidden md:block h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pb-2 md:pb-6">
          <div className="text-lg md:text-2xl font-bold">{contactsCount}</div>
          <p className="text-xs text-muted-foreground">{opportunitiesCount} opps</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">
            <span className="md:hidden flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Pipeline
            </span>
            <span className="hidden md:inline">Pipeline</span>
          </CardTitle>
          <DollarSign className="hidden md:block h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pb-2 md:pb-6">
          <div className="text-sm md:text-2xl font-bold">
            <span className="md:hidden">{formatCompactCurrency(totalPipelineValue)}</span>
            <span className="hidden md:inline">{formatCurrency(totalPipelineValue)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="md:hidden">{formatCompactCurrency(averageDealValue)}</span>
            <span className="hidden md:inline">Moy: {formatCurrency(averageDealValue)}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
          <CardTitle className="text-xs md:text-sm font-medium">
            <span className="md:hidden flex items-center gap-1">
              <Phone className="h-3 w-3" />
              Appels
            </span>
            <span className="hidden md:inline">Appels effectués</span>
          </CardTitle>
          <Phone className="hidden md:block h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pb-2 md:pb-6">
          <div className="text-lg md:text-2xl font-bold">{totalAppels}</div>
          <p className="text-xs text-muted-foreground">
            {contactsCount > 0 ? ((totalAppels / contactsCount) * 100).toFixed(1) : 0}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
