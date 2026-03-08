"use client";

import React, { useState } from 'react';
import { useAppData } from './AppDataContext';
import { Opportunity } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Search, 
  Filter, 
  Calendar, 
  DollarSign, 
  ArrowUp, 
  ArrowDown, 
  Minus,
  Edit,
  Target,
  Clock,
  AlertCircle,
  MessageSquare,
  Plus,
  LayoutGrid,
  List,
  MagnetIcon,
  Columns3,
  Globe,
  Phone,
} from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'sonner';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { JournalStatsWidget } from './JournalStatsWidget';
import { JournalActionButtons } from './JournalActionButtons';
import { QualifiedColdCallWorkspace } from './QualifiedColdCallWorkspace';

import logger from '../utils/logger';

const OPPORTUNITY_FLAGS = [
  { value: 'site_merdique', label: 'Site merdique / inutilisable' },
  { value: 'site_tres_ancien', label: 'Site très ancien' },
  { value: 'a_revoir_plus_tard', label: 'À revoir plus tard' },
] as const;

const parseTags = (tags?: string) =>
  tags
    ? tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
    : [];

const parseFlags = (flags?: string[]) =>
  Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === 'string' && flag.length > 0) : [];

const normalizeWebsiteUrl = (url?: string | null) => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
};

const KANBAN_ITEM_TYPE = 'OPPORTUNITY_TAG_OR_FLAG';

type KanbanGroupingMode = 'tags' | 'flags';

interface KanbanDragItem {
  id: string;
  sourceValue: string;
}
export const OpportunitiesPage: React.FC = () => {
  const { 
    opportunities, 
    pipelineStages, 
    updateOpportunity, 
    addOpportunityNote,
    toggleLeadMagnet,
    companies
  } = useAppData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'kanban' | 'cold_call'>('grid');
  const [kanbanMode, setKanbanMode] = useState<KanbanGroupingMode>('flags');
  const [newTagName, setNewTagName] = useState('');
  const [newFlagName, setNewFlagName] = useState('');
  const [newEditFlagName, setNewEditFlagName] = useState('');
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [noteType, setNoteType] = useState<'appel' | 'email' | 'linkedin' | 'whatsapp' | 'autre'>('appel');
  const [noteContent, setNoteContent] = useState('');

  const filteredOpportunities = opportunities.filter(opportunity => {
    const companyName = opportunity.companyName || '';
    const tags = parseTags(opportunity.tags);
    const flags = parseFlags(opportunity.flags);
    const notes = opportunity.notes || '';
    
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      companyName.toLowerCase().includes(searchLower) ||
      tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
      notes.toLowerCase().includes(searchLower);
    
    const matchesStage = stageFilter === 'all' || opportunity.stage_id?.toString() === stageFilter;
    const matchesPriority = priorityFilter === 'all' || opportunity.priority === priorityFilter || opportunity.priorite === priorityFilter;
    const matchesFlag = flagFilter === 'all' || flags.includes(flagFilter);

    return matchesSearch && matchesStage && matchesPriority && matchesFlag;
  });

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

  const getPriorityLabel = (priority?: string) => {
    switch (priority) {
      case 'haute': return 'Haute';
      case 'moyenne': return 'Moyenne';
      case 'basse': return 'Basse';
      default: return 'Non définie';
    }
  };

  const getStageInfo = (stageId?: number) => {
    const stage = pipelineStages.find(s => s.id === stageId);
    return stage || { nom: 'Inconnu', id: 0, ordre: 0, visible: true };
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
          editingOpportunity.companyName, 
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

  const handleAddNote = async () => {
    if (selectedOpportunity && noteContent.trim()) {
      try {
        await addOpportunityNote(selectedOpportunity.id, {
          opportunite_id: selectedOpportunity.id, // ✅ requis par le type
          theme: noteType,
          contenu: noteContent.trim()
        });
        setNoteContent('');
        
        // Récupérer le nom d'affichage pour la notification
        const associatedCompany = companies.find(c => c.id === selectedOpportunity.entreprise_id);
        const displayName = getCompanyDisplayName(
          selectedOpportunity.companyName, 
          associatedCompany?.canonical_url
        );
        
        toast.success(`Note ajoutée à ${displayName}`);
        
        // Refresh selected opportunity (prend la version mise à jour depuis le store)
        const updated = opportunities.find(opp => opp.id === selectedOpportunity.id);
        if (updated) {
          setSelectedOpportunity(updated);
        }
      } catch (error) {
        logger.error('Erreur lors de l\'ajout de la note:', error);
        toast.error('Erreur lors de l\'ajout de la note');
      }
    }
  };

  const handleLeadMagnetToggle = async (opportunityId: string) => {
    try {
      await toggleLeadMagnet(opportunityId);
      
      const opportunity = opportunities.find(opp => opp.id === opportunityId);
      const associatedCompany = companies.find(c => c.id === opportunity?.entreprise_id);
      const displayName = getCompanyDisplayName(
        opportunity?.companyName, 
        associatedCompany?.canonical_url
      );
      
      const isNowActive = !(opportunity?.leadMagnet || opportunity?.lead_magnet);
      toast.success(`Lead magnet ${isNowActive ? 'activé' : 'désactivé'} pour ${displayName}`);
      
      if (selectedOpportunity?.id === opportunityId) {
        const updated = opportunities.find(opp => opp.id === opportunityId);
        if (updated) {
          setSelectedOpportunity(updated);
        }
      }
    } catch (error) {
      logger.error('Erreur lors du toggle lead magnet:', error);
      toast.error('Erreur lors de la modification du lead magnet');
    }
  };

  const getDisplayNameForOpportunity = (opportunity: Opportunity) => {
    const associatedCompany = companies.find(c => c.id === opportunity.entreprise_id);
    return getCompanyDisplayName(opportunity.companyName, associatedCompany?.canonical_url);
  };

  const allKnownTags = React.useMemo(() => {
    const fromData = opportunities.flatMap((opportunity) => parseTags(opportunity.tags));
    return Array.from(new Set(fromData)).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [opportunities]);

  const allKnownFlags = React.useMemo(() => {
    const fromData = opportunities.flatMap((opportunity) => parseFlags(opportunity.flags));
    const defaultFlags = OPPORTUNITY_FLAGS.map((flag) => flag.value);
    return Array.from(new Set([...defaultFlags, ...fromData])).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [opportunities]);

  const getLabelForFlag = (flag: string) => OPPORTUNITY_FLAGS.find((item) => item.value === flag)?.label || flag;

  const addTokenToOpportunity = async (type: KanbanGroupingMode, token: string) => {
    if (!selectedOpportunity) return;
    const cleaned = token.trim();
    if (!cleaned) return;

    if (type === 'flags') {
      const currentFlags = parseFlags(selectedOpportunity.flags);
      if (currentFlags.includes(cleaned)) return;
      await updateOpportunity(selectedOpportunity.id, { flags: [...currentFlags, cleaned] });
      return;
    }

    const currentTags = parseTags(selectedOpportunity.tags);
    if (currentTags.includes(cleaned)) return;
    await updateOpportunity(selectedOpportunity.id, { tags: [...currentTags, cleaned].join(', ') });
  };

  const moveOpportunityInKanban = async (item: KanbanDragItem, targetValue: string) => {
    const opportunity = opportunities.find((opp) => opp.id === item.id);
    if (!opportunity) return;
    if (item.sourceValue === targetValue) return;

    try {
      if (kanbanMode === 'flags') {
        const source = item.sourceValue;
        const nextFlags = parseFlags(opportunity.flags).filter((flag) => source === '__none__' || flag !== source);
        if (targetValue !== '__none__' && !nextFlags.includes(targetValue)) {
          nextFlags.push(targetValue);
        }
        await updateOpportunity(opportunity.id, { flags: nextFlags });
      } else {
        const source = item.sourceValue;
        const nextTags = parseTags(opportunity.tags).filter((tag) => source === '__none__' || tag !== source);
        if (targetValue !== '__none__' && !nextTags.includes(targetValue)) {
          nextTags.push(targetValue);
        }
        await updateOpportunity(opportunity.id, { tags: nextTags.join(', ') });
      }
    } catch (error) {
      logger.error('Erreur déplacement kanban:', error);
      toast.error('Erreur lors du déplacement en kanban');
    }
  };

  const OpportunityCard = ({ opportunity }: { opportunity: Opportunity }) => {
    const stageInfo = getStageInfo(opportunity.stage_id);
    const tags = parseTags(opportunity.tags);
    const displayName = getDisplayNameForOpportunity(opportunity);
    const title = opportunity.name || opportunity.offre_nom_snapshot || displayName;
    const companyAlreadyInTitle = Boolean(
      title &&
      displayName &&
      title.toLowerCase().includes(displayName.toLowerCase())
    );
    const associatedCompany = companies.find((company) => company.id === opportunity.entreprise_id);
    const websiteUrl = normalizeWebsiteUrl(opportunity.companyUrl || associatedCompany?.canonical_url);
    
    return (
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2 space-y-2">
          {/* Titre avec badge en-dessous */}
          <div className="space-y-2">
            <CardTitle className="text-sm md:text-base leading-tight break-words pr-1">
              {title}
            </CardTitle>
            {displayName && !companyAlreadyInTitle && (
              <p className="text-xs text-muted-foreground">Entreprise : {displayName}</p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline" className="text-xs">
                {stageInfo.nom}
              </Badge>
              {opportunity.offre_nom_snapshot && (
                <Badge variant="secondary" className="text-xs">
                  {opportunity.offre_nom_snapshot}
                </Badge>
              )}
              <div className="flex items-center gap-1">
                {getPriorityIcon(opportunity.priorite)}
                <span className="text-xs text-muted-foreground">
                  {getPriorityLabel(opportunity.priorite)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-2 space-y-3">
          {/* Valeur */}
          {(opportunity.value || opportunity.montant) && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 md:h-4 md:w-4 text-green-600 flex-shrink-0" />
              <span className="font-medium text-green-600 text-sm md:text-base">
                {(opportunity.value || opportunity.montant || 0).toLocaleString()}€
              </span>
            </div>
          )}

          {/* Lead Magnet */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1 flex-1">
              <Checkbox 
                checked={opportunity.leadMagnet || opportunity.lead_magnet || false}
                onCheckedChange={() => handleLeadMagnetToggle(opportunity.id)}
              />
              <MagnetIcon className="h-3 w-3 md:h-4 md:w-4 text-pink-600 flex-shrink-0" />
              <span className="text-xs md:text-sm">Lead Magnet</span>
            </div>
            {(opportunity.leadMagnet || opportunity.lead_magnet) && opportunity.leadMagnetCreatedDate && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                ({formatDate(opportunity.leadMagnetCreatedDate)})
              </span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 2).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs px-1 py-0.5">
                  {tag}
                </Badge>
              ))}
              {tags.length > 2 && (
                <Badge variant="secondary" className="text-xs px-1 py-0.5">
                  +{tags.length - 2}
                </Badge>
              )}
            </div>
          )}

          {parseFlags(opportunity.flags).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {parseFlags(opportunity.flags).map((flag) => {
                const found = OPPORTUNITY_FLAGS.find((item) => item.value === flag);
                return (
                  <Badge key={flag} variant="destructive" className="text-xs px-1 py-0.5">{found?.label || flag}</Badge>
                );
              })}
            </div>
          )}

          {/* Dates */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Créé le {formatDate(opportunity.created_at)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Maj le {formatDate(opportunity.updated_at)}</span>
            </div>
          </div>

          {/* Notes et suivi */}
          <div className="space-y-1">
            {opportunity.opportunityNotes && opportunity.opportunityNotes.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <MessageSquare className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {opportunity.opportunityNotes.length} note{opportunity.opportunityNotes.length > 1 ? 's' : ''}
                </span>
              </div>
            )}

            {opportunity.date_prochain_suivi && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Suivi : {formatDate(opportunity.date_prochain_suivi)}</span>
              </div>
            )}
          </div>

          {/* Boutons d'actions */}
          <div className="flex gap-2 pt-2">
            {websiteUrl && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                asChild
                onClick={(event) => event.stopPropagation()}
              >
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-3 w-3 mr-1" />
                  Site
                </a>
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedOpportunity(opportunity)}
              className="flex-1 text-xs"
            >
              Voir
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => handleEditOpportunity(opportunity)}
              className="flex-1 text-xs"
            >
              <Edit className="h-3 w-3 mr-1" />
              Modifier
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const KanbanCard = ({ opportunity, columnValue }: { opportunity: Opportunity; columnValue: string }) => {
    const [{ isDragging }, drag] = useDrag({
      type: KANBAN_ITEM_TYPE,
      item: { id: opportunity.id, sourceValue: columnValue } as KanbanDragItem,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const dragRef = React.useRef<HTMLDivElement>(null);
    drag(dragRef);

    return (
      <div ref={dragRef} style={{ opacity: isDragging ? 0.5 : 1 }}>
        <OpportunityCard opportunity={opportunity} />
      </div>
    );
  };

  const KanbanColumn = ({
    title,
    value,
    items,
  }: {
    title: string;
    value: string;
    items: Opportunity[];
  }) => {
    const [{ isOver }, drop] = useDrop({
      accept: KANBAN_ITEM_TYPE,
      drop: (item: KanbanDragItem) => {
        void moveOpportunityInKanban(item, value);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    });

    const dropRef = React.useRef<HTMLDivElement>(null);
    drop(dropRef);

    return (
      <div
        ref={dropRef}
        className={`w-80 flex-shrink-0 rounded-lg border p-3 ${isOver ? 'border-blue-500 bg-blue-50/30' : ''}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">{title}</h3>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <div className="space-y-3 min-h-20">
          {items.map((opportunity) => (
            <KanbanCard key={opportunity.id} opportunity={opportunity} columnValue={value} />
          ))}
        </div>
      </div>
    );
  };

  const kanbanColumns = React.useMemo(() => {
    const baseValues = kanbanMode === 'flags' ? allKnownFlags : allKnownTags;
    const columns = [
      {
        value: '__none__',
        title: kanbanMode === 'flags' ? 'Sans flag' : 'Sans tag',
        items: filteredOpportunities.filter((opportunity) =>
          kanbanMode === 'flags' ? parseFlags(opportunity.flags).length === 0 : parseTags(opportunity.tags).length === 0
        ),
      },
      ...baseValues.map((value) => ({
        value,
        title: kanbanMode === 'flags' ? getLabelForFlag(value) : value,
        items: filteredOpportunities.filter((opportunity) =>
          kanbanMode === 'flags' ? parseFlags(opportunity.flags).includes(value) : parseTags(opportunity.tags).includes(value)
        ),
      })),
    ];

    return columns;
  }, [allKnownFlags, allKnownTags, filteredOpportunities, kanbanMode]);

  const filteredOpportunityCompanyIds = React.useMemo(() => {
    return Array.from(
      new Set(
        filteredOpportunities
          .map((opportunity) => opportunity.entreprise_id)
          .filter((companyId): companyId is number => typeof companyId === 'number')
      )
    );
  }, [filteredOpportunities]);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Opportunités</h1>
        <p className="text-muted-foreground">
          Gérez toutes vos opportunités commerciales
        </p>
      </div>

      {/* Métriques rapides */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total opportunités</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{opportunities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Valeur totale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">
              {opportunities.reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0).toLocaleString()}€
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lead Magnets créés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-pink-600">
              {opportunities.filter(opp => opp.leadMagnet || opp.lead_magnet).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {opportunities.length > 0 ? Math.round((opportunities.filter(opp => opp.leadMagnet || opp.lead_magnet).length / opportunities.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priorité haute</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-red-600">
              {opportunities.filter(opp => opp.priority === 'high' || opp.priorite === 'haute').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et recherche */}
      <div className="space-y-3 md:space-y-0 md:flex md:flex-wrap md:gap-4 md:items-center md:justify-between">
        <div className="space-y-3 md:space-y-0 md:flex md:gap-4 md:items-center md:flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une opportunité..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-40 md:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Étape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les étapes</SelectItem>
                {pipelineStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id.toString()}>
                    {stage.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-32 md:w-40">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="haute">Haute</SelectItem>
                <SelectItem value="moyenne">Moyenne</SelectItem>
                <SelectItem value="basse">Basse</SelectItem>
              </SelectContent>
            </Select>


            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="w-40 md:w-56">
                <SelectValue placeholder="Flags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les flags</SelectItem>
                {OPPORTUNITY_FLAGS.map((flag) => (
                  <SelectItem key={flag.value} value={flag.value}>{flag.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {viewMode === 'kanban' && (
              <>
                <Select value={kanbanMode} onValueChange={(value: KanbanGroupingMode) => setKanbanMode(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Mode kanban" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flags">Kanban par flags</SelectItem>
                    <SelectItem value="tags">Kanban par tags</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder={kanbanMode === 'flags' ? 'Nouveau flag...' : 'Nouveau tag...'}
                    value={kanbanMode === 'flags' ? newFlagName : newTagName}
                    onChange={(event) => {
                      if (kanbanMode === 'flags') {
                        setNewFlagName(event.target.value);
                        return;
                      }
                      setNewTagName(event.target.value);
                    }}
                    className="w-44"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (kanbanMode === 'flags') {
                        await addTokenToOpportunity('flags', newFlagName);
                        setNewFlagName('');
                        return;
                      }
                      await addTokenToOpportunity('tags', newTagName);
                      setNewTagName('');
                    }}
                    disabled={!selectedOpportunity || !(kanbanMode === 'flags' ? newFlagName.trim() : newTagName.trim())}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Toggle grille/liste/kanban */}
        <div className="flex border rounded-lg">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="rounded-r-none"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-none"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('kanban')}
            className="rounded-none"
          >
            <Columns3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'cold_call' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('cold_call')}
            className="rounded-l-none"
            title="Mode cold call"
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Liste des opportunités */}
      {viewMode === 'cold_call' ? (
        <QualifiedColdCallWorkspace includeOnlyQualified={false} scopedCompanyIds={filteredOpportunityCompanyIds} />
      ) : viewMode !== 'kanban' ? (
        <div className={viewMode === 'grid' ? 'grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
          {filteredOpportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      ) : (
        <DndProvider backend={HTML5Backend}>
          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4" style={{ minWidth: `${Math.max(kanbanColumns.length, 3) * 320}px` }}>
              {kanbanColumns.map((column) => (
                <KanbanColumn key={column.value} title={column.title} value={column.value} items={column.items} />
              ))}
            </div>
          </div>
        </DndProvider>
      )}

      {viewMode !== 'cold_call' && filteredOpportunities.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 md:py-12">
            <Target className="h-8 w-8 md:h-12 md:w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-medium mb-2 text-sm md:text-base">Aucune opportunité trouvée</h3>
            <p className="text-muted-foreground text-xs md:text-sm">
              {searchTerm || stageFilter !== 'all' || priorityFilter !== 'all' || flagFilter !== 'all' 
                ? 'Modifiez vos filtres ou créez une nouvelle opportunité'
                : 'Qualifiez des entreprises pour créer des opportunités'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Modal de détail */}
      <Dialog open={!!selectedOpportunity} onOpenChange={() => setSelectedOpportunity(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Opportunité : {selectedOpportunity ? getDisplayNameForOpportunity(selectedOpportunity) : ''}
            </DialogTitle>
            <DialogDescription>Détails et actions</DialogDescription>
          </DialogHeader>

          {selectedOpportunity && (
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList>
                <TabsTrigger value="details">Détails</TabsTrigger>
                <TabsTrigger value="notes">Notes ({(selectedOpportunity.opportunityNotes ?? []).length})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Étape actuelle</label>
                    <div className="mt-1">
                      <Badge variant="outline">
                        {getStageInfo(selectedOpportunity.stage_id).nom}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Priorité</label>
                    <div className="flex items-center gap-2 mt-1">
                      {getPriorityIcon(selectedOpportunity.priorite)}
                      <span>{getPriorityLabel(selectedOpportunity.priorite)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Valeur</label>
                    <div className="mt-1">
                      {(selectedOpportunity.value || selectedOpportunity.montant) ? 
                        `${(selectedOpportunity.value || selectedOpportunity.montant || 0).toLocaleString()}€` : 
                        'Non définie'
                      }
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Lead Magnet</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Checkbox 
                        checked={selectedOpportunity.leadMagnet || selectedOpportunity.lead_magnet || false}
                        onCheckedChange={() => handleLeadMagnetToggle(selectedOpportunity.id)}
                      />
                      <MagnetIcon className="h-4 w-4 text-pink-600" />
                      <span className="text-sm">
                        {(selectedOpportunity.leadMagnet || selectedOpportunity.lead_magnet) ? 'Créé' : 'Non créé'}
                      </span>
                      {(selectedOpportunity.leadMagnet || selectedOpportunity.lead_magnet) && selectedOpportunity.leadMagnetCreatedDate && (
                        <span className="text-xs text-muted-foreground">
                          ({formatDate(selectedOpportunity.leadMagnetCreatedDate)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedOpportunity.tags ? 
                      parseTags(selectedOpportunity.tags).map((tag, index) => (
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

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Actions commerciales</label>
                    <JournalActionButtons
                      opportunite_id={selectedOpportunity.id}
                      entreprise_id={selectedOpportunity.entreprise_id}
                      companyName={getDisplayNameForOpportunity(selectedOpportunity)}
                      size="sm"
                      variant="outline"
                      showLabels={true}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={() => handleEditOpportunity(selectedOpportunity)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Modifier
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                {/* Widget d'activité */}
                <JournalStatsWidget
                  opportunite_id={selectedOpportunity.id}
                  entreprise_id={selectedOpportunity.entreprise_id}
                  showAddActions={false}
                />
                
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Select
                      value={noteType}
                      onValueChange={(value: 'appel' | 'linkedin' | 'whatsapp' | 'email' | 'autre') => setNoteType(value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appel">Appel</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Ajouter une note..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      className="flex-1"
                    />
                    <Button onClick={handleAddNote} disabled={!noteContent.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* ✅ Sécurisation du tableau de notes */}
                {(() => {
                  const notes = selectedOpportunity.opportunityNotes ?? [];
                  return (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {notes.length > 0 ? (
                        notes
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((note) => (
                            <div key={note.id} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline">{note.theme}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(note.created_at)}
                                </span>
                              </div>
                              <p className="text-sm">{note.contenu}</p>
                            </div>
                          ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Aucune note pour cette opportunité</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal d'édition */}
      <Dialog open={!!editingOpportunity} onOpenChange={() => setEditingOpportunity(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier l'opportunité</DialogTitle>
            <DialogDescription>
              Modifiez les détails de cette opportunité commerciale
            </DialogDescription>
          </DialogHeader>

          {editingOpportunity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label htmlFor="value">Valeur (€)</Label>
                  <Input
                    id="value"
                    type="number"
                    value={editingOpportunity.montant ?? ''}
                    onChange={(e) => setEditingOpportunity({
                      ...editingOpportunity,
                      montant: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="leadMagnet">Lead Magnet</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox 
                    checked={editingOpportunity.lead_magnet || false}
                    onCheckedChange={(checked) => setEditingOpportunity({
                      ...editingOpportunity,
                      lead_magnet: !!checked,
                      leadMagnetCreatedDate: checked ? new Date().toISOString().split('T')[0] : undefined
                    })}
                  />
                  <MagnetIcon className="h-4 w-4 text-pink-600" />
                  <span className="text-sm">Lead magnet créé</span>
                </div>
              </div>
              
              <div>
                <Label>Flags</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {allKnownFlags.map((flag) => {
                    const activeFlags = parseFlags(editingOpportunity.flags);
                    const isActive = activeFlags.includes(flag);
                    return (
                      <label key={flag} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={isActive}
                          onCheckedChange={(checked) => {
                            const shouldEnable = checked === true;
                            const next = shouldEnable
                              ? Array.from(new Set([...activeFlags, flag]))
                              : activeFlags.filter((current) => current !== flag);
                            setEditingOpportunity({ ...editingOpportunity, flags: next });
                          }}
                        />
                        {getLabelForFlag(flag)}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    placeholder="Ajouter un nouveau flag..."
                    value={newEditFlagName}
                    onChange={(event) => setNewEditFlagName(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const cleaned = newEditFlagName.trim();
                      if (!cleaned) return;
                      const activeFlags = parseFlags(editingOpportunity.flags);
                      setEditingOpportunity({
                        ...editingOpportunity,
                        flags: Array.from(new Set([...activeFlags, cleaned])),
                      });
                      setNewEditFlagName('');
                    }}
                  >
                    Ajouter
                  </Button>
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
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingOpportunity(null)}>
                  Annuler
                </Button>
                <Button onClick={handleSaveOpportunity}>
                  Sauvegarder
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
