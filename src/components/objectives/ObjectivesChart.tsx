"use client";

import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { KPIActual, ChartKPI, KPI_DEFINITIONS } from './types';

interface ObjectivesChartProps {
  data: KPIActual[];
  title?: string;
}

export const ObjectivesChart: React.FC<ObjectivesChartProps> = ({ 
  data, 
  title = "Évolution des KPI dans le temps" 
}) => {
  const [enabledKPIs, setEnabledKPIs] = useState<ChartKPI[]>(KPI_DEFINITIONS);

  const toggleKPI = (key: ChartKPI['key']) => {
    setEnabledKPIs(prev => 
      prev.map(kpi => 
        kpi.key === key ? { ...kpi, enabled: !kpi.enabled } : kpi
      )
    );
  };

  const enabledKPIKeys = enabledKPIs.filter(kpi => kpi.enabled);

  const chartData = data.map(item => ({
    period: item.period_label,
    ...item
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p>{label}</p>
          {payload.map((entry: any) => {
            const kpi = enabledKPIs.find(k => k.key === entry.dataKey);
            return (
              <p key={entry.dataKey} style={{ color: entry.color }}>
                {kpi?.label}: {entry.value}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Contrôles des KPI */}
        <div className="space-y-3">
          <Label>KPI à afficher :</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {enabledKPIs.map(kpi => (
              <div key={kpi.key} className="flex items-center space-x-2">
                <Checkbox
                  id={kpi.key}
                  checked={kpi.enabled}
                  onCheckedChange={() => toggleKPI(kpi.key)}
                />
                <Label 
                  htmlFor={kpi.key} 
                  className="text-sm cursor-pointer flex items-center gap-2"
                >
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: kpi.color }}
                  />
                  {kpi.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Graphique */}
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="period" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {enabledKPIKeys.map(kpi => (
                <Line
                  key={kpi.key}
                  type="monotone"
                  dataKey={kpi.key}
                  stroke={kpi.color}
                  strokeWidth={2}
                  dot={{ fill: kpi.color, strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: kpi.color, strokeWidth: 2 }}
                  name={kpi.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {chartData.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            Aucune donnée disponible pour le graphique
          </div>
        )}
      </CardContent>
    </Card>
  );
};