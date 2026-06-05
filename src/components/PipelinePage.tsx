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
  Plus,
  MousePointerClick,
  X,
  MoveRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Check,
  Filter
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

// Mapping flag identifier → studio flag presentation (class + short label + icon)
const FLAG_PRESENTATION: Record<string, { cls: string; label: string }> = {
  site_merdique: { cls: 'flag-site', label: 'site merdique' },
  site_tres_ancien: { cls: 'flag-old', label: 'site très ancien' },
  a_revoir_plus_tard: { cls: 'flag-later', label: 'revoir plus tard' },
};

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
type LeadMagnetFilter = 'all' | 'ready' | 'not_ready';

interface OpportunityCardProps {
  opportunity: Opportunity;
  stageColor?: string;
  onView: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
  contactChannel: ContactChannel;
  onContactChannelChange: (opportunityId: string, channel: ContactChannel) => void;
  isReduced?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  stageColor,
  onView,
  onEdit,
  contactChannel,
  onContactChannelChange,
  isReduced = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { companies } = useAppData();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: { id: opportunity.id, originalStage: opportunity.stage_id } as DragItem,
    canDrag: !selectionMode,
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
        data-priority={opportunity.priorite}
        className={`kp-card ${
          selectionMode
            ? isSelected
              ? 'ring-2 ring-[var(--accent)] cursor-pointer'
              : 'cursor-pointer'
            : isDragging
            ? 'cursor-grab'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ opacity: isDragging ? 0.5 : 1, padding: '7px 9px', gap: 4 }}
        onClick={() => selectionMode ? onToggleSelect?.(opportunity.id) : onView(opportunity)}
      >
        <div className="top">
          {selectionMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(opportunity.id)}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 mt-0.5"
            />
          ) : (
            <Grip className="ico-xs text-[var(--text-4)] flex-shrink-0 mt-0.5" />
          )}
          <span className="nm">{opportunityName}</span>
          {(opportunity.value || opportunity.montant || opportunity.mrr) && (
            <span className="vl">
              {opportunity.type === 'mrr' && opportunity.mrr
                ? `${opportunity.mrr.toLocaleString()}€/mois`
                : `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`}
            </span>
          )}
        </div>
        <div className="meta-line">
          <span>{companyDisplayName}</span>
          {hasPhone && <Phone className="ico-xs text-[var(--ok)]" />}
          {hasEmail && <Mail className="ico-xs text-[var(--info)]" />}
          {hasLinkedin && <Linkedin className="ico-xs text-[var(--info)]" />}
        </div>
      </div>
    );
  }

  const handleChannelButton = (channel: ContactChannel) => {
    // Re-cliquer le canal actif le remet à "pas défini" (toggle), sinon on le sélectionne.
    onContactChannelChange(opportunity.id, contactChannel === channel ? ContactChannel.PasDefini : channel);
  };

  const tags = (opportunity.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const flags = parseFlags(opportunity.flags);
  const note = opportunity.notes || opportunity.note_base;
  const valueLabel =
    opportunity.type === 'mrr' && opportunity.mrr
      ? `${opportunity.mrr.toLocaleString()}€/mois`
      : opportunity.value || opportunity.montant
      ? `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`
      : null;

  return (
    <div
      ref={ref}
      data-priority={opportunity.priorite}
      className={`kp-card ${
        selectionMode
          ? isSelected
            ? 'ring-2 ring-[var(--accent)] cursor-pointer'
            : 'cursor-pointer'
          : isDragging
          ? 'cursor-grab'
          : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{ opacity: isDragging ? 0.5 : 1, borderLeftColor: stageColor }}
      onClick={() => (selectionMode ? onToggleSelect?.(opportunity.id) : onView(opportunity))}
    >
      <div className="top">
        {selectionMode ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.(opportunity.id)}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 mt-0.5"
          />
        ) : (
          <Grip className="ico-xs text-[var(--text-4)] flex-shrink-0 mt-0.5" />
        )}
        {associatedCompany?.logo_url ? (
          <img src={associatedCompany.logo_url} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
        ) : null}
        <span className="nm">{opportunityName}</span>
        {valueLabel && <span className="vl">{valueLabel}</span>}
      </div>

      <div className="meta-line">
        <span className="priority" data-p={opportunity.priorite}>
          {getPriorityIcon(opportunity.priorite)}
          {opportunity.priorite || 'non définie'}
        </span>
        <span style={{ color: 'var(--text-4)' }}>·</span>
        <span>{companyDisplayName}</span>
        {tags.length > 0 && (
          <>
            <span style={{ color: 'var(--text-4)' }}>·</span>
            <span>{tags[0]}</span>
            {tags.length > 1 && <span style={{ color: 'var(--text-4)' }}>+{tags.length - 1}</span>}
          </>
        )}
      </div>

      {flags.length > 0 && (
        <div className="flags-line">
          {flags.map((flag) => {
            const presentation = FLAG_PRESENTATION[flag];
            const found = OPPORTUNITY_FLAGS.find((item) => item.value === flag);
            return (
              <span key={flag} className={`flag ${presentation?.cls ?? ''}`}>
                {flag === 'site_merdique' && <AlertCircle className="ico-xs" />}
                {flag === 'site_tres_ancien' && <Clock className="ico-xs" />}
                {flag === 'a_revoir_plus_tard' && <Calendar className="ico-xs" />}
                {presentation?.label ?? found?.label ?? flag}
              </span>
            );
          })}
        </div>
      )}

      {opportunity.date_prochain_suivi && (
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--warn)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <AlertCircle className="ico-xs" />
          Suivi : {formatDate(opportunity.date_prochain_suivi)}
        </div>
      )}

      {note && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            lineHeight: 1.4,
            fontStyle: 'italic',
            borderTop: '1px solid var(--border)',
            paddingTop: 5,
            marginTop: 2,
          }}
        >
          <MessageSquare className="ico-xs" style={{ marginRight: 4, verticalAlign: '-2px', color: 'var(--text-4)' }} />
          {note}
        </div>
      )}

      <div
        className="channels"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="ch"
          aria-pressed={contactChannel === ContactChannel.Telephone}
          aria-label="Téléphone"
          title={hasPhone ? 'Téléphone' : 'Téléphone (aucun numéro)'}
          onClick={() => handleChannelButton(ContactChannel.Telephone)}
        >
          <Phone className="ico-sm" />
        </button>
        <button
          type="button"
          className="ch"
          aria-pressed={contactChannel === ContactChannel.Email}
          aria-label="Email"
          title={hasEmail ? 'Email' : 'Email (aucune adresse)'}
          onClick={() => handleChannelButton(ContactChannel.Email)}
        >
          <Mail className="ico-sm" />
        </button>
        <button
          type="button"
          className="ch"
          aria-pressed={contactChannel === ContactChannel.Linkedin}
          aria-label="LinkedIn"
          title={hasLinkedin ? 'LinkedIn' : 'LinkedIn (aucun profil)'}
          onClick={() => handleChannelButton(ContactChannel.Linkedin)}
        >
          <Linkedin className="ico-sm" />
        </button>
        <button
          type="button"
          className="ch"
          aria-pressed={contactChannel === ContactChannel.Whatsapp}
          aria-label="WhatsApp"
          title="WhatsApp"
          onClick={() => handleChannelButton(ContactChannel.Whatsapp)}
        >
          <MessageSquare className="ico-sm" />
        </button>
        {websiteUrl ? (
          <a
            className="ch"
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Site web"
            title="Visiter le site"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="ico-sm" />
          </a>
        ) : (
          <span className="ch" aria-hidden style={{ opacity: 0.4, cursor: 'default' }} title="Aucun site">
            <Globe className="ico-sm" />
          </span>
        )}
        <button
          type="button"
          className="ch"
          aria-label="Modifier l'opportunité"
          title="Modifier"
          style={{ marginLeft: 'auto' }}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(opportunity);
          }}
        >
          <Edit className="ico-sm" />
        </button>
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
  selectionMode?: boolean;
  selectedCardIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  opportunities,
  onDrop,
  onView,
  onEdit,
  contactChannels,
  onContactChannelChange,
  isReduced = false,
  selectionMode = false,
  selectedCardIds = new Set(),
  onToggleSelect,
  onSelectAll,
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

  const stageValueLabel = `${stageValue.toLocaleString()}€`;

  if (isReduced) {
    return (
      <div
        ref={ref}
        className={`kp-col reduced ${isOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
        style={{ minHeight: '100%' }}
        title={`${stage.nom} — ${opportunities.length} opp. — ${stageValueLabel}`}
      >
        <div className="kp-col-hd" style={{ flexDirection: 'column', padding: '10px 6px', gap: 6 }}>
          <span className="dot" style={{ background: stageColor }} />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-2)',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap',
              marginTop: 4,
            }}
          >
            {stage.nom}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 'auto' }}>
            {opportunities.length}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`kp-col ${isOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
      style={{ minHeight: '100%' }}
    >
      <div className="kp-col-hd">
        <span className="dot" style={{ background: stageColor }} />
        <span className="nm">{stage.nom}</span>
        <span className="ct">{opportunities.length}</span>
        {stageValue > 0 && <span className="vl">{stageValueLabel}</span>}
        {selectionMode && opportunities.length > 0 ? (
          <label className="ck" style={{ cursor: 'pointer' }} title="Tout sélectionner" onMouseDown={(e) => e.stopPropagation()}>
            <Checkbox
              checked={opportunities.every((o) => selectedCardIds.has(o.id))}
              onCheckedChange={(checked) => {
                if (checked) {
                  onSelectAll?.(opportunities.map((o) => o.id));
                } else {
                  onSelectAll?.([]);
                }
              }}
            />
          </label>
        ) : (
          <span className="ck" aria-hidden title="Plus d'options">
            <Settings className="ico-sm" />
          </span>
        )}
      </div>

      <div className="kp-col-bd">
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
            selectionMode={selectionMode}
            isSelected={selectedCardIds.has(opportunity.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}

        {opportunities.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 8px',
              color: isOver ? 'var(--accent)' : 'var(--text-4)',
            }}
          >
            <Target className="ico-lg" style={{ margin: '0 auto 6px', opacity: isOver ? 1 : 0.5 }} />
            <p style={{ fontSize: 11.5 }}>{isOver ? 'Déposez ici' : 'Glissez une opportunité ici'}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="kp-add"
        disabled
        title="La création d'opportunités se fait depuis la liste des entreprises"
      >
        <Plus className="ico-sm" />
        Ajouter une opp.
      </button>
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
    addPipeline,
    addPipelineStage,
    deletePipelineStage,
    renamePipelineStage,
    movePipelineStageUp,
    movePipelineStageDown,
  } = useAppData();
  
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
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
  const [leadMagnetFilter, setLeadMagnetFilter] = useState<LeadMagnetFilter>('all');
  const [pipelineMode, setPipelineMode] = useState<'standard' | 'cold_call'>('standard');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('all');
  const [newPipelineName, setNewPipelineName] = useState('');
  const [modalPipelineId, setModalPipelineId] = useState<string | undefined>(undefined);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [bulkTargetPipelineId, setBulkTargetPipelineId] = useState<string>('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [editingStageNom, setEditingStageNom] = useState('');

  React.useEffect(() => {
    if (selectedPipelineId !== 'all') return;
    const defaultPipeline = pipelines.find((pipeline) => pipeline.is_default) || pipelines[0];
    if (defaultPipeline) {
      setSelectedPipelineId(defaultPipeline.id);
    }
  }, [pipelines, selectedPipelineId]);

  React.useEffect(() => {
    setModalPipelineId(selectedOpportunity?.pipeline_id ?? undefined);
  }, [selectedOpportunity?.id]);

  const stagesForPipeline = React.useMemo(
    () =>
      selectedPipelineId === 'all'
        ? pipelineStages
        : pipelineStages.filter((stage) => stage.pipeline_id === selectedPipelineId),
    [pipelineStages, selectedPipelineId]
  );
  const stageIdsForSelectedPipeline = React.useMemo(
    () => new Set(stagesForPipeline.map((stage) => stage.id)),
    [stagesForPipeline]
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
      if (selectedPipelineId !== 'all') {
        const matchesPipelineId = opportunity.pipeline_id === selectedPipelineId;
        const matchesStagePipeline =
          typeof opportunity.stage_id === 'number' && stageIdsForSelectedPipeline.has(opportunity.stage_id);
        if (!matchesPipelineId && !matchesStagePipeline) {
          return false;
        }
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
      const hasLeadMagnetReady = Boolean(opportunity.lead_magnet || opportunity.leadMagnet);
      const matchesLeadMagnet =
        leadMagnetFilter === 'all' ||
        (leadMagnetFilter === 'ready' ? hasLeadMagnetReady : !hasLeadMagnetReady);

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

      return matchesMin && matchesMax && matchesPriority && matchesPhone && matchesEmployees && matchesFlags && matchesService && matchesLeadMagnet && matchesSearch;
    });
  }, [opportunities, companiesById, minPrice, maxPrice, selectedPriorities, requireMobilePhone, requireEmployees, searchTerm, selectedFlags, selectedService, selectedPipelineId, leadMagnetFilter, stageIdsForSelectedPipeline]);

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
    setLeadMagnetFilter('all');
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

  const handleToggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) setSelectedCardIds(new Set());
      return !prev;
    });
  };

  const handleToggleSelectCard = (id: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllInColumn = (ids: string[]) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (ids.length === 0) {
        // deselect all from this column — we don't have the column ids here, handled in column
        return next;
      }
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDeselectAllInColumn = (ids: string[]) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleBulkMove = async () => {
    if (!bulkTargetPipelineId || selectedCardIds.size === 0) return;
    const firstStage = pipelineStages
      .filter((s) => s.pipeline_id === bulkTargetPipelineId)
      .sort((a, b) => a.ordre - b.ordre)[0];
    if (!firstStage) {
      toast.error('Aucune étape trouvée dans ce pipeline');
      return;
    }
    setIsBulkMoving(true);
    try {
      await Promise.all([...selectedCardIds].map((id) => moveOpportunityToStage(id, firstStage.id)));
      const targetPipeline = pipelines.find((p) => p.id === bulkTargetPipelineId);
      toast.success(`${selectedCardIds.size} opportunité(s) déplacée(s) vers "${targetPipeline?.nom}"`);
      setSelectedCardIds(new Set());
      setSelectionMode(false);
      setBulkTargetPipelineId('');
    } catch (error) {
      logger.error('Erreur lors du déplacement en masse:', error);
      toast.error('Erreur lors du déplacement en masse');
    } finally {
      setIsBulkMoving(false);
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

  const sortLabels: Record<SortOption, string> = {
    recent: 'Récent',
    'price-asc': 'Prix ↑',
    'price-desc': 'Prix ↓',
    'priority-high': 'Priorité ↑',
    'priority-low': 'Priorité ↓',
  };
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const pipelinePickLabel = selectedPipelineId === 'all' ? 'Tous les pipelines' : selectedPipeline?.nom ?? 'Pipeline';

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="studio-surface flex min-h-full flex-col">
        {/* Toolbar */}
        <div className="pipe-bar">
          <div className="pipeline-pick" style={{ padding: 0, border: 0, background: 'transparent' }}>
            <PipelineCombobox
              pipelines={pipelines}
              selectedValue={selectedPipelineId}
              includeAllOption
              onSelect={setSelectedPipelineId}
              onCreate={addPipeline}
              placeholder="Choisir ou créer un pipeline"
            />
            <span className="ct" title={pipelinePickLabel}>{sortedOpportunities.length} opp.</span>
          </div>

          <div className="seg" aria-label="Mode d'affichage du pipeline">
            <button
              type="button"
              className="s"
              aria-pressed={pipelineMode === 'standard'}
              onClick={() => setPipelineMode('standard')}
            >
              <Grip className="ico-sm" />
              Kanban
            </button>
            <button
              type="button"
              className="s"
              aria-pressed={pipelineMode === 'cold_call'}
              onClick={() => setPipelineMode('cold_call')}
            >
              <Phone className="ico-sm" />
              Cold call
            </button>
          </div>

          <span className="grow" style={{ flex: 1 }} />

          {pipelineMode === 'standard' && (
            <>
              <div className="select-w" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="lb">Tri :</span>
                <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                  <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-[11.5px] shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">{sortLabels.recent}</SelectItem>
                    <SelectItem value="price-asc">{sortLabels['price-asc']}</SelectItem>
                    <SelectItem value="price-desc">{sortLabels['price-desc']}</SelectItem>
                    <SelectItem value="priority-high">{sortLabels['priority-high']}</SelectItem>
                    <SelectItem value="priority-low">{sortLabels['priority-low']}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                className="btn ghost sm"
                aria-pressed={showFilters}
                onClick={() => setShowFilters((prev) => !prev)}
              >
                <Filter className="ico-sm" />
                Filtres
              </button>
              <button
                type="button"
                className="btn ghost sm"
                aria-pressed={showSettings}
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="ico-sm" />
                Étapes
              </button>
              <button
                type="button"
                className="btn ghost sm"
                aria-pressed={selectionMode}
                onClick={handleToggleSelectionMode}
              >
                <MousePointerClick className="ico-sm" />
                {selectionMode ? 'Annuler' : 'Sélectionner'}
              </button>
            </>
          )}
        </div>

        {pipelineMode === 'cold_call' && (
          <div className="px-5 pb-6">
            <QualifiedColdCallWorkspace includeOnlyQualified={false} scopedCompanyIds={filteredOpportunityCompanyIds} />
          </div>
        )}

        {pipelineMode === 'standard' && (
          <>

        {/* Strip KPI par étape */}
        <div className="pipe-bar" style={{ paddingTop: 4 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, minmax(0, 1fr))`,
              gap: 1,
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              flex: 1,
            }}
          >
            {visibleStages
              .slice()
              .sort((a, b) => a.ordre - b.ordre)
              .map((stage) => {
                const stageOpps = getFilteredOpportunitiesByStage(stage.id);
                const stageSum = stageOpps.reduce((sum, opp) => sum + calculateOpportunityValue(opp), 0);
                return (
                  <div
                    key={stage.id}
                    style={{ background: 'var(--surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: getStageColor(stage.nom), flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.nom}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-.01em', lineHeight: 1, marginTop: 3 }}>
                      {stageSum > 0 ? `${stageSum.toLocaleString()}€` : '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)' }}>{stageOpps.length} opp.</div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Configuration des étapes */}
        {showSettings && (
          <div className="px-5 pb-2">
          <Card className="p-4">
            <h3 className="font-medium mb-4">Configuration des étapes</h3>
            <div className="flex flex-col gap-2">
              {stagesForPipeline.map((stage, idx) => {
                const config = stageConfigs.find(c => c.id === stage.id);
                const stageColor = getStageColor(stage.nom);
                const isEditing = editingStageId === stage.id;

                return (
                  <div key={stage.id} className="flex items-center gap-2 p-3 border rounded-lg">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={idx === 0}
                        onClick={() => movePipelineStageUp(stage.id)}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        disabled={idx === stagesForPipeline.length - 1}
                        onClick={() => movePipelineStageDown(stage.id)}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Color dot */}
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stageColor }} />

                    {/* Name / inline edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <Input
                          className="h-7 text-sm flex-1"
                          value={editingStageNom}
                          autoFocus
                          onChange={(e) => setEditingStageNom(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renamePipelineStage(stage.id, editingStageNom);
                              setEditingStageId(null);
                            } else if (e.key === 'Escape') {
                              setEditingStageId(null);
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => {
                            renamePipelineStage(stage.id, editingStageNom);
                            setEditingStageId(null);
                          }}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">{stage.nom}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0 opacity-40 hover:opacity-100"
                          onClick={() => {
                            setEditingStageId(stage.id);
                            setEditingStageNom(stage.nom);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Visibility + size toggles */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <Switch
                          checked={config?.isVisible !== false}
                          onCheckedChange={() => toggleStageVisibility(stage.id)}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Minimize2 className="h-4 w-4 text-muted-foreground" />
                        <Switch
                          checked={config?.isReduced || false}
                          onCheckedChange={() => toggleStageSize(stage.id)}
                        />
                      </div>
                    </div>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
                      onClick={() => deletePipelineStage(stage.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Add new stage */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Input
                placeholder="Nom de la nouvelle étape"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newStageName.trim()) {
                    const pipelineId = selectedPipelineId === 'all'
                      ? (pipelines.find(p => p.is_default)?.id ?? pipelines[0]?.id ?? '')
                      : selectedPipelineId;
                    addPipelineStage(pipelineId, newStageName);
                    setNewStageName('');
                  }
                }}
              />
              <Button
                variant="outline"
                className="flex-shrink-0"
                disabled={!newStageName.trim()}
                onClick={() => {
                  const pipelineId = selectedPipelineId === 'all'
                    ? (pipelines.find(p => p.is_default)?.id ?? pipelines[0]?.id ?? '')
                    : selectedPipelineId;
                  addPipelineStage(pipelineId, newStageName);
                  setNewStageName('');
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            </div>
          </Card>
          </div>
        )}

        {showFilters && (
        <div className="px-5 pb-2">
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

              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Lead magnet</Label>
                <Select value={leadMagnetFilter} onValueChange={(value) => setLeadMagnetFilter(value as LeadMagnetFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="ready">Lead magnet prêt</SelectItem>
                    <SelectItem value="not_ready">Lead magnet non prêt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>

            <div className="flex flex-wrap gap-3 justify-end">
              {(searchTerm || minPrice || maxPrice || selectedPriorities.length || selectedFlags.length || requireMobilePhone || requireEmployees || selectedService !== 'all' || leadMagnetFilter !== 'all' || sortOption !== 'recent') && (
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
                    leadMagnetFilter !== 'all' ? (leadMagnetFilter === 'ready' ? 'LM prêts' : 'LM non prêts') : null,
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
        </div>
        )}

        {/* Kanban */}
        <div className="kb-pipeline">
          {visibleStages
            .slice()
            .sort((a, b) => a.ordre - b.ordre)
            .map((stage) => {
              const config = stageConfigs.find(c => c.id === stage.id);
              const isReduced = config?.isReduced || false;
              const stageOpportunities = getFilteredOpportunitiesByStage(stage.id);

              return (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  opportunities={stageOpportunities}
                  onDrop={handleDrop}
                  onView={setSelectedOpportunity}
                  onEdit={handleEditOpportunity}
                  contactChannels={contactChannels}
                  onContactChannelChange={handleContactChannelChange}
                  isReduced={isReduced}
                  selectionMode={selectionMode}
                  selectedCardIds={selectedCardIds}
                  onToggleSelect={handleToggleSelectCard}
                  onSelectAll={(ids) => {
                    if (ids.length === 0) {
                      handleDeselectAllInColumn(stageOpportunities.map((o) => o.id));
                    } else {
                      handleSelectAllInColumn(ids);
                    }
                  }}
                />
              );
            })}
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
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Pipeline</label>
                        <Select
                          value={modalPipelineId ?? selectedOpportunity.pipeline_id ?? ''}
                          onValueChange={(newPipelineId) => {
                            setModalPipelineId(newPipelineId);
                            const firstStage = pipelineStages
                              .filter((s) => s.pipeline_id === newPipelineId)
                              .sort((a, b) => a.ordre - b.ordre)[0];
                            if (firstStage) {
                              handleDrop(selectedOpportunity.id, firstStage.id);
                              setSelectedOpportunity({
                                ...selectedOpportunity,
                                pipeline_id: newPipelineId,
                                stage_id: firstStage.id,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Choisir un pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines.map((pipeline) => (
                              <SelectItem key={pipeline.id} value={pipeline.id}>
                                {pipeline.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Étape actuelle</label>
                        <Select
                          value={selectedOpportunity.stage_id?.toString()}
                          onValueChange={(newStage) => {
                            handleDrop(selectedOpportunity.id, parseInt(newStage));
                            setSelectedOpportunity({
                              ...selectedOpportunity,
                              stage_id: parseInt(newStage),
                            });
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelineStages
                              .filter((s) =>
                                modalPipelineId
                                  ? s.pipeline_id === modalPipelineId
                                  : s.pipeline_id === selectedOpportunity.pipeline_id
                              )
                              .sort((a, b) => a.ordre - b.ordre)
                              .map((stage) => (
                                <SelectItem key={stage.id} value={stage.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: getStageColor(stage.nom) }}
                                    />
                                    {stage.nom}
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
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

      {/* Barre d'actions flottante pour la sélection en masse */}
      {selectionMode && selectedCardIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border shadow-xl rounded-xl px-5 py-3">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedCardIds.size} opportunité{selectedCardIds.size > 1 ? 's' : ''} sélectionnée{selectedCardIds.size > 1 ? 's' : ''}
          </span>
          <MoveRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Select value={bulkTargetPipelineId} onValueChange={setBulkTargetPipelineId}>
            <SelectTrigger className="h-8 w-48 text-sm">
              <SelectValue placeholder="Choisir un pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkTargetPipelineId || isBulkMoving}
            onClick={handleBulkMove}
            className="whitespace-nowrap"
          >
            {isBulkMoving ? 'Déplacement...' : 'Déplacer'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedCardIds(new Set());
              setSelectionMode(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </DndProvider>
  );
};
