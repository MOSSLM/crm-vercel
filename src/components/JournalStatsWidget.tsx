import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { journalApi } from '../utils/journalApi';
import { 
  Phone, 
  Calendar, 
  FileText, 
  PenTool, 
  DollarSign, 
  RotateCcw,
  Plus,
  TrendingUp,
  Clock,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

interface JournalStatsWidgetProps {
  opportunite_id?: string;
  entreprise_id?: number;
  showAddActions?: boolean;
  onStatsUpdate?: () => void;
}

interface JournalStats {
  appels: number;
  relances: number;
  rdvs: number;
  devis: number;
  signatures: number;
  acomptes: number;
  [key: string]: number;
}

interface JournalEntry {
  date: string;
  type_evenement: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
}

export const JournalStatsWidget: React.FC<JournalStatsWidgetProps> = ({
  opportunite_id,
  entreprise_id,
  showAddActions = true,
  onStatsUpdate
}) => {
  const [stats, setStats] = useState<JournalStats>({
    appels: 0,
    relances: 0,
    rdvs: 0,
    devis: 0,
    signatures: 0,
    acomptes: 0
  });
  const [history, setHistory] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedActionType, setSelectedActionType] = useState<string>('');
  const [actionDescription, setActionDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, historyData] = await Promise.all([
        journalApi.getJournalStats(opportunite_id, entreprise_id),
        journalApi.getJournalHistory(opportunite_id, entreprise_id)
      ]);
      setStats(statsData);
      setHistory(historyData.slice(0, 10)); // Dernières 10 entrées
    } catch (error) {
      console.error('Error loading journal data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opportunite_id || entreprise_id) {
      loadData();
    }
  }, [opportunite_id, entreprise_id]);

  const handleAddAction = async () => {
    if (!selectedActionType) {
      toast.error('Veuillez sélectionner un type d\'action');
      return;
    }

    try {
      setIsSubmitting(true);
      
      switch (selectedActionType) {
        case 'call':
          await journalApi.logCall(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'relance':
          await journalApi.logRelance(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'rdv':
          await journalApi.logRdv(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'devis':
          await journalApi.logDevis(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'signature':
          await journalApi.logSignature(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'acompte':
          await journalApi.logAcompte(opportunite_id, entreprise_id, actionDescription);
          break;
        case 'lead_magnet':
          await journalApi.logLeadMagnet(opportunite_id, entreprise_id, actionDescription);
          break;
        default:
          throw new Error('Type d\'action non reconnu');
      }

      toast.success('Action enregistrée avec succès');
      setShowAddDialog(false);
      setSelectedActionType('');
      setActionDescription('');
      await loadData();
      onStatsUpdate?.();
    } catch (error) {
      console.error('Error adding action:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    if (eventType === 'cold_call' || eventType === 'appel') return Phone;
    if (eventType.startsWith('relance_')) return RotateCcw;
    if (eventType.startsWith('rdv_')) return Calendar;
    if (eventType === 'devis') return FileText;
    if (eventType === 'signature') return PenTool;
    if (eventType === 'acompte') return DollarSign;
    return Activity;
  };

  const getEventLabel = (eventType: string) => {
    if (eventType === 'cold_call' || eventType === 'appel') return 'Appel';
    if (eventType.startsWith('relance_')) {
      const match = eventType.match(/relance_(\d+)/);
      return match ? `Relance ${match[1]}` : 'Relance';
    }
    if (eventType.startsWith('rdv_')) {
      const match = eventType.match(/rdv_(\d+)/);
      return match ? `RDV ${match[1]}` : 'RDV';
    }
    if (eventType === 'devis') return 'Devis';
    if (eventType === 'signature') return 'Signature';
    if (eventType === 'acompte') return 'Acompte';
    if (eventType === 'lead_magnet') return 'Lead Magnet';
    return eventType;
  };

  const getEventColor = (eventType: string) => {
    if (eventType === 'cold_call' || eventType === 'appel') return 'text-blue-600';
    if (eventType.startsWith('relance_')) return 'text-orange-600';
    if (eventType.startsWith('rdv_')) return 'text-purple-600';
    if (eventType === 'devis') return 'text-yellow-600';
    if (eventType === 'signature') return 'text-green-600';
    if (eventType === 'acompte') return 'text-emerald-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Activité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Activité
        </CardTitle>
        {showAddActions && (
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enregistrer une action</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Type d'action</label>
                  <Select value={selectedActionType} onValueChange={setSelectedActionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez une action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Appel</SelectItem>
                      <SelectItem value="relance">Relance</SelectItem>
                      <SelectItem value="rdv">RDV</SelectItem>
                      <SelectItem value="devis">Devis</SelectItem>
                      <SelectItem value="signature">Signature</SelectItem>
                      <SelectItem value="acompte">Acompte</SelectItem>
                      <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Description (optionnel)</label>
                  <Textarea
                    value={actionDescription}
                    onChange={(e) => setActionDescription(e.target.value)}
                    placeholder="Détails de l'action..."
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleAddAction} disabled={isSubmitting}>
                    {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistiques rapides */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600">{stats.appels}</div>
            <div className="text-muted-foreground">Appels</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-orange-600">{stats.relances}</div>
            <div className="text-muted-foreground">Relances</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-purple-600">{stats.rdvs}</div>
            <div className="text-muted-foreground">RDV</div>
          </div>
        </div>

        <Separator />

        {/* Statistiques détaillées */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span>Devis:</span>
            <Badge variant="outline" className="text-yellow-600">{stats.devis}</Badge>
          </div>
          <div className="flex justify-between">
            <span>Signatures:</span>
            <Badge variant="outline" className="text-green-600">{stats.signatures}</Badge>
          </div>
          <div className="flex justify-between">
            <span>Acomptes:</span>
            <Badge variant="outline" className="text-emerald-600">{stats.acomptes}</Badge>
          </div>
        </div>

        {/* Historique récent */}
        {history.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Activité récente</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {history.map((entry, index) => {
                  const Icon = getEventIcon(entry.type_evenement);
                  const color = getEventColor(entry.type_evenement);
                  return (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <Icon className={`h-3 w-3 ${color}`} />
                      <span className="font-medium">
                        {getEventLabel(entry.type_evenement)}
                      </span>
                      <span className="text-muted-foreground flex-1">
                        {entry.description && ` - ${entry.description}`}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit'
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};