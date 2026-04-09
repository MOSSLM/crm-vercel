"use client";

import React, { useState, useEffect } from 'react';
import { useAppData } from './AppDataContext';
import { Company, EmployeeBand, Opportunity, RevenueBand } from '@/types';
import { companiesApi } from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { EmployeesList } from './EmployeesList';
import { JournalStatsWidget } from './JournalStatsWidget';
import { JournalActionButtons } from './JournalActionButtons';
import { toast } from "sonner";
import { 
  ArrowLeft,
  Save,
  Globe,
  Phone,
  MapPin,
  Building,
  CheckCircle,
  Edit3,
  Eye,
  Users,
  DollarSign,
  Calendar,
  Database,
  ExternalLink,
  Briefcase,
  Loader2,
  Plus,
  Target,
  Edit2,
  Trash2,
  X
} from 'lucide-react';

import logger from '../utils/logger';
import { formatServiceTag, normalizeServiceTags } from '../utils/serviceTags';
interface CompanyDetailPageProps {
  companyId: number;
  onBack: () => void;
}

/* ---------------------------------------------
   ✅ Enums: listes autorisées + convertisseurs
---------------------------------------------- */
const REVENUE_BANDS = [
  'unknown','0-100k','100k-500k','500k-1m','1m-5m','5m-10m','10m-50m','50m+',
] as const satisfies readonly RevenueBand[];

const EMPLOYEE_BANDS = [
  'unknown','1-10','11-50','51-200','201-500','501-1000','1000+',
] as const satisfies readonly EmployeeBand[];

function fromDbEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const normalized = (value ?? '').replace(/_/g, '-') as string;
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

const fromDbRevenueBand = (v?: string): RevenueBand =>
  fromDbEnum<RevenueBand>(v, REVENUE_BANDS, 'unknown');

const fromDbEmployeeBand = (v?: string): EmployeeBand =>
  fromDbEnum<EmployeeBand>(v, EMPLOYEE_BANDS, 'unknown');


// Helper functions for display labels
const getRevenueBandLabel = (band: RevenueBand | undefined): string => {
  if (!band) return 'Non renseigné';
  const normalizedBand = band.replace(/_/g, '-') as RevenueBand;
  const labels: Record<RevenueBand, string> = {
    'unknown': 'Non renseigné',
    '0-100k': '0 - 100K €',
    '100k-500k': '100K - 500K €', 
    '500k-1m': '500K - 1M €',
    '1m-5m': '1M - 5M €',
    '5m-10m': '5M - 10M €',
    '10m-50m': '10M - 50M €',
    '50m+': '50M+ €'
  };
  return labels[normalizedBand] || band;
};

const getEmployeeBandLabel = (band: EmployeeBand | undefined): string => {
  if (!band) return 'Non renseigné';
  const normalizedBand = band.replace(/_/g, '-') as EmployeeBand;
  const labels: Record<EmployeeBand, string> = {
    'unknown': 'Non renseigné',
    '1-10': '1-10 employés',
    '11-50': '11-50 employés',
    '51-200': '51-200 employés',
    '201-500': '201-500 employés',
    '501-1000': '501-1000 employés',
    '1000+': '1000+ employés'
  };
  return labels[normalizedBand] || band;
};

export const CompanyDetailPage: React.FC<CompanyDetailPageProps> = ({ companyId, onBack }) => {
  const { companies, updateCompany, opportunities, pipelineStages, addOpportunity, updateOpportunity } = useAppData();
  const [company, setCompany] = useState<Company | null>(null);
  const [detailedCompany, setDetailedCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  
  // Opportunity management state
  const [showCreateOpportunity, setShowCreateOpportunity] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [opportunityForm, setOpportunityForm] = useState({
    name: '',
    montant: '',
    priorite: 'moyenne' as 'haute' | 'moyenne' | 'basse',
    stage_id: '',
    type: 'one_shot' as 'one_shot' | 'mrr',
    mrr: '',
    recurrence_months: '',
    note_base: '',
    lead_magnet: false
  });
  
  // Enhanced form data with new fields
  const [formData, setFormData] = useState({
    name: '',
    canonical_url: '',
    adresse: '',
    premiers_tags: '',
    service_tags: [] as string[],
    lat: 0,
    lng: 0,
    qualifie: false,
    ca_estime_band: 'unknown' as RevenueBand,
    nb_employes_band: 'unknown' as EmployeeBand,
    nb_employes_exact: '',
    linkedin_url: '',
    manually_enriched: false
  });
  const [newServiceTag, setNewServiceTag] = useState('');

  useEffect(() => {
    const foundCompany = companies.find(c => c.id === companyId);
    if (foundCompany) {
      setCompany(foundCompany);
      setFormData({
        name: foundCompany.name || '',
        canonical_url: foundCompany.canonical_url || '',
        adresse: foundCompany.adresse || '',
        premiers_tags: foundCompany.premiers_tags || '',
        service_tags: normalizeServiceTags(foundCompany.service_tags, foundCompany.premiers_tags),
        lat: foundCompany.lat || 0,
        lng: foundCompany.lng || 0,
        qualifie: foundCompany.qualifie || false,
        ca_estime_band: fromDbRevenueBand(foundCompany.ca_estime_band as unknown as string | undefined),
        nb_employes_band: fromDbEmployeeBand(foundCompany.nb_employes_band as unknown as string | undefined),
        nb_employes_exact: foundCompany.nb_employes_exact?.toString() || '',
        linkedin_url: foundCompany.linkedin_url || '',
        manually_enriched: foundCompany.manually_enriched || false
      });
      
      // Load detailed company data with raw contact info
      loadDetailedCompanyData(foundCompany.id);
    }
  }, [companyId, companies]);

  const loadDetailedCompanyData = async (id: number) => {
    setLoadingDetails(true);
    try {
      const detailed = await companiesApi.getById(id);
      setDetailedCompany(detailed as Company);
    } catch (error) {
      logger.error('Error loading detailed company data:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSave = async () => {
    if (!company) return;
    
    setIsLoading(true);
    try {
      // Prepare updates with proper type conversion and enum format conversion
      const updates: Partial<Company> = {
        ...formData,
        nb_employes_exact: formData.nb_employes_exact ? parseInt(formData.nb_employes_exact) : undefined,
        manually_enriched: formData.manually_enriched,
        enriched_at: formData.manually_enriched ? new Date().toISOString() : undefined,
        ca_estime_band: formData.ca_estime_band,
        nb_employes_band: formData.nb_employes_band
      };

      await updateCompany(company.id, updates);
      setIsEditing(false);
      toast.success("Entreprise mise à jour avec succès");
      
      // Reload detailed data
      await loadDetailedCompanyData(company.id);
    } catch (error) {
      logger.error('Erreur lors de la mise à jour:', error);
      toast.error("Erreur lors de la mise à jour de l'entreprise");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (company) {
      setFormData({
        name: company.name || '',
        canonical_url: company.canonical_url || '',
        adresse: company.adresse || '',
        premiers_tags: company.premiers_tags || '',
        service_tags: normalizeServiceTags(company.service_tags, company.premiers_tags),
        lat: company.lat || 0,
        lng: company.lng || 0,
        qualifie: company.qualifie || false,
        ca_estime_band: fromDbRevenueBand(company.ca_estime_band as unknown as string | undefined),
        nb_employes_band: fromDbEmployeeBand(company.nb_employes_band as unknown as string | undefined),
        nb_employes_exact: company.nb_employes_exact?.toString() || '',
        linkedin_url: company.linkedin_url || '',
        manually_enriched: company.manually_enriched || false
      });
    }
    setIsEditing(false);
  };

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addServiceTag = (tagValue: string) => {
    const trimmed = tagValue.trim();
    if (!trimmed) return;
    const normalized = formatServiceTag(trimmed);

    setFormData((prev) => {
      const hasTag = prev.service_tags.some((tag) => formatServiceTag(tag) === normalized);
      if (hasTag) return prev;
      return {
        ...prev,
        service_tags: [...prev.service_tags, trimmed],
      };
    });
    setNewServiceTag('');
  };

  const removeServiceTag = (tagToRemove: string) => {
    const normalizedToRemove = formatServiceTag(tagToRemove);
    setFormData((prev) => ({
      ...prev,
      service_tags: prev.service_tags.filter((tag) => formatServiceTag(tag) !== normalizedToRemove),
    }));
  };

  // Opportunity management functions
  const getCompanyOpportunities = () => {
    return opportunities.filter(opp => opp.entreprise_id === companyId);
  };

  const handleCreateOpportunity = () => {
    const defaultStage = pipelineStages.find(stage => stage.ordre === 1) || pipelineStages[0];
    setOpportunityForm({
      name: '',
      montant: '2500',
      priorite: 'moyenne',
      stage_id: defaultStage?.id?.toString() || '',
      type: 'one_shot',
      mrr: '',
      recurrence_months: '',
      note_base: '',
      lead_magnet: false
    });
    setEditingOpportunity(null);
    setShowCreateOpportunity(true);
  };

  const handleEditOpportunity = (opportunity: Opportunity) => {
    setOpportunityForm({
      name: opportunity.name || '',
      montant: opportunity.montant?.toString() || '',
      priorite: opportunity.priorite,
      stage_id: opportunity.stage_id?.toString() || '',
      type: opportunity.type || 'one_shot',
      mrr: opportunity.mrr?.toString() || '',
      recurrence_months: opportunity.recurrence_months?.toString() || '',
      note_base: opportunity.note_base || '',
      lead_magnet: opportunity.lead_magnet || false
    });
    setEditingOpportunity(opportunity);
    setShowCreateOpportunity(true);
  };

  const handleSaveOpportunity = async () => {
    if (!company) return;

    try {
        const opportunityData: Omit<Opportunity, 'created_at' | 'id' | 'updated_at'> = {
          entreprise_id: company.id,
          name: opportunityForm.name,
          montant: parseFloat(opportunityForm.montant) || 0,
          priorite: opportunityForm.priorite,
          stage_id: parseInt(opportunityForm.stage_id),
          type: opportunityForm.type,
          note_base: opportunityForm.note_base,
          lead_magnet: opportunityForm.lead_magnet
        };

      if (opportunityForm.type === 'mrr') {
        opportunityData.mrr = parseFloat(opportunityForm.mrr) || 0;
        opportunityData.recurrence_months = parseInt(opportunityForm.recurrence_months) || 12;
      }

      if (editingOpportunity) {
        await updateOpportunity(editingOpportunity.id, opportunityData);
        toast.success('Opportunité mise à jour avec succès');
      } else {
        await addOpportunity(opportunityData);
        toast.success('Opportunité créée avec succès');
      }

      setShowCreateOpportunity(false);
      setEditingOpportunity(null);
    } catch (error) {
      logger.error('Error saving opportunity:', error);
      toast.error('Erreur lors de la sauvegarde de l\'opportunité');
    }
  };

  const getStageName = (stageId: number) => {
    const stage = pipelineStages.find(s => s.id === stageId);
    return stage?.nom || 'Étape inconnue';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'haute': return 'text-red-600';
      case 'moyenne': return 'text-yellow-600';
      case 'basse': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'haute': return 'Haute';
      case 'moyenne': return 'Moyenne';
      case 'basse': return 'Basse';
      default: return priority;
    }
  };

  if (!company) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </div>
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3>Entreprise non trouvée</h3>
          <p className="text-muted-foreground">
            L'entreprise demandée n'existe pas ou n'est plus disponible.
          </p>
        </div>
      </div>
    );
  }

  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
  const serviceTags = normalizeServiceTags(company.service_tags, company.premiers_tags);
  const allServiceTags = Array.from(
    new Set(
      companies.flatMap((item) => normalizeServiceTags(item.service_tags, item.premiers_tags))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const currentData = isEditing ? formData : {
    name: company.name,
    canonical_url: company.canonical_url,
    adresse: company.adresse,
    premiers_tags: company.premiers_tags,
    service_tags: serviceTags,
    lat: company.lat,
    lng: company.lng,
    qualifie: company.qualifie,
    ca_estime_band: fromDbRevenueBand(company.ca_estime_band as unknown as string | undefined),
    nb_employes_band: fromDbEmployeeBand(company.nb_employes_band as unknown as string | undefined),
    nb_employes_exact: company.nb_employes_exact,
    linkedin_url: company.linkedin_url,
    manually_enriched: company.manually_enriched
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          {company.logo_url && (
            <img src={company.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0 border" />
          )}
          <div>
            <h1 className="flex items-center gap-2">
              {displayName}
              {company.qualifie && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              {company.manually_enriched && (
                <Badge variant="outline" className="ml-2">
                  <Database className="h-3 w-3 mr-1" />
                  Enrichi
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground">
              Détails de l'entreprise • ID: {company.id}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit3 className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-4 lg:grid-cols-3">
        {/* Informations principales */}
        <div className="xl:col-span-3 lg:col-span-2 space-y-6">
          {/* Informations générales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Informations générales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="canonical_url">Site web</Label>
                  {isEditing ? (
                    <Input
                      id="canonical_url"
                      value={currentData.canonical_url || ''}
                      onChange={(e) => handleInputChange('canonical_url', e.target.value)}
                      placeholder="https://..."
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      {currentData.canonical_url ? (
                        <a 
                          href={currentData.canonical_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <Globe className="h-3 w-3" />
                          {currentData.canonical_url}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">Non renseigné</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="linkedin_url">LinkedIn entreprise</Label>
                  {isEditing ? (
                    <Input
                      id="linkedin_url"
                      value={currentData.linkedin_url || ''}
                      onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                      placeholder="https://linkedin.com/company/..."
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      {currentData.linkedin_url ? (
                        <a 
                          href={currentData.linkedin_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          LinkedIn
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">Non renseigné</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="adresse">Adresse</Label>
                {isEditing ? (
                  <Textarea
                    id="adresse"
                    value={currentData.adresse || ''}
                    onChange={(e) => handleInputChange('adresse', e.target.value)}
                    placeholder="Adresse complète"
                    rows={2}
                  />
                ) : (
                  <p className="text-sm p-2 bg-muted rounded">
                    {currentData.adresse || 'Non renseignée'}
                  </p>
                )}
              </div>

              <div>
                <Label>Tags de services</Label>
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1 p-2 bg-muted rounded min-h-10">
                      {currentData.service_tags.length > 0 ? (
                        currentData.service_tags.map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs flex items-center gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeServiceTag(tag)}
                              className="hover:text-red-600"
                              aria-label={`Retirer ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Aucun tag</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        value={newServiceTag}
                        onChange={(e) => setNewServiceTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addServiceTag(newServiceTag);
                          }
                        }}
                        placeholder="Ex: climatisation, photovoltaïque..."
                      />
                      <Button type="button" variant="outline" onClick={() => addServiceTag(newServiceTag)}>
                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                      </Button>
                    </div>

                    {allServiceTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allServiceTags
                          .filter((tag) => !currentData.service_tags.some((selectedTag) => formatServiceTag(selectedTag) === formatServiceTag(tag)))
                          .slice(0, 12)
                          .map((tag) => (
                            <Button
                              key={tag}
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => addServiceTag(tag)}
                            >
                              + {tag}
                            </Button>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 p-2 bg-muted rounded">
                    {serviceTags.length > 0 ? (
                      serviceTags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">Aucun tag</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="qualifie">Entreprise qualifiée</Label>
                {isEditing ? (
                  <Switch
                    id="qualifie"
                    checked={currentData.qualifie || false}
                    onCheckedChange={(checked) => handleInputChange('qualifie', checked)}
                  />
                ) : (
                  <Badge variant={currentData.qualifie ? 'default' : 'secondary'}>
                    {currentData.qualifie ? 'Qualifiée' : 'Non qualifiée'}
                  </Badge>
                )}
              </div>

              {/* Coordonnées GPS (lecture seule) */}
              {(company.lat || company.lng) && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Latitude</Label>
                    <p className="text-sm p-2 bg-muted rounded">
                      {company.lat || 'Non renseignée'}
                    </p>
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <p className="text-sm p-2 bg-muted rounded">
                      {company.lng || 'Non renseignée'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Informations commerciales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Informations commerciales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="ca_estime_band">Chiffre d'affaires estimé</Label>
                  {isEditing ? (
                    <Select 
                      value={currentData.ca_estime_band || 'unknown'}
                      onValueChange={(value) => handleInputChange('ca_estime_band', value as RevenueBand)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Non renseigné</SelectItem>
                        <SelectItem value="0-100k">0 - 100K €</SelectItem>
                        <SelectItem value="100k-500k">100K - 500K €</SelectItem>
                        <SelectItem value="500k-1m">500K - 1M €</SelectItem>
                        <SelectItem value="1m-5m">1M - 5M €</SelectItem>
                        <SelectItem value="5m-10m">5M - 10M €</SelectItem>
                        <SelectItem value="10m-50m">10M - 50M €</SelectItem>
                        <SelectItem value="50m+">50M+ €</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded">
                      {getRevenueBandLabel(currentData.ca_estime_band)}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="nb_employes_band">Tranche d'employés</Label>
                  {isEditing ? (
                    <Select 
                      value={currentData.nb_employes_band || 'unknown'}
                      onValueChange={(value) => handleInputChange('nb_employes_band', value as EmployeeBand)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Non renseigné</SelectItem>
                        <SelectItem value="1-10">1-10 employés</SelectItem>
                        <SelectItem value="11-50">11-50 employés</SelectItem>
                        <SelectItem value="51-200">51-200 employés</SelectItem>
                        <SelectItem value="201-500">201-500 employés</SelectItem>
                        <SelectItem value="501-1000">501-1000 employés</SelectItem>
                        <SelectItem value="1000+">1000+ employés</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded">
                      {getEmployeeBandLabel(currentData.nb_employes_band)}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="nb_employes_exact">Nombre exact d'employés</Label>
                {isEditing ? (
                  <Input
                    id="nb_employes_exact"
                    type="number"
                    value={currentData.nb_employes_exact || ''}
                    onChange={(e) => handleInputChange('nb_employes_exact', e.target.value)}
                    placeholder="Nombre exact d'employés"
                  />
                ) : (
                  <p className="text-sm p-2 bg-muted rounded">
                    {currentData.nb_employes_exact || 'Non renseigné'}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="manually_enriched">Enrichissement manuel</Label>
                {isEditing ? (
                  <Switch
                    id="manually_enriched"
                    checked={currentData.manually_enriched || false}
                    onCheckedChange={(checked) => handleInputChange('manually_enriched', checked)}
                  />
                ) : (
                  <Badge variant={currentData.manually_enriched ? 'default' : 'secondary'}>
                    {currentData.manually_enriched ? 'Enrichi manuellement' : 'Données automatiques'}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Informations de contact depuis les données raw */}
          {loadingDetails ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Informations de contact
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Chargement des informations de contact...
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Informations de contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {detailedCompany && detailedCompany.telephone ? (
                  <div>
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Téléphone
                    </Label>
                    <p className="text-sm p-2 bg-muted rounded">
                      <a href={`tel:${detailedCompany.telephone}`} className="text-blue-600 hover:underline">
                        {detailedCompany.telephone}
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      <strong>Aucun numéro de téléphone disponible</strong><br />
                      Vous pouvez renseigner cette information manuellement ou ajouter des contacts ci-dessous.
                    </p>
                  </div>
                )}

                {Array.isArray(detailedCompany?.sources) && detailedCompany.sources.length > 0 && (
                  <div className="mt-4">
                    <Label>Sources des données</Label>
                    <div className="flex gap-2 flex-wrap mt-2">
                      {detailedCompany.sources.map((source, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {source === 'google_maps'
                            ? 'Google Maps'
                            : source === 'google_search'
                              ? 'Google Search'
                              : source === 'manual'
                                ? 'Saisie manuelle'
                                : source}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Employés de l'entreprise */}
          <EmployeesList
            companyId={company.id}
            companyName={displayName}
          />

          {/* Opportunités liées à l'entreprise */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Opportunités ({getCompanyOpportunities().length})
                </CardTitle>
                <Button onClick={handleCreateOpportunity} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle opportunité
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {getCompanyOpportunities().length > 0 ? (
                <div className="space-y-3">
                  {getCompanyOpportunities().map((opportunity) => (
                    <div key={opportunity.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{opportunity.name || 'Opportunité sans nom'}</h4>
                            <Badge variant="outline" className={getPriorityColor(opportunity.priorite)}>
                              {getPriorityLabel(opportunity.priorite)}
                            </Badge>
                            {opportunity.lead_magnet && (
                              <Badge variant="secondary">Lead Magnet</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Étape: {getStageName(opportunity.stage_id || 0)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditOpportunity(opportunity)}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Modifier
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid gap-2 md:grid-cols-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Valeur</Label>
                          <p className="text-sm">
                            {opportunity.type === 'mrr' && opportunity.mrr ? 
                              `${opportunity.mrr.toLocaleString()}€/mois` :
                              `${(opportunity.montant || 0).toLocaleString()}€`
                            }
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Type</Label>
                          <p className="text-sm">
                            {opportunity.type === 'mrr' ? 'Récurrent (MRR)' : 'Ponctuel'}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Dernière mise à jour</Label>
                          <p className="text-sm">
                            {opportunity.updated_at ? 
                              new Date(opportunity.updated_at).toLocaleDateString('fr-FR') : 
                              'N/A'
                            }
                          </p>
                        </div>
                      </div>
                      
                      {opportunity.note_base && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Notes</Label>
                          <p className="text-sm bg-muted p-2 rounded mt-1">{opportunity.note_base}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">Aucune opportunité</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Cette entreprise n'a pas encore d'opportunités associées.
                  </p>
                  <Button onClick={handleCreateOpportunity} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer la première opportunité
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar avec informations complémentaires */}
        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Source</span>
                <div className="flex flex-col gap-1">
                  {company.sources?.map((source, index) => (
                    <Badge key={index} variant={source === 'google_maps' ? 'default' : 'secondary'} className="text-xs">
                      {source === 'google_maps' ? 'Google Maps' : 'Google Search'}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Qualification</span>
                <Badge variant={company.qualifie ? 'default' : 'secondary'}>
                  {company.qualifie ? 'Qualifiée' : 'Non qualifiée'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Enrichissement</span>
                <Badge variant={company.manually_enriched ? 'default' : 'outline'}>
                  {company.manually_enriched ? 'Manuel' : 'Automatique'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Date de création</span>
                <span className="text-sm">{new Date(company.created_at).toLocaleDateString()}</span>
              </div>

              {company.enriched_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Enrichi le</span>
                  <span className="text-sm">{new Date(company.enriched_at).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métriques */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Métriques
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">CA estimé</span>
                <Badge variant="outline">
                  {getRevenueBandLabel(fromDbRevenueBand(company.ca_estime_band as unknown as string | undefined))}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Employés</span>
                <div className="text-right">
                  <Badge variant="outline">
                    {getEmployeeBandLabel(fromDbEmployeeBand(company.nb_employes_band as unknown as string | undefined))}
                  </Badge>
                  {company.nb_employes_exact && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Exact: {company.nb_employes_exact}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Journal d'activité */}
          <JournalStatsWidget
            entreprise_id={company.id}
            showAddActions={true}
          />

          {/* Boutons d'actions rapides pour le journal */}
          <Card>
            <CardHeader>
              <CardTitle>Actions commerciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <JournalActionButtons
                entreprise_id={company.id}
                companyName={displayName}
                size="sm"
                variant="outline"
                showLabels={true}
              />
            </CardContent>
          </Card>

          {/* Actions rapides */}
          <Card>
            <CardHeader>
              <CardTitle>Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(company.canonical_url) && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={company.canonical_url} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    Visiter le site web
                  </a>
                </Button>
              )}

              {company.linkedin_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Voir sur LinkedIn
                  </a>
                </Button>
              )}
              
              {company.lat && company.lng && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a 
                    href={`https://www.google.com/maps?q=${company.lat},${company.lng}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Voir sur la carte
                  </a>
                </Button>
              )}

              {detailedCompany?.telephone && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`tel:${detailedCompany.telephone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Appeler
                  </a>
                </Button>
              )}

            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal pour créer/modifier une opportunité */}
      <Dialog open={showCreateOpportunity} onOpenChange={setShowCreateOpportunity}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingOpportunity ? 'Modifier l\'opportunité' : 'Nouvelle opportunité'}
            </DialogTitle>
            <DialogDescription>
              {editingOpportunity ? 
                'Modifiez les informations de cette opportunité.' :
                `Créer une nouvelle opportunité pour ${displayName}.`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="opportunity-name">Nom de l'opportunité *</Label>
              <Input
                id="opportunity-name"
                value={opportunityForm.name}
                onChange={(e) => setOpportunityForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Refonte de site web, Création e-commerce..."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="opportunity-type">Type d'opportunité</Label>
                <Select 
                  value={opportunityForm.type}
                  onValueChange={(value: 'one_shot' | 'mrr') => 
                    setOpportunityForm(prev => ({ ...prev, type: value }))
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

              <div>
                <Label htmlFor="opportunity-priority">Priorité</Label>
                <Select 
                  value={opportunityForm.priorite}
                  onValueChange={(value: 'haute' | 'moyenne' | 'basse') => 
                    setOpportunityForm(prev => ({ ...prev, priorite: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="haute">Haute</SelectItem>
                    <SelectItem value="moyenne">Moyenne</SelectItem>
                    <SelectItem value="basse">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {opportunityForm.type === 'mrr' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="opportunity-mrr">Valeur mensuelle (€) *</Label>
                  <Input
                    id="opportunity-mrr"
                    type="number"
                    value={opportunityForm.mrr}
                    onChange={(e) => setOpportunityForm(prev => ({ ...prev, mrr: e.target.value }))}
                    placeholder="Ex: 500"
                  />
                </div>
                <div>
                  <Label htmlFor="opportunity-months">Durée (mois)</Label>
                  <Input
                    id="opportunity-months"
                    type="number"
                    value={opportunityForm.recurrence_months}
                    onChange={(e) => setOpportunityForm(prev => ({ ...prev, recurrence_months: e.target.value }))}
                    placeholder="12"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="opportunity-amount">Montant (€) *</Label>
                <Input
                  id="opportunity-amount"
                  type="number"
                  value={opportunityForm.montant}
                  onChange={(e) => setOpportunityForm(prev => ({ ...prev, montant: e.target.value }))}
                  placeholder="Ex: 2500"
                />
              </div>
            )}

            <div>
              <Label htmlFor="opportunity-stage">Étape du pipeline</Label>
              <Select 
                value={opportunityForm.stage_id}
                onValueChange={(value) => setOpportunityForm(prev => ({ ...prev, stage_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une étape" />
                </SelectTrigger>
                <SelectContent>
                  {pipelineStages
                    .sort((a, b) => a.ordre - b.ordre)
                    .map((stage) => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        {stage.nom}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="opportunity-notes">Notes</Label>
              <Textarea
                id="opportunity-notes"
                value={opportunityForm.note_base}
                onChange={(e) => setOpportunityForm(prev => ({ ...prev, note_base: e.target.value }))}
                placeholder="Ajoutez des notes sur cette opportunité..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="opportunity-lead-magnet">Lead Magnet</Label>
              <Switch
                id="opportunity-lead-magnet"
                checked={opportunityForm.lead_magnet}
                onCheckedChange={(checked) => 
                  setOpportunityForm(prev => ({ ...prev, lead_magnet: checked }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowCreateOpportunity(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveOpportunity}>
              {editingOpportunity ? 'Mettre à jour' : 'Créer l\'opportunité'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
