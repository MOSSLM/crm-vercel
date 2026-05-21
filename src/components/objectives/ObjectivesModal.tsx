"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'sonner';
import { PeriodType, KPIObjective, Period } from './types';
import { generatePeriods } from './utils';

interface ObjectivesModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (objectives: KPIObjective[]) => void;
  existingObjectives?: KPIObjective[];
  initialPeriodType: PeriodType;
}

export const ObjectivesModal: React.FC<ObjectivesModalProps> = ({
  open,
  onClose,
  onSave,
  existingObjectives = [],
  initialPeriodType
}) => {
  const [selectedPeriodType, setSelectedPeriodType] = useState<PeriodType>(initialPeriodType);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [objectives, setObjectives] = useState<Record<string, KPIObjective>>({});

  useEffect(() => {
    if (open) {
      setSelectedPeriodType(initialPeriodType);
    }
  }, [open, initialPeriodType]);

  useEffect(() => {
    if (open) {
      const generatedPeriods = generatePeriods(selectedPeriodType);
      setPeriods(generatedPeriods);
      
      // Initialiser les objectifs existants
      const objectivesMap: Record<string, KPIObjective> = {};
      generatedPeriods.forEach(period => {
        const existing = existingObjectives.find(obj => 
          obj.period_start === period.startDate.toISOString().split('T')[0] && 
          obj.period_unit === selectedPeriodType
        );
        objectivesMap[period.id] = existing || {
          period_unit: selectedPeriodType,
          period_start: period.startDate.toISOString().split('T')[0],
          period_end: period.endDate.toISOString().split('T')[0],
          leads_trouves: 0,
          leads_qualifies: 0,
          appels: 0,
          rdv: 0,
          devis: 0,
          relances: 0,
          signatures: 0,
          acomptes: 0,
          leadmagnets: 0,
          relances_total: 0,
          ca: 0,
          mrr: 0,
          label: period.label
        };
      });
      setObjectives(objectivesMap);
    }
  }, [open, selectedPeriodType, existingObjectives]);

  const handlePeriodTypeChange = (type: PeriodType) => {
    setSelectedPeriodType(type);
  };

  const updateObjective = (periodId: string, field: keyof Omit<KPIObjective, 'id' | 'period_unit' | 'period_start' | 'period_end' | 'label' | 'created_at'>, value: number) => {
    setObjectives(prev => ({
      ...prev,
      [periodId]: {
        ...prev[periodId],
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    const objectivesList = Object.values(objectives).filter(obj => {
      // Vérifier si au moins une valeur KPI est définie et > 0
      const kpiFields = ['leads_trouves', 'leads_qualifies', 'appels', 'rdv', 'devis', 'relances', 'signatures', 'acomptes', 'leadmagnets', 'relances_total', 'ca', 'mrr', 'entreprises_enrichies', 'sites_crees', 'audits_crees'] as const;
      return kpiFields.some(
        field => ((obj as unknown as Record<string, number | undefined>)[field] ?? 0) > 0
      );
    });
    
    onSave(objectivesList);
    toast.success(`${objectivesList.length} objectifs sauvegardés`);
    onClose();
  };

  const kpiFields = [
    { key: 'leads_trouves', label: 'Leads trouvés' },
    { key: 'leads_qualifies', label: 'Leads qualifiés' },
    { key: 'appels', label: 'Appels' },
    { key: 'rdv', label: 'RDV' },
    { key: 'devis', label: 'Devis' },
    { key: 'relances', label: 'Relances' },
    { key: 'signatures', label: 'Signatures' },
    { key: 'acomptes', label: 'Acomptes' },
    { key: 'leadmagnets', label: 'Lead magnets' },
    { key: 'entreprises_enrichies', label: 'Entreprises à enrichir' },
    { key: 'sites_crees', label: 'Sites à créer' },
    { key: 'audits_crees', label: 'Audits à créer' },
    { key: 'ca', label: 'CA (€)' },
    { key: 'mrr', label: 'MRR (€)' }
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Définir les objectifs</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Label>Type de période :</Label>
              <Select value={selectedPeriodType} onValueChange={(value: PeriodType) => handlePeriodTypeChange(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Semaines</SelectItem>
                  <SelectItem value="month">Mois</SelectItem>
                  <SelectItem value="quarter">Trimestres</SelectItem>
                  <SelectItem value="year">Années</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48 sticky left-0 bg-background">Période</TableHead>
                    {kpiFields.map(field => (
                      <TableHead key={field.key} className="text-center min-w-32">
                        {field.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map(period => (
                    <TableRow key={period.id}>
                      <TableCell className="sticky left-0 bg-background border-r">
                        <div>{period.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {period.startDate.toLocaleDateString('fr-FR')} - {period.endDate.toLocaleDateString('fr-FR')}
                        </div>
                      </TableCell>
                      {kpiFields.map(field => (
                        <TableCell key={field.key} className="text-center">
                          <Input
                            type="number"
                            min="0"
                            step={field.key === 'ca' || field.key === 'mrr' ? '100' : '1'}
                            value={objectives[period.id]?.[field.key] || ''}
                            onChange={(e) => updateObjective(
                              period.id, 
                              field.key, 
                              parseInt(e.target.value) || 0
                            )}
                            className="w-20 text-center mx-auto"
                            placeholder="0"
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave}>
            Sauvegarder les objectifs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};