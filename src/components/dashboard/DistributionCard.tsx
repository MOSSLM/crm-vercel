"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { COLORS } from "./constants";

interface Props {
  distributionData: { name: string; value: number }[];
  showByKeywords: boolean;
  onToggle: (checked: boolean) => void;
  isMobile: boolean;
}

export function DistributionCard({ distributionData, showByKeywords, onToggle, isMobile }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Distribution des entreprises</CardTitle>
            <CardDescription>
              Répartition par {showByKeywords ? "mot-clé" : "localisation"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toggle-dist" className="text-sm text-muted-foreground">
              {showByKeywords ? "Mots-clés" : "Localisations"}
            </Label>
            <Switch id="toggle-dist" checked={showByKeywords} onCheckedChange={onToggle} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={
                  !isMobile
                    ? ({ name, percent }) => {
                        const p = percent ?? 0;
                        return `${name} (${Math.round(p * 100)}%)`;
                      }
                    : false
                }
                outerRadius={isMobile ? 60 : 80}
                fill="#8884d8"
                dataKey="value"
              >
                {distributionData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
