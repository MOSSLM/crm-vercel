"use client";

import logger from '../utils/logger';
import React, { useState, useRef } from 'react';
import { useAppData } from './AppDataContext';
import { Opportunity, PipelineStage } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
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
  Globe,
  Plus
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'sonner';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { journalApi } from '../utils/journalApi';
import { ContactChannel } from '../types';
import { normalizeServiceTags } from '../utils/serviceTags';
import { QualifiedColdCallWorkspace } from './QualifiedColdCallWorkspace';
import { PipelineCombobox } from './PipelineCombobox';

const normalizeWebsiteUrl = (url?: string | null) => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const sanitized = trimmed.replace(/^\/+/, '');
  return `https://${sanitized}`;
};

const ItemType = 'OPPORTUNITY';


const OPPORTUNITY_FLAGS = [
  { value: 'site_merdique', label: 'Site merdique / inutilisable' },
  { value: 'site_tres_ancien', label: 'Site très ancien' },
  { value: 'a_revoir_plus_tard', label: 'À revoir plus tard' },
] as const;

const parseFlags = (flags?: string[]) =>
  Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === 'string' && flag.length > 0) : [];

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
  if (name.includes('cold call') || name.includes('approche') || name.includes('relance')) {
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

type SortOption = 'recent' | 'price-asc' | 'price-desc' | 'priority-high' | 'priority-low';
type NormalizedPriority = 'haute' | 'moyenne' | 'basse';

interface OpportunityCardProps {
  opportunity: Opportunity;
  stageColor?: string;
  onView: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
  contactChannel: ContactChannel;
  onContactChannelChange: (opportunityId: string, channel: ContactChannel) => void;
  isReduced?: boolean;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  stageColor,
  onView,
  onEdit,
  contactChannel,
  onContactChannelChange,
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
  const websiteUrl = normalizeWebsiteUrl(opportunity.companyUrl || associatedCompany?.canonical_url);
  const hasWebsite = !!websiteUrl;

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

  const handleChannelChange = (value: string) => {
    onContactChannelChange(opportunity.id, value as ContactChannel);
  };

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

        {parseFlags(opportunity.flags).length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {parseFlags(opportunity.flags).map((flag) => {
              const found = OPPORTUNITY_FLAGS.find((item) => item.value === flag);
              return (
                <Badge key={flag} variant="destructive" className="text-[10px] px-1 py-0">{found?.label || flag}</Badge>
              );
            })}
          </div>
        )}

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

          <div
            className="flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Label className="text-xs text-muted-foreground">Canal de contact</Label>
            <Select value={contactChannel} onValueChange={handleChannelChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Sélectionner un canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ContactChannel.PasDefini}>Pas défini</SelectItem>
                <SelectItem value={ContactChannel.Telephone}>Téléphone</SelectItem>
                <SelectItem value={ContactChannel.Email}>Email</SelectItem>
                <SelectItem value={ContactChannel.Linkedin}>LinkedIn</SelectItem>
                <SelectItem value={ContactChannel.Whatsapp}>WhatsApp</SelectItem>
                <SelectItem value={ContactChannel.Sms}>SMS</SelectItem>
                <SelectItem value={ContactChannel.Autre}>Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-1 pt-2">
            {websiteUrl && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs px-2 py-1 h-6"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                asChild
              >
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Site
                </a>
              </Button>
            )}
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
  contactChannels: Record<string, ContactChannel>;
  onContactChannelChange: (opportunityId: string, channel: ContactChannel) => void;
  isReduced?: boolean;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  opportunities,
  onDrop,
  onView,
  onEdit,
  contactChannels,
  onContactChannelChange,
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
            contactChannel={contactChannels[opportunity.id] ?? ContactChannel.PasDefini}
            onContactChannelChange={onContactChannelChange}
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
    pipelines,
    pipelineStages, 
    moveOpportunityToStage,
    updateOpportunity,
    companies,
    addPipeline
  } = useAppData();
  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [contactChannels, setContactChannels] = useState<Record<string, ContactChannel>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState<NormalizedPriority[]>([]);
  const [requireMobilePhone, setRequireMobilePhone] = useState(false);
  const [requireEmployees, setRequireEmployees] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState('all');
  const [pipelineMode, setPipelineMode] = useState<'standard' | 'cold_call'>('standard');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('all');
  const [newPipelineName, setNewPipelineName] = useState('');

  React.useEffect(() => {
    if (selectedPipelineId !== 'all') return;
    const defaultPipeline = pipelines.find((pipeline) => pipeline.is_default) || pipelines[0];
    if (defaultPipeline) {
      setSelectedPipelineId(defaultPipeline.id);
    }
  }, [pipelines, selectedPipelineId]);

  const stagesForPipeline = React.useMemo(
    () =>
      selectedPipelineId === 'all'
        ? pipelineStages
        : pipelineStages.filter((stage) => stage.pipeline_id === selectedPipelineId),
    [pipelineStages, selectedPipelineId]
  );

  const companiesById = React.useMemo(() => {
    const map = new Map<number, (typeof companies)[number]>();
    companies.forEach(company => {
      map.set(company.id, company);
    });
    return map;
  }, [companies]);

  const availableServices = React.useMemo(
    () =>
      Array.from(
        new Set(
          companies.flatMap((company) => normalizeServiceTags(company.service_tags, company.premiers_tags))
        )
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [companies]
  );

  const getNormalizedPriority = (opportunity: Opportunity): NormalizedPriority | undefined => {
    const priorityValue = (opportunity.priorite || opportunity.priority)?.toString().toLowerCase();
    if (!priorityValue) return undefined;

    if (priorityValue.includes('haut') || priorityValue === 'high') return 'haute';
    if (priorityValue.includes('moy') || priorityValue === 'medium') return 'moyenne';
    if (priorityValue.includes('bas') || priorityValue === 'low') return 'basse';
    return undefined;
  };

  const calculateOpportunityValue = (opportunity: Opportunity) => {
    if (opportunity.type === 'mrr' && opportunity.mrr) {
      const months = opportunity.recurrence_months || 12;
      return opportunity.mrr * months;
    }
    return opportunity.value || opportunity.montant || 0;
  };

  const doesPhoneLookMobile = (phone?: string | null) => {
    if (!phone) return false;
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits) return false;
    return (
      digits.startsWith('06') ||
      digits.startsWith('07') ||
      digits.startsWith('336') ||
      digits.startsWith('337') ||
      digits.startsWith('00336') ||
      digits.startsWith('00337')
    );
  };

  const companyHasEmployees = (company?: (typeof companies)[number]) => {
    if (!company) return false;
    if (typeof company.nb_employes_exact === 'number') {
      return company.nb_employes_exact >= 1;
    }
    if (company.nb_employes_band && company.nb_employes_band !== 'unknown') {
      return true;
    }
    return false;
  };

  const filteredOpportunities = React.useMemo(() => {
    const minValue = minPrice ? Number(minPrice) : undefined;
    const maxValue = maxPrice ? Number(maxPrice) : undefined;
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return opportunities.filter(opportunity => {
      if (selectedPipelineId !== 'all' && opportunity.pipeline_id !== selectedPipelineId) {
        return false;
      }
      const company = opportunity.entreprise_id ? companiesById.get(opportunity.entreprise_id) : undefined;
      const normalizedPriority = getNormalizedPriority(opportunity);
      const opportunityValue = calculateOpportunityValue(opportunity);

      const matchesMin = minValue === undefined || opportunityValue >= minValue;
      const matchesMax = maxValue === undefined || opportunityValue <= maxValue;
      const matchesPriority =
        selectedPriorities.length === 0 || (normalizedPriority && selectedPriorities.includes(normalizedPriority));
      const matchesPhone =
        !requireMobilePhone ||
        doesPhoneLookMobile(opportunity.telephone) ||
        doesPhoneLookMobile(company?.telephone ?? undefined);
      const matchesEmployees = !requireEmployees || companyHasEmployees(company);
      const opportunityFlags = parseFlags(opportunity.flags);
      const matchesFlags = selectedFlags.length === 0 || selectedFlags.some((flag) => opportunityFlags.includes(flag));
      const companyServiceTags = normalizeServiceTags(company?.service_tags, company?.premiers_tags);
      const matchesService = selectedService === 'all' || companyServiceTags.includes(selectedService);

      const matchesSearch =
        !normalizedSearch ||
        [
          opportunity.name,
          opportunity.tags,
          opportunity.note_base,
          opportunity.contact_name,
          opportunity.companyName,
          opportunity.companyUrl,
          company?.name,
          company?.canonical_url,
        ]
          .filter(Boolean)
          .some(value => value!.toString().toLowerCase().includes(normalizedSearch));

      return matchesMin && matchesMax && matchesPriority && matchesPhone && matchesEmployees && matchesFlags && matchesService && matchesSearch;
    });
  }, [opportunities, companiesById, minPrice, maxPrice, selectedPriorities, requireMobilePhone, requireEmployees, searchTerm, selectedFlags, selectedService, selectedPipelineId]);

  const sortedOpportunities = React.useMemo(() => {
    const priorityOrderHighFirst: Record<string, number> = {
      haute: 0,
      moyenne: 1,
      basse: 2,
    };
    const priorityOrderLowFirst: Record<string, number> = {
      basse: 0,
      moyenne: 1,
      haute: 2,
    };

    const base = [...filteredOpportunities];

    switch (sortOption) {
      case 'price-asc':
        return base.sort((a, b) => calculateOpportunityValue(a) - calculateOpportunityValue(b));
      case 'price-desc':
        return base.sort((a, b) => calculateOpportunityValue(b) - calculateOpportunityValue(a));
      case 'priority-high':
        return base.sort((a, b) => {
          const priorityA = getNormalizedPriority(a);
          const priorityB = getNormalizedPriority(b);
          const valueA = priorityA ? priorityOrderHighFirst[priorityA] : Number.POSITIVE_INFINITY;
          const valueB = priorityB ? priorityOrderHighFirst[priorityB] : Number.POSITIVE_INFINITY;
          return valueA - valueB;
        });
      case 'priority-low':
        return base.sort((a, b) => {
          const priorityA = getNormalizedPriority(a);
          const priorityB = getNormalizedPriority(b);
          const valueA = priorityA ? priorityOrderLowFirst[priorityA] : Number.POSITIVE_INFINITY;
          const valueB = priorityB ? priorityOrderLowFirst[priorityB] : Number.POSITIVE_INFINITY;
          return valueA - valueB;
        });
      case 'recent':
      default:
        return base.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.lastUpdate || a.created_at || 0).getTime();
          const dateB = new Date(b.updated_at || b.lastUpdate || b.created_at || 0).getTime();
          return dateB - dateA;
        });
    }
  }, [filteredOpportunities, sortOption]);

  const getFilteredOpportunitiesByStage = React.useCallback(
    (stageId: number) => sortedOpportunities.filter(opportunity => opportunity.stage_id === stageId),
    [sortedOpportunities]
  );

  const handleResetFilters = () => {
    setSearchTerm('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedPriorities([]);
    setRequireMobilePhone(false);
    setRequireEmployees(false);
    setSortOption('recent');
    setSelectedFlags([]);
    setSelectedService('all');
  };

  const selectedCompany = selectedOpportunity
    ? companies.find(c => c.id === selectedOpportunity.entreprise_id)
    : undefined;
  const selectedOpportunityWebsiteUrl = selectedOpportunity
    ? normalizeWebsiteUrl(selectedOpportunity.companyUrl || selectedCompany?.canonical_url)
    : undefined;
  const selectedCompanyServiceTags = normalizeServiceTags(selectedCompany?.service_tags, selectedCompany?.premiers_tags);

  // Configuration des étapes (visibilité et taille)
  const [stageConfigs, setStageConfigs] = useState<StageConfiguration[]>(
    stagesForPipeline.map(stage => ({
      id: stage.id,
      isVisible: true,
      isReduced: false
    }))
  );

  // Synchroniser la configuration avec les étapes
  React.useEffect(() => {
    setStageConfigs((previousConfigs) =>
      stagesForPipeline.map((stage) => {
        const existingConfig = previousConfigs.find((config) => config.id === stage.id);
        return (
          existingConfig || {
            id: stage.id,
            isVisible: true,
            isReduced: false,
          }
        );
      })
    );
  }, [stagesForPipeline]);

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

  const handleContactChannelChange = (opportunityId: string, channel: ContactChannel) => {
    setContactChannels((previousChannels) => {
      if (channel === ContactChannel.PasDefini) {
        const { [opportunityId]: _removedChannel, ...rest } = previousChannels;
        return rest;
      }
      return {
        ...previousChannels,
        [opportunityId]: channel,
      };
    });
  };

  const getContactChannelForOpportunity = (opportunityId: string) =>
    contactChannels[opportunityId] ?? ContactChannel.PasDefini;

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
          logger.log(`[Journal] Enregistrement changement d'étape: "${stageName}" pour opportunité ${opportunity.id}`);
          const contactChannel = getContactChannelForOpportunity(opportunityId);
          await journalApi.logPipelineStageChange(
            stageName,
            opportunity.id,
            opportunity.entreprise_id,
            `Déplacement vers "${stageName}" depuis le pipeline`,
            contactChannel
          );
          logger.log(`[Journal] Changement d'étape enregistré avec succès`);
        } catch (journalError) {
          logger.error('Erreur lors de l\'enregistrement dans le journal:', journalError);
          // Ne pas interrompre le processus principal si la journalisation échoue
        }
      }

      setContactChannels((previousChannels) => {
        const { [opportunityId]: _removedChannel, ...rest } = previousChannels;
        return rest;
      });

      toast.success(`${displayName} déplacé vers "${stageName}"`);
    } catch (error) {
      logger.error('Erreur lors du déplacement:', error);
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
        logger.error('Erreur lors de la sauvegarde:', error);
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

  const visibleStages = stagesForPipeline.filter(stage => {
    const config = stageConfigs.find(c => c.id === stage.id);
    return config?.isVisible !== false;
  });

  const totalValue = sortedOpportunities.reduce((sum, opp) => sum + calculateOpportunityValue(opp), 0);
  const averageValue = sortedOpportunities.length > 0 ? totalValue / sortedOpportunities.length : 0;
  const filteredOpportunityCompanyIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          sortedOpportunities
            .map((opportunity) => opportunity.entreprise_id)
            .filter((companyId): companyId is number => typeof companyId === 'number')
        )
      ),
    [sortedOpportunities]
  );
  const normalizedNewPipelineName = newPipelineName.trim();
  const matchingPipeline = pipelines.find(
    (pipeline) => pipeline.nom.trim().toLowerCase() === normalizedNewPipelineName.toLowerCase()
  );
  const canCreatePipeline = normalizedNewPipelineName.length > 0 && !matchingPipeline;

  const handleCreatePipeline = async () => {
    if (!canCreatePipeline) return;
    const createdPipeline = await addPipeline(normalizedNewPipelineName);
    if (createdPipeline) {
      setSelectedPipelineId(createdPipeline.id);
      setNewPipelineName('');
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1>Pipeline des Ventes</h1>
            <p className="text-muted-foreground">
              Suivez vos opportunités à travers les différentes étapes du processus de vente
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PipelineCombobox
              pipelines={pipelines}
              selectedValue={selectedPipelineId}
              includeAllOption
              onSelect={setSelectedPipelineId}
              onCreate={addPipeline}
              placeholder="Choisir ou créer un pipeline"
            />
            <Button size="sm" variant={pipelineMode === 'standard' ? 'default' : 'outline'} onClick={() => setPipelineMode('standard')}>
              Vue pipeline
            </Button>
            <Button size="sm" variant={pipelineMode === 'cold_call' ? 'default' : 'outline'} onClick={() => setPipelineMode('cold_call')}>
              Mode Cold Call
            </Button>
            {pipelineMode === 'standard' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Configuration
              </Button>
            )}
          </div>
        </div>

        {pipelineMode === 'cold_call' && (
          <QualifiedColdCallWorkspace includeOnlyQualified={false} scopedCompanyIds={filteredOpportunityCompanyIds} />
        )}

        {pipelineMode === 'standard' && (
          <>

        {/* Configuration des étapes */}
        {showSettings && (
          <Card className="p-4">
            <h3 className="font-medium mb-4">Configuration des étapes</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stagesForPipeline.map((stage) => {
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

        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 md:gap-6">
          <Card className="min-h-[98px]">
            <CardHeader className="px-3 pt-3 pb-1 md:pb-2">
              <CardTitle className="text-sm">Opportunités totales</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 md:pb-4">
              <div className="text-lg md:text-2xl font-bold">{sortedOpportunities.length}</div>
              <p className="text-xs text-muted-foreground">Dans le pipeline (après filtres)</p>
            </CardContent>
          </Card>

          <Card className="min-h-[98px]">
            <CardHeader className="px-3 pt-3 pb-1 md:pb-2">
              <CardTitle className="text-sm">Valeur totale</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 md:pb-4">
              <div className="text-lg md:text-2xl font-bold text-green-600">
                {totalValue.toLocaleString()}€
              </div>
              <p className="text-xs text-muted-foreground">Pipeline filtré</p>
            </CardContent>
          </Card>

          <Card className="min-h-[98px]">
            <CardHeader className="px-3 pt-3 pb-1 md:pb-2">
              <CardTitle className="text-sm">Valeur moyenne</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 md:pb-4">
              <div className="text-lg md:text-2xl font-bold text-blue-600">
                {Math.round(averageValue).toLocaleString()}€
              </div>
              <p className="text-xs text-muted-foreground">Par opportunité filtrée</p>
            </CardContent>
          </Card>

          <Card className="min-h-[98px]">
            <CardHeader className="px-3 pt-3 pb-1 md:pb-2">
              <CardTitle className="text-sm">Étapes actives</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 md:pb-4">
              <div className="text-lg md:text-2xl font-bold text-purple-600">
                {visibleStages.filter(stage =>
                  getFilteredOpportunitiesByStage(stage.id).length > 0
                ).length}
              </div>
              <p className="text-xs text-muted-foreground">Sur {visibleStages.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="p-3 md:p-4">
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Recherche globale</Label>
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Rechercher une opportunité, une entreprise..."
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Tarif minimum (€)</Label>
                <Input
                  type="number"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="0"
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Tarif maximum (€)</Label>
                <Input
                  type="number"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Illimité"
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Tri des cartes</Label>
                <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Choisir un tri" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Mises à jour les plus récentes</SelectItem>
                    <SelectItem value="price-asc">Prix croissant</SelectItem>
                    <SelectItem value="price-desc">Prix décroissant</SelectItem>
                    <SelectItem value="priority-high">Priorité la plus élevée</SelectItem>
                    <SelectItem value="priority-low">Priorité la plus basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 md:gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs md:text-sm">Flags opportunité</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OPPORTUNITY_FLAGS.map((flag) => (
                    <label key={flag.value} className="flex items-center gap-2 text-xs md:text-sm">
                      <Checkbox
                        checked={selectedFlags.includes(flag.value)}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setSelectedFlags((previous) =>
                            isChecked
                              ? Array.from(new Set([...previous, flag.value]))
                              : previous.filter((value) => value !== flag.value)
                          );
                        }}
                      />
                      {flag.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs md:text-sm">Priorité</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                  { value: 'haute' as NormalizedPriority, label: 'Haute' },
                  { value: 'moyenne' as NormalizedPriority, label: 'Moyenne' },
                  { value: 'basse' as NormalizedPriority, label: 'Basse' },
                  ].map(priority => (
                    <label key={priority.value} className="flex items-center gap-2 text-xs md:text-sm">
                      <Checkbox
                        checked={selectedPriorities.includes(priority.value)}
                        onCheckedChange={(checked) => {
                          const isChecked = checked === true;
                          setSelectedPriorities(prev => {
                            if (isChecked) {
                              if (prev.includes(priority.value)) {
                                return prev;
                              }
                              return [...prev, priority.value];
                            }
                            return prev.filter(value => value !== priority.value);
                          });
                        }}
                      />
                      {priority.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 border rounded-lg px-2.5 py-2">
                <Switch checked={requireMobilePhone} onCheckedChange={setRequireMobilePhone} />
                <div>
                  <Label className="text-sm">Téléphone mobile (06 ou 07)</Label>
                  <p className="text-xs text-muted-foreground">Inclut les numéros d&apos;entreprise et d&apos;opportunité</p>
                </div>
              </div>

              <div className="flex items-center gap-2 border rounded-lg px-2.5 py-2">
                <Switch checked={requireEmployees} onCheckedChange={setRequireEmployees} />
                <div>
                  <Label className="text-sm">Entreprise avec employés</Label>
                  <p className="text-xs text-muted-foreground">Au moins un employé connu</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Service offert</Label>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tous les services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les services</SelectItem>
                    {availableServices.map((service) => (
                      <SelectItem key={service} value={service}>
                        {service}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-end">
              {(searchTerm || minPrice || maxPrice || selectedPriorities.length || selectedFlags.length || requireMobilePhone || requireEmployees || selectedService !== 'all' || sortOption !== 'recent') && (
                <Badge variant="outline" className="h-7 px-3 text-xs">
                  {[
                    searchTerm ? 'Recherche active' : null,
                    minPrice ? `Min ${minPrice}€` : null,
                    maxPrice ? `Max ${maxPrice}€` : null,
                    selectedPriorities.length ? `${selectedPriorities.length} priorité(s)` : null,
                    selectedFlags.length ? `${selectedFlags.length} flag(s)` : null,
                    requireMobilePhone ? 'Téléphone mobile' : null,
                    requireEmployees ? 'Avec employés' : null,
                    selectedService !== 'all' ? `Service: ${selectedService}` : null,
                    sortOption !== 'recent' ? 'Tri personnalisé' : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Réinitialiser
              </Button>
            </div>
          </div>
        </Card>

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
                const stageOpportunities = getFilteredOpportunitiesByStage(stage.id);

                return (
                  <div key={stage.id} className={`flex-shrink-0 ${isReduced ? 'w-48' : 'w-72'}`}>
                    <PipelineColumn
                      stage={stage}
                      opportunities={stageOpportunities}
                      onDrop={handleDrop}
                      onView={setSelectedOpportunity}
                      onEdit={handleEditOpportunity}
                      contactChannels={contactChannels}
                      onContactChannelChange={handleContactChannelChange}
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

                    {selectedCompanyServiceTags.length > 0 && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium">Services</label>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {selectedCompanyServiceTags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

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

                    {selectedOpportunityWebsiteUrl && (
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Globe className="h-4 w-4 text-gray-600" />
                          Site web
                        </label>
                        <div className="mt-1">
                          <a
                            href={selectedOpportunityWebsiteUrl}
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

                <div>
                  <label className="text-sm font-medium">Canal de contact</label>
                  <Select
                    value={selectedOpportunity ? getContactChannelForOpportunity(selectedOpportunity.id) : ContactChannel.PasDefini}
                    onValueChange={(value) => {
                      if (selectedOpportunity) {
                        handleContactChannelChange(selectedOpportunity.id, value as ContactChannel);
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ContactChannel.PasDefini}>Pas défini</SelectItem>
                      <SelectItem value={ContactChannel.Telephone}>Téléphone</SelectItem>
                      <SelectItem value={ContactChannel.Email}>Email</SelectItem>
                      <SelectItem value={ContactChannel.Linkedin}>LinkedIn</SelectItem>
                      <SelectItem value={ContactChannel.Whatsapp}>WhatsApp</SelectItem>
                      <SelectItem value={ContactChannel.Sms}>SMS</SelectItem>
                      <SelectItem value={ContactChannel.Autre}>Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
                        onValueChange={(value: 'haute' | 'moyenne' | 'basse') =>
                          setEditingOpportunity({
                            ...editingOpportunity,
                            priorite: value
                          })
                        }
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
                        onValueChange={(value: 'one_shot' | 'mrr') =>
                          setEditingOpportunity({
                            ...editingOpportunity,
                            type: value
                          })
                        }
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
                      <Label>Flags</Label>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {OPPORTUNITY_FLAGS.map((flag) => {
                          const activeFlags = parseFlags(editingOpportunity.flags);
                          const isActive = activeFlags.includes(flag.value);
                          return (
                            <label key={flag.value} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  const shouldEnable = checked === true;
                                  const next = shouldEnable
                                    ? Array.from(new Set([...activeFlags, flag.value]))
                                    : activeFlags.filter((current) => current !== flag.value);
                                  setEditingOpportunity({ ...editingOpportunity, flags: next });
                                }}
                              />
                              {flag.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

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
          </>
        )}
      </div>
    </DndProvider>
  );
};
