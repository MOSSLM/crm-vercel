"use client";

import React, { useState } from 'react';
import { useAppData, RevenueBand, EmployeeBand, Opportunity } from './AppDataContext';
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
import { CompanyInfoForm } from './company/CompanyInfoForm';
import { useCompanyDetail } from '../hooks/useCompanyDetail';
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Save, 
 
  Phone, 
  Mail, 
  MapPin, 
  Building,
  CheckCircle,
  Edit3,
  Eye,
  DollarSign,
  Database,
  ExternalLink,
  User,
  Briefcase,
  Loader2,
  Plus,
  Target,
  Edit2,
} from 'lucide-react';

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

const toDbRevenueBand = (v: RevenueBand): string => v.replace(/-/g, '_');
const toDbEmployeeBand = (v: EmployeeBand): string => v.replace(/-/g, '_');

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

  const {
    company,
    detailedCompany,
    formData,
    setFormData,
    isEditing,
    setIsEditing,
    isLoading,
    loadingDetails,
    save,
  } = useCompanyDetail(companyId, companies, updateCompany);

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
  

  const handleCancel = () => {
    if (company) {
      setFormData({
        name: company.name || '',
        canonical_url: company.canonical_url || '',
        adresse: company.adresse || '',
        premiers_tags: company.premiers_tags || '',
        lat: company.lat || 0,
        lng: company.lng || 0,
        qualifie: company.qualifie || false,
        ca_estime_band: fromDbRevenueBand(company.ca_estime_band as unknown as string | undefined),
        nb_employes_band: fromDbEmployeeBand(company.nb_employes_band as unknown as string | undefined),
        nb_employes_exact: company.nb_employes_exact?.toString() || '',
        linkedin_url: company.linkedin_url || '',
        site_web_canonique: company.site_web_canonique || '',
        manually_enriched: company.manually_enriched || false
      });
    }
    setIsEditing(false);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
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
      const opportunityData: any = {
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
      console.error('Error saving opportunity:', error);
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

  const displayName = getCompanyDisplayName(company.name, company.canonical_url);  const currentData = isEditing ? formData : {
    name: company.name,
    canonical_url: company.canonical_url,
    adresse: company.adresse,
    premiers_tags: company.premiers_tags,
    lat: company.lat,
    lng: company.lng,
    qualifie: company.qualifie,
    ca_estime_band: fromDbRevenueBand(company.ca_estime_band as unknown as string | undefined),
    nb_employes_band: fromDbEmployeeBand(company.nb_employes_band as unknown as string | undefined),
    nb_employes_exact: company.nb_employes_exact,
    linkedin_url: company.linkedin_url,
    site_web_canonique: company.site_web_canonique,
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
              <Button onClick={save} disabled={isLoading}>
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
          <CompanyInfoForm isEditing={isEditing} currentData={currentData} handleInputChange={handleInputChange} />

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
                {detailedCompany && (detailedCompany.telephone || detailedCompany.email || detailedCompany.contact_name) ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {detailedCompany.telephone && (
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
                    )}

                    {detailedCompany.email && (
                      <div>
                        <Label className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email
                        </Label>
                        <p className="text-sm p-2 bg-muted rounded">
                          <a href={`mailto:${detailedCompany.email}`} className="text-blue-600 hover:underline">
                            {detailedCompany.email}
                          </a>
                        </p>
                      </div>
                    )}

                    {detailedCompany.contact_name && (
                      <div className="md:col-span-2">
                        <Label className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Contact principal
                        </Label>
                        <p className="text-sm p-2 bg-muted rounded">
                          {detailedCompany.contact_name}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      <strong>Aucune information de contact disponible</strong><br />
                      Les informations de contact proviennent des données de recherche brutes. 
                      Vous pouvez ajouter des contacts manuellement dans la section ci-dessous.
                    </p>
                  </div>
                )}

                {detailedCompany?.raw_contact_info && detailedCompany.raw_contact_info.length > 0 && (
                  <div className="mt-4">
                    <Label>Sources des données</Label>
                    <div className="flex gap-2 flex-wrap mt-2">
                      {detailedCompany.raw_contact_info.map((raw: any, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {raw.source === 'google_maps' ? 'Google Maps' : 'Google Search'}
                          {raw.position && ` #${raw.position}`}
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
              {(company.site_web_canonique || company.canonical_url) && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={company.site_web_canonique || company.canonical_url} target="_blank" rel="noopener noreferrer">
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

              {detailedCompany?.email && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`mailto:${detailedCompany.email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Envoyer un email
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
