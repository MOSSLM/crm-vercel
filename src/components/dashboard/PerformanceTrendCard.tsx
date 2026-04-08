"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "./helpers";

type PerformanceMetric = "revenue" | "customers" | "appointments" | "calls";

interface TrendDataPoint {
  label: string;
  revenue: number;
  customers: number;
  appointments: number;
  calls: number;
}

interface Props {
  selectedMetric: PerformanceMetric;
  onMetricChange: (metric: PerformanceMetric) => void;
  data: TrendDataPoint[];
}

const metricConfig: Record<PerformanceMetric, { label: string; color: string; gradient: string }> = {
  revenue: { label: "Revenus (€)", color: "var(--chart-3)", gradient: "url(#gradRevenue)" },
  customers: { label: "Nouveaux clients", color: "var(--chart-1)", gradient: "url(#gradCustomers)" },
  appointments: { label: "RDV", color: "var(--chart-5)", gradient: "url(#gradAppts)" },
  calls: { label: "Appels", color: "var(--chart-8)", gradient: "url(#gradCalls)" },
};

export function PerformanceTrendCard({ selectedMetric, onMetricChange, data }: Props) {
  const config = metricConfig[selectedMetric];

  return (
    <Card className="border-0 shadow-md bg-gradient-to-br from-background to-muted/20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Évolution des performances</CardTitle>
            <CardDescription>
              Suivi visuel de vos indicateurs commerciaux sur la période sélectionnée
            </CardDescription>
          </div>
          <Select value={selectedMetric} onValueChange={(v) => onMetricChange(v as PerformanceMetric)}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenus</SelectItem>
              <SelectItem value="customers">Nouveaux clients</SelectItem>
              <SelectItem value="appointments">RDV</SelectItem>
              <SelectItem value="calls">Appels</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
              <defs>
                {Object.entries(metricConfig).map(([key, cfg]) => (
                  <linearGradient key={key} id={cfg.gradient.slice(4, -1)} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cfg.color} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" />
              <YAxis />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(value) => [
                  selectedMetric === "revenue" ? formatCurrency(Number(value)) : value,
                  config.label,
                ]}
              />
              <Area
                type="monotone"
                dataKey={selectedMetric}
                stroke={config.color}
                strokeWidth={3}
                fill={config.gradient}
                name={config.label}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
