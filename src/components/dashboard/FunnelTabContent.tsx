"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Zap } from "lucide-react";
import { FunnelStepData } from "./types";

interface FunnelBarItem {
  name: string;
  value: number;
  conversion: number;
}

interface Props {
  funnelSteps: FunnelStepData[];
  funnelBarData: FunnelBarItem[];
  isMobile: boolean;
}

export function FunnelTabContent({ funnelSteps, funnelBarData, isMobile }: Props) {
  return (
    <div className="space-y-6">
      {/* Bar chart funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Entonnoir de conversion
          </CardTitle>
          <CardDescription>
            Visualisation en barres du parcours client de la découverte au paiement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={funnelBarData}
                layout="vertical"
                margin={{ top: 12, right: 24, left: 80, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <RechartsTooltip
                  formatter={(value, name) => {
                    if (name === "conversion") return [`${Number(value).toFixed(1)}%`, "Conversion"];
                    return [value, "Volume"];
                  }}
                />
                <Bar dataKey="value" fill="var(--chart-5)" radius={[0, 8, 8, 0]} name="Volume" />
                <Bar
                  dataKey="conversion"
                  fill="var(--chart-3)"
                  radius={[0, 8, 8, 0]}
                  name="Conversion (%)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Analyse des conversions */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse des conversions</CardTitle>
          <CardDescription>Taux de passage entre chaque étape</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funnelSteps.slice(1).map((step, index) => {
              const prevStep = funnelSteps[index];
              const conversionRate =
                prevStep.value > 0 ? (step.value / prevStep.value) * 100 : 0;

              return (
                <div key={step.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <step.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {prevStep.name} → {step.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {step.value} sur {prevStep.value}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <Progress value={conversionRate} className="w-20 h-2" />
                    <div className="text-lg font-bold w-14 text-right">
                      {conversionRate.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
