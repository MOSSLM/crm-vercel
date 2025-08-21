import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { PeriodComparison } from './types';
import { calculateCompletionRate, getCompletionColor } from './utils';

interface ObjectivesTableProps {
  data: PeriodComparison[];
  periodType: string;
}

export const ObjectivesTable: React.FC<ObjectivesTableProps> = ({ data, periodType }) => {
  const kpiFields = [
    { key: 'leads_trouves', label: 'Leads trouvés' },
    { key: 'leads_qualifies', label: 'Leads qualifiés' },
    { key: 'appels', label: 'Appels' },
    { key: 'rdv', label: 'RDV' },
    { key: 'devis', label: 'Devis' },
    { key: 'signatures', label: 'Signatures' },
    { key: 'acomptes', label: 'Acomptes' },
    { key: 'ca', label: 'CA (€)' },
    { key: 'mrr', label: 'MRR (€)' }
  ] as const;

  const formatValue = (value: number, key: string) => {
    if (key === 'ca' || key === 'mrr') {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M€`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K€`;
      } else {
        return `${value.toLocaleString('fr-FR')}€`;
      }
    }
    return value.toLocaleString('fr-FR');
  };

  const renderKpiCell = (
    comparison: PeriodComparison, 
    field: typeof kpiFields[number]['key']
  ) => {
    const actual = comparison[field];
    const objective = comparison.objectives?.[field] || 0;
    const completionRate = calculateCompletionRate(actual, objective);

    if (objective === 0) {
      return (
        <div className="text-center">
          <div>{formatValue(actual, field)}</div>
          <div className="text-xs text-muted-foreground">Pas d'objectif</div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="text-center">
          <div className={`${getCompletionColor(completionRate)}`}>
            {formatValue(actual, field)} sur {formatValue(objective, field)}
          </div>
          <div className="text-xs text-muted-foreground">
            {completionRate.toFixed(0)}%
          </div>
        </div>
        <Progress 
          value={completionRate} 
          className="h-2"
        />
      </div>
    );
  };

  if (!data.length) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            Aucune donnée disponible pour cette période
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suivi des objectifs - {periodType}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48 sticky left-0 bg-background">Période</TableHead>
                {kpiFields.map(field => (
                  <TableHead key={field.key} className="text-center min-w-40">
                    {field.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(comparison => (
                <TableRow key={`${comparison.period_start}-${comparison.period_end}`}>
                  <TableCell className="sticky left-0 bg-background border-r">
                    <div>{comparison.period_label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(comparison.period_start).toLocaleDateString('fr-FR')} - {new Date(comparison.period_end).toLocaleDateString('fr-FR')}
                    </div>
                    {comparison.objectives && (
                      <Badge variant="outline" className="mt-1">
                        Objectifs définis
                      </Badge>
                    )}
                  </TableCell>
                  {kpiFields.map(field => (
                    <TableCell key={field.key} className="text-center">
                      {renderKpiCell(comparison, field.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};