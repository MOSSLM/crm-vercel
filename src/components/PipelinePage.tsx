"use client"

import React, { useState, useRef } from 'react';
import { useAppData, Opportunity, PipelineStage } from './AppDataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { 
  DollarSign, 
  Calendar, 
  ArrowUp, 
  ArrowDown, 
  Minus,
  Target,
  Clock,
  AlertCircle,
  Edit,
  CheckCircle,
  MessageSquare,
  Grip,
  Settings,
  EyeOff,
  Eye,
  Maximize2,
  Minimize2,
  Phone,
  Mail,
  Linkedin,
  Globe
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'sonner';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { journalApi } from '../utils/journalApi';

const ItemType = 'OPPORTUNITY';

interface DragItem {
  id: string;
  originalStage: number;
}

// Configuration des couleurs par type d'étape
const getStageColor = (stageName: string) => {
  const name = stageName.toLowerCase();
  
  if (name.includes('qualifié')) {
    return '#3b82f6'; // Bleu
  }
  if (name.includes('cold call') || name.includes('relance')) {
    return '#eab308'; // Jaune
  }
  if (name.includes('rdv') || name.includes('rdv de vente') || name.includes('rendez-vous')) {
    return '#f97316'; // Orange
  }
  if (name.includes('devis')) {
    return '#22c55e'; // Vert clair
  }
  if (name.includes('signature') || name.includes('acompte')) {
    return '#16a34a'; // Vert foncé
  }
  
  return '#9ca3af'; // Gris par défaut (mettre de côté)
};

interface StageConfiguration {
  id: number;
  isVisible: boolean;
  isReduced: boolean;
}

interface OpportunityCardProps {
  opportunity: Opportunity;
  stageColor?: string;
  onView: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
  isReduced?: boolean;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ 
  opportunity, 
  stageColor, 
  onView, 
  onEdit,
  isReduced = false
}) => {
  const { companies } = useAppData();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: { id: opportunity.id, originalStage: opportunity.stage_id } as DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(ref);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Date inconnue';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'haute': return <ArrowUp className="h-3 w-3 text-red-500" />;
      case 'moyenne': return <Minus className="h-3 w-3 text-yellow-500" />;
      case 'basse': return <ArrowDown className="h-3 w-3 text-green-500" />;
      default: return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  // Récupérer l'entreprise associée pour obtenir l'URL si nécessaire
  const associatedCompany = companies.find(c => c.id === opportunity.entreprise_id);
  
  // Prioriser le nom de l'entreprise, puis l'URL tronquée
  const companyDisplayName = getCompanyDisplayName(
    opportunity.companyName || associatedCompany?.name, 
    opportunity.companyUrl || associatedCompany?.canonical_url
  );

  // Nom de l'opportunité (nouveau système avec champ name, ou fallback sur tags)
  const opportunityName = opportunity.name || opportunity.tags || 'Opportunité sans nom';

  // Informations de contact disponibles
  const hasPhone = !!(opportunity.telephone || associatedCompany?.telephone);
  const hasEmail = !!(opportunity.email);
  const hasLinkedin = !!(opportunity.linkedin_url || associatedCompany?.linkedin_url);
  const hasWebsite = !!(opportunity.companyUrl || associatedCompany?.canonical_url);

  if (isReduced) {
    return (
      <div
        ref={ref}
        className={`mb-2 pipeline-card border rounded-lg transition-all duration-200 border-l-4 ${
          isDragging 
            ? 'opacity-50 transform rotate-2 shadow-lg' 
            : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ 
          opacity: isDragging ? 0.5 : 1,
          borderLeftColor: stageColor 
        }}
        onClick={() => onView(opportunity)}
      >
        <div className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Grip className="h-3 w-3 text-muted-foreground cursor-grab flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {/* Nom de l'opportunité en premier */}
                <div className="text-xs font-medium truncate">{opportunityName}</div>
                {/* Nom entreprise en dessous */}
                <div className="text-xs text-muted-foreground truncate">{companyDisplayName}</div>
                {/* Type et icônes de contact */}
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                    {opportunity.type === 'mrr' ? 'MRR' : 'Ponctuel'}
                  </Badge>
                  {hasPhone && <Phone className="h-2 w-2 text-green-600" />}
                  {hasEmail && <Mail className="h-2 w-2 text-blue-600" />}
                  {hasLinkedin && <Linkedin className="h-2 w-2 text-blue-700" />}
                </div>
              </div>
            </div>
            {(opportunity.value || opportunity.montant || opportunity.mrr) && (
              <span className="text-xs text-green-600 font-medium flex-shrink-0 ml-2">
                {opportunity.type === 'mrr' && opportunity.mrr ? 
                  `${opportunity.mrr.toLocaleString()}€/mois` :
                  `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`
                }
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`mb-3 pipeline-card border rounded-lg transition-all duration-200 border-l-4 ${
        isDragging 
          ? 'opacity-50 transform rotate-2 shadow-lg' 
          : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{ 
        opacity: isDragging ? 0.5 : 1,
        borderLeftColor: stageColor 
      }}
      onClick={() => onView(opportunity)}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Grip className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {/* Nom de l'opportunité en premier */}
                <h4 className="text-sm font-medium leading-tight truncate">{opportunityName}</h4>
                {/* Nom de l'entreprise en dessous */}
                <p className="text-xs text-muted-foreground truncate mt-0.5">{companyDisplayName}</p>
              </div>
            </div>
            
            {/* Type, icônes de contact et valeur */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                {/* Badge de type */}
                <Badge variant="secondary" className="text-xs">
                  {opportunity.type === 'mrr' ? 'MRR' : 'Ponctuel'}
                </Badge>
                
                {/* Icônes de contact */}
                {hasPhone && <Phone className="h-3 w-3 text-green-600" />}
                {hasEmail && <Mail className="h-3 w-3 text-blue-600" />}
                {hasLinkedin && <Linkedin className="h-3 w-3 text-blue-700" />}
                {hasWebsite && <Globe className="h-3 w-3 text-gray-600" />}
              </div>
              
              {(opportunity.value || opportunity.montant || opportunity.mrr) && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600 font-medium">
                    {opportunity.type === 'mrr' && opportunity.mrr ? 
                      `${opportunity.mrr.toLocaleString()}€/mois` :
                      `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            {getPriorityIcon(opportunity.priorite)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Maj le {formatDate(opportunity.updated_at)}
            </div>
          </div>

          {opportunity.opportunityNotes && opportunity.opportunityNotes.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <MessageSquare className="h-3 w-3" />
              {opportunity.opportunityNotes.length} note{opportunity.opportunityNotes.length > 1 ? 's' : ''}
            </div>
          )}

          {opportunity.date_prochain_suivi && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <AlertCircle className="h-3 w-3" />
              Suivi : {formatDate(opportunity.date_prochain_suivi)}
            </div>
          )}

          <div className="flex gap-1 pt-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onView(opportunity);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-xs px-2 py-1 h-6"
            >
              Voir
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(opportunity);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-xs px-2 py-1 h-6"
            >
              <Edit className="h-3 w-3 mr-1" />
              Modifier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PipelineColumnProps {
  stage: PipelineStage;
  opportunities: Opportunity[];
  onDrop: (opportunityId: string, stageId: number) => void;
  onView: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
  isReduced?: boolean;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({ 
  stage, 
  opportunities, 
  onDrop, 
  onView, 
  onEdit,
  isReduced = false
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const stageValue = opportunities.reduce((sum, opp) => {
    if (opp.type === 'mrr' && opp.mrr) {
      // Pour MRR, utiliser la valeur mensuelle multipliée par la durée ou 12 mois par défaut
      const months = opp.recurrence_months || 12;
      return sum + (opp.mrr * months);
    }
    return sum + (opp.value || opp.montant || 0);
  }, 0);
  const stageColor = getStageColor(stage.nom);

  const [{ isOver }, drop] = useDrop({
    accept: ItemType,
    drop: (item: DragItem) => {
      if (item.originalStage !== stage.id) {
        onDrop(item.id, stage.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  drop(ref);

  return (
    <div 
      ref={ref}
      className={`rounded-lg p-4 transition-all duration-200 ${
        isOver ? 'pipeline-drop-zone-active border-2 border-dashed' : 'pipeline-drop-zone'
      } ${isReduced ? 'min-h-[400px]' : 'min-h-[600px]'}`}
    >
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stageColor }}
          ></div>
          <h3 className={`font-medium ${isReduced ? 'text-sm' : ''}`}>{stage.nom}</h3>
          <Badge variant="secondary" className="ml-auto">
            {opportunities.length}
          </Badge>
        </div>
        {stageValue > 0 && (
          <div className={`text-muted-foreground ${isReduced ? 'text-xs' : 'text-sm'}`}>
            {stageValue.toLocaleString()}€
          </div>
        )}
      </div>

      <div className="space-y-3">
        {opportunities.map((opportunity) => (
          <OpportunityCard 
            key={opportunity.id} 
            opportunity={opportunity} 
            stageColor={stageColor}
            onView={onView}
            onEdit={onEdit}
            isReduced={isReduced}
          />
        ))}
        
        {opportunities.length === 0 && (
          <div className={`text-center text-muted-foreground transition-all ${
            isOver ? 'text-blue-600' : ''
          } ${isReduced ? 'py-4' : 'py-8'}`}>
            <Target className={`mx-auto mb-2 ${
              isOver ? 'text-blue-600' : 'opacity-50'
            } ${isReduced ? 'h-6 w-6' : 'h-8 w-8'}`} />
            <p className={isReduced ? 'text-xs' : 'text-sm'}>
              {isOver ? 'Déposez ici' : 'Glissez une opportunité ici'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const PipelinePage: React.FC = () => {
  const { 
    opportunities, 
    pipelineStages, 
    moveOpportunityToStage, 
    getOpportunitiesByStage,
    updateOpportunity,
    companies
  } = useAppData();
  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Configuration des étapes (visibilité et taille)
  const [stageConfigs, setStageConfigs] = useState<StageConfiguration[]>(
    pipelineStages.map(stage => ({
      id: stage.id,
      isVisible: true,
      isReduced: false
    }))
  );

  // Synchroniser la configuration avec les étapes
  React.useEffect(() => {
    const newConfigs = pipelineStages.map(stage => {
      const existingConfig = stageConfigs.find(config => config.id === stage.id);
      return existingConfig || {
        id: stage.id,
        isVisible: true,
        isReduced: false
      };
    });
    setStageConfigs(newConfigs);
  }, [pipelineStages]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Date inconnue';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'haute': return <ArrowUp className="h-3 w-3 text-red-500" />;
      case 'moyenne': return <Minus className="h-3 w-3 text-yellow-500" />;
      case 'basse': return <ArrowDown className="h-3 w-3 text-green-500" />;
      default: return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  const handleDrop = async (opportunityId: string, newStageId: number) => {
    try {
      await moveOpportunityToStage(opportunityId, newStageId);
      
      // Récupérer les informations pour la notification et la journalisation
      const opportunity = opportunities.find(opp => opp.id === opportunityId);
      const associatedCompany = companies.find(c => c.id === opportunity?.entreprise_id);
      const displayName = getCompanyDisplayName(
        opportunity?.companyName || associatedCompany?.name, 
        associatedCompany?.canonical_url
      );
      const stageName = pipelineStages.find(s => s.id === newStageId)?.nom;
      
      // Enregistrer le changement d'étape dans le journal
      if (opportunity && stageName) {
        try {
          console.log(`[Journal] Enregistrement changement d'étape: "${stageName}" pour opportunité ${opportunity.id}`);
          await journalApi.logPipelineStageChange(
            stageName,
            opportunity.id,
            opportunity.entreprise_id,
            `Déplacement vers "${stageName}" depuis le pipeline`
          );
          console.log(`[Journal] Changement d'étape enregistré avec succès`);
        } catch (journalError) {
          console.error('Erreur lors de l\'enregistrement dans le journal:', journalError);
          // Ne pas interrompre le processus principal si la journalisation échoue
        }
      }
      
      toast.success(`${displayName} déplacé vers "${stageName}"`);
    } catch (error) {
      console.error('Erreur lors du déplacement:', error);
      toast.error('Erreur lors du déplacement de l\'opportunité');
    }
  };

  const handleEditOpportunity = (opportunity: Opportunity) => {
    setEditingOpportunity({ ...opportunity });
    setSelectedOpportunity(null);
  };

  const handleSaveOpportunity = async () => {
    if (editingOpportunity) {
      try {
        await updateOpportunity(editingOpportunity.id, editingOpportunity);
        
        // Récupérer le nom d'affichage pour la notification
        const associatedCompany = companies.find(c => c.id === editingOpportunity.entreprise_id);
        const displayName = getCompanyDisplayName(
          editingOpportunity.companyName || associatedCompany?.name, 
          associatedCompany?.canonical_url
        );
        
        toast.success(`Opportunité ${displayName} mise à jour`);
        setEditingOpportunity(null);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        toast.error('Erreur lors de la sauvegarde');
      }
    }
  };

  const getDisplayNameForOpportunity = (opportunity: Opportunity) => {
    const associatedCompany = companies.find(c => c.id === opportunity.entreprise_id);
    // Prioriser le nom de l'entreprise (soit dans opportunity.companyName soit dans company.name), puis l'URL tronquée
    return getCompanyDisplayName(
      opportunity.companyName || associatedCompany?.name, 
      associatedCompany?.canonical_url
    );
  };

  const toggleStageVisibility = (stageId: number) => {
    setStageConfigs(configs => 
      configs.map(config => 
        config.id === stageId 
          ? { ...config, isVisible: !config.isVisible }
          : config
      )
    );
  };

  const toggleStageSize = (stageId: number) => {
    setStageConfigs(configs => 
      configs.map(config => 
        config.id === stageId 
          ? { ...config, isReduced: !config.isReduced }
          : config
      )
    );
  };

  const visibleStages = pipelineStages.filter(stage => {
    const config = stageConfigs.find(c => c.id === stage.id);
    return config?.isVisible !== false;
  });

  const totalValue = opportunities.reduce((sum, opp) => {
    if (opp.type === 'mrr' && opp.mrr) {
      // Pour MRR, utiliser la valeur mensuelle multipliée par la durée ou 12 mois par défaut
      const months = opp.recurrence_months || 12;
      return sum + (opp.mrr * months);
    }
    return sum + (opp.value || opp.montant || 0);
  }, 0);
  const averageValue = opportunities.length > 0 ? totalValue / opportunities.length : 0;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1>Pipeline des Ventes</h1>
            <p className="text-muted-foreground">
              Suivez vos opportunités à travers les différentes étapes du processus de vente
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Configuration
          </Button>
        </div>

        {/* Configuration des étapes */}
        {showSettings && (
          <Card className="p-4">
            <h3 className="font-medium mb-4">Configuration des étapes</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pipelineStages.map((stage) => {
                const config = stageConfigs.find(c => c.id === stage.id);
                const stageColor = getStageColor(stage.nom);
                
                return (
                  <div key={stage.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stageColor }}
                      ></div>
                      <span className="text-sm font-medium">{stage.nom}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <Switch
                          checked={config?.isVisible !== false}
                          onCheckedChange={() => toggleStageVisibility(stage.id)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Minimize2 className="h-4 w-4 text-muted-foreground" />
                        <Switch
                          checked={config?.isReduced || false}
                          onCheckedChange={() => toggleStageSize(stage.id)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Opportunités totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{opportunities.length}</div>
              <p className="text-xs text-muted-foreground">Dans le pipeline</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valeur totale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {totalValue.toLocaleString()}€
              </div>
              <p className="text-xs text-muted-foreground">Pipeline complet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valeur moyenne</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(averageValue).toLocaleString()}€
              </div>
              <p className="text-xs text-muted-foreground">Par opportunité</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Étapes actives</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {visibleStages.filter(stage => 
                  getOpportunitiesByStage(stage.id).length > 0
                ).length}
              </div>
              <p className="text-xs text-muted-foreground">Sur {visibleStages.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="info-tooltip border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Grip className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-600">
              <strong>Glisser-déposer :</strong> Cliquez et maintenez sur l'icône de poignée ou sur la carte, puis glissez vers une nouvelle colonne
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-4 pb-4" style={{ minWidth: `${visibleStages.length * 200}px` }}>
            {visibleStages
              .sort((a, b) => a.ordre - b.ordre)
              .map((stage) => {
                const config = stageConfigs.find(c => c.id === stage.id);
                const isReduced = config?.isReduced || false;
                
                return (
                  <div key={stage.id} className={`flex-shrink-0 ${isReduced ? 'w-48' : 'w-72'}`}>
                    <PipelineColumn 
                      stage={stage} 
                      opportunities={getOpportunitiesByStage(stage.id)}
                      onDrop={handleDrop}
                      onView={setSelectedOpportunity}
                      onEdit={handleEditOpportunity}
                      isReduced={isReduced}
                    />
                  </div>
                );
              })}
          </div>
        </div>

        {/* Modal de détail d'opportunité avec changement d'étape */}
        <Dialog open={!!selectedOpportunity || !!editingOpportunity} onOpenChange={() => {
          setSelectedOpportunity(null);
          setEditingOpportunity(null);
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingOpportunity ? 
                  'Modifier l\'opportunité' : 
                  'Opportunité : ' + (selectedOpportunity ? getDisplayNameForOpportunity(selectedOpportunity) : '')
                }
              </DialogTitle>
              <DialogDescription>
                {editingOpportunity ? 'Modification rapide' : 'Gestion rapide de l\'opportunité'}
              </DialogDescription>
            </DialogHeader>

            {selectedOpportunity && !editingOpportunity && (
              <div className="space-y-4">
                {/* Informations de l'entreprise et de l'opportunité */}
                <div className="border-b pb-4">
                  <h3 className="font-medium mb-3">Informations de l'opportunité</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Entreprise</label>
                      <div className="mt-1">
                        {getDisplayNameForOpportunity(selectedOpportunity)}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Nom de l'opportunité</label>
                      <div className="mt-1">
                        {selectedOpportunity.name || selectedOpportunity.tags || 'Opportunité sans nom'}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Type</label>
                      <div className="mt-1">
                        <Badge variant="outline">
                          {selectedOpportunity.type === 'mrr' ? 'Récurrent (MRR)' : 'Ponctuel'}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Valeur</label>
                      <div className="mt-1">
                        {selectedOpportunity.type === 'mrr' && selectedOpportunity.mrr ? (
                          <div>
                            <div className="font-medium">{selectedOpportunity.mrr.toLocaleString()}€/mois</div>
                            {selectedOpportunity.recurrence_months && (
                              <div className="text-xs text-muted-foreground">
                                Sur {selectedOpportunity.recurrence_months} mois
                              </div>
                            )}
                          </div>
                        ) : (
                          (selectedOpportunity.value || selectedOpportunity.montant) ? 
                            `${(selectedOpportunity.value || selectedOpportunity.montant || 0).toLocaleString()}€` : 
                            'Non définie'
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Informations de contact */}
                <div className="border-b pb-4">
                  <h3 className="font-medium mb-3">Informations de contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {(selectedOpportunity.telephone || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.telephone) && (
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Phone className="h-4 w-4 text-green-600" />
                          Téléphone
                        </label>
                        <div className="mt-1">
                          {selectedOpportunity.telephone || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.telephone}
                        </div>
                      </div>
                    )}

                    {selectedOpportunity.email && (
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-600" />
                          Email
                        </label>
                        <div className="mt-1">
                          {selectedOpportunity.email}
                        </div>
                      </div>
                    )}

                    {(selectedOpportunity.linkedin_url || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.linkedin_url) && (
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Linkedin className="h-4 w-4 text-blue-700" />
                          LinkedIn
                        </label>
                        <div className="mt-1">
                          <a 
                            href={selectedOpportunity.linkedin_url || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.linkedin_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Voir le profil
                          </a>
                        </div>
                      </div>
                    )}

                    {(selectedOpportunity.companyUrl || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.canonical_url) && (
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Globe className="h-4 w-4 text-gray-600" />
                          Site web
                        </label>
                        <div className="mt-1">
                          <a 
                            href={selectedOpportunity.companyUrl || companies.find(c => c.id === selectedOpportunity.entreprise_id)?.canonical_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Visiter le site
                          </a>
                        </div>
                      </div>
                    )}

                    {selectedOpportunity.contact_name && (
                      <div>
                        <label className="text-sm font-medium">Nom du contact</label>
                        <div className="mt-1">
                          {selectedOpportunity.contact_name}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Détails de l'opportunité */}
                <div>
                  <h3 className="font-medium mb-3">Détails</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Étape actuelle</label>
                      <Select 
                        value={selectedOpportunity.stage_id?.toString()}
                        onValueChange={(newStage) => {
                          handleDrop(selectedOpportunity.id, parseInt(newStage));
                          setSelectedOpportunity({
                            ...selectedOpportunity,
                            stage_id: parseInt(newStage)
                          });
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {pipelineStages
                            .sort((a, b) => a.ordre - b.ordre)
                            .map((stage) => (
                              <SelectItem key={stage.id} value={stage.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: getStageColor(stage.nom) }}
                                  ></div>
                                  {stage.nom}
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Priorité</label>
                      <div className="flex items-center gap-2 mt-1">
                        {getPriorityIcon(selectedOpportunity.priorite)}
                        <span className="capitalize">{selectedOpportunity.priorite || 'Non définie'}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Créée le</label>
                      <div className="mt-1">
                        {formatDate(selectedOpportunity.created_at)}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Dernière mise à jour</label>
                      <div className="mt-1">
                        {formatDate(selectedOpportunity.updated_at)}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedOpportunity.tags ? 
                      selectedOpportunity.tags.split(',').map(t => t.trim()).filter(t => t).map((tag, index) => (
                        <Badge key={index} variant="outline">{tag}</Badge>
                      )) : 
                      <span className="text-sm text-muted-foreground">Aucun tag</span>
                    }
                  </div>
                </div>

                {(selectedOpportunity.notes || selectedOpportunity.note_base) && (
                  <div>
                    <label className="text-sm font-medium">Notes</label>
                    <p className="mt-1 text-sm">{selectedOpportunity.notes || selectedOpportunity.note_base}</p>
                  </div>
                )}

                {selectedOpportunity.date_prochain_suivi && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-800">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">Prochain suivi prévu</span>
                    </div>
                    <p className="text-orange-700 mt-1">
                      {formatDate(selectedOpportunity.date_prochain_suivi)}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => handleEditOpportunity(selectedOpportunity)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button 
                    onClick={() => setSelectedOpportunity(null)}
                    variant="outline"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            )}

            {editingOpportunity && (
              <div className="space-y-4">
                {/* Informations de base */}
                <div>
                  <h3 className="font-medium mb-3">Informations de base</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Nom de l'opportunité</Label>
                      <Input
                        id="name"
                        value={editingOpportunity.name || ''}
                        onChange={(e) => setEditingOpportunity({
                          ...editingOpportunity,
                          name: e.target.value
                        })}
                        placeholder="Ex: Création de site web"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="priority">Priorité</Label>
                      <Select 
                        value={editingOpportunity.priorite} 
                        onValueChange={(value: any) => setEditingOpportunity({
                          ...editingOpportunity,
                          priorite: value
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basse">Basse</SelectItem>
                          <SelectItem value="moyenne">Moyenne</SelectItem>
                          <SelectItem value="haute">Haute</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Type et valeur */}
                <div>
                  <h3 className="font-medium mb-3">Type et valeur</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="type">Type d'opportunité</Label>
                      <Select 
                        value={editingOpportunity.type || 'one_shot'} 
                        onValueChange={(value: any) => setEditingOpportunity({
                          ...editingOpportunity,
                          type: value
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_shot">Ponctuel</SelectItem>
                          <SelectItem value="mrr">Récurrent (MRR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editingOpportunity.type === 'mrr' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="mrr">MRR mensuel (€)</Label>
                          <Input
                            id="mrr"
                            type="number"
                            value={editingOpportunity.mrr || ''}
                            onChange={(e) => setEditingOpportunity({
                              ...editingOpportunity,
                              mrr: e.target.value ? parseFloat(e.target.value) : undefined
                            })}
                            placeholder="500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="recurrence_months">Durée (mois)</Label>
                          <Input
                            id="recurrence_months"
                            type="number"
                            value={editingOpportunity.recurrence_months || ''}
                            onChange={(e) => setEditingOpportunity({
                              ...editingOpportunity,
                              recurrence_months: e.target.value ? parseInt(e.target.value) : undefined
                            })}
                            placeholder="12"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="value">Valeur ponctuelle (€)</Label>
                        <Input
                          id="value"
                          type="number"
                          value={editingOpportunity.montant || ''}
                          onChange={(e) => setEditingOpportunity({
                            ...editingOpportunity,
                            montant: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                          placeholder="2500"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Autres informations */}
                <div>
                  <h3 className="font-medium mb-3">Autres informations</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="tags">Tags (séparés par des virgules)</Label>
                      <Input
                        id="tags"
                        value={editingOpportunity.tags || ''}
                        onChange={(e) => setEditingOpportunity({
                          ...editingOpportunity,
                          tags: e.target.value
                        })}
                        placeholder="Urgent, E-commerce, WordPress"
                      />
                    </div>

                    <div>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={editingOpportunity.note_base || ''}
                        onChange={(e) => setEditingOpportunity({
                          ...editingOpportunity,
                          note_base: e.target.value
                        })}
                        rows={4}
                        placeholder="Notes internes sur l'opportunité..."
                      />
                    </div>

                    <div>
                      <Label htmlFor="nextFollowUp">Prochain suivi (optionnel)</Label>
                      <Input
                        id="nextFollowUp"
                        type="date"
                        value={editingOpportunity.date_prochain_suivi || ''}
                        onChange={(e) => setEditingOpportunity({
                          ...editingOpportunity,
                          date_prochain_suivi: e.target.value || undefined
                        })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={handleSaveOpportunity}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </Button>
                  <Button variant="outline" onClick={() => setEditingOpportunity(null)}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DndProvider>
  );
};