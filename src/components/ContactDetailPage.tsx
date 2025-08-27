"use client";

import React, { useState, useEffect } from 'react';
import { useAppData, Contact, Opportunity, PipelineStage } from './AppDataContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { EmployeesList } from './EmployeesList';
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Save, 
  Globe, 
  Phone, 
  Mail, 
  MapPin, 
  User,
  CheckCircle,
  Edit3,
  Calendar,
  Building,
  Plus,
  Target,
  TrendingUp,
  DollarSign,
  Activity,
  Eye,
  ArrowRight,
  FileText,
  Clock,
  Users
} from 'lucide-react';

import logger from '../utils/logger';
interface ContactDetailPageProps {
  contactId: string;
  onBack: () => void;
  onNavigateToPipeline?: () => void;
  onNavigateToOpportunities?: () => void;
  onCreateOpportunity?: (contactId: string) => void;
}

export const ContactDetailPage: React.FC<ContactDetailPageProps> = ({ 
  contactId, 
  onBack, 
  onNavigateToPipeline,
  onNavigateToOpportunities,
  onCreateOpportunity 
}) => {
  const { 
    contacts, 
    companies, 
    opportunities, 
    pipelineStages, 
    updateContact,
    addOpportunity 
  } = useAppData();

  const [contact, setContact] = useState<Contact | null>(null);
  const [associatedCompany, setAssociatedCompany] = useState<any>(null);
  const [contactOpportunities, setContactOpportunities] = useState<Opportunity[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingOpportunity, setIsCreatingOpportunity] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Utilisation d'un objet simple pour les données éditées
  const [formData, setFormData] = useState({
    email: '',
    tel: ''
  });

  // Formulaire pour nouvelle opportunité
  const [opportunityForm, setOpportunityForm] = useState({
    montant: 2500,
    priorite: 'moyenne' as 'haute' | 'moyenne' | 'basse',
    stage_id: '',
    note_base: '',
    tags: '',
    date_prochain_suivi: ''
  });

  useEffect(() => {
    const foundContact = contacts.find(c => c.id === contactId);
    if (foundContact) {
      setContact(foundContact);
      setFormData({
        email: foundContact.email || '',
        tel: foundContact.tel || ''
      });
      
      // Trouver l'entreprise associée
      const company = companies.find(c => c.id === foundContact.entreprise_id);
      setAssociatedCompany(company);
      
      // Trouver les opportunités liées à ce contact
      const relatedOpportunities = opportunities.filter(opp => 
        opp.contact_id === foundContact.id || opp.entreprise_id === foundContact.entreprise_id
      );
      setContactOpportunities(relatedOpportunities);
    }
  }, [contactId, contacts, companies, opportunities]);

  const handleSave = async () => {
    if (!contact) return;
    
    setIsLoading(true);
    try {
      await updateContact(contact.id, formData);
      setIsEditing(false);
      toast.success("Contact mis à jour avec succès");
    } catch (error) {
      logger.error('Erreur lors de la mise à jour:', error);
      toast.error("Erreur lors de la mise à jour du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (contact) {
      setFormData({
        email: contact.email || '',
        tel: contact.tel || ''
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

  const handleCreateOpportunity = async () => {
    if (!contact || !associatedCompany) return;
    
    setIsCreatingOpportunity(true);
    try {
      const newOpportunity = {
        contact_id: contact.id,
        entreprise_id: associatedCompany.id,
        montant: opportunityForm.montant,
        priorite: opportunityForm.priorite,
        stage_id: opportunityForm.stage_id ? parseInt(opportunityForm.stage_id) : pipelineStages.find(s => s.nom === 'Qualifié')?.id,
        lead_magnet: false,
        note_base: opportunityForm.note_base || 'Opportunité créée depuis la fiche contact',
        tags: opportunityForm.tags || undefined,
        date_prochain_suivi: opportunityForm.date_prochain_suivi || undefined
      };

      await addOpportunity(newOpportunity);
      toast.success("Nouvelle opportunité créée avec succès");
      
      // Reset form and close modal
      setOpportunityForm({
        montant: 2500,
        priorite: 'moyenne',
        stage_id: '',
        note_base: '',
        tags: '',
        date_prochain_suivi: ''
      });
      setShowCreateModal(false);
      
      // Refresh opportunities - wait a bit for the state to update
      setTimeout(() => {
        const relatedOpportunities = opportunities.filter(opp => 
          opp.contact_id === contact.id || opp.entreprise_id === contact.entreprise_id
        );
        setContactOpportunities(relatedOpportunities);
      }, 100);
    } catch (error) {
      logger.error('Erreur lors de la création de l\'opportunité:', error);
      toast.error("Erreur lors de la création de l'opportunité");
    } finally {
      setIsCreatingOpportunity(false);
    }
  };

  const getStageColor = (stageName: string) => {
    const name = stageName.toLowerCase();
    
    if (name.includes('qualifié')) return '#3b82f6';
    if (name.includes('cold call') || name.includes('relance')) return '#eab308';
    if (name.includes('rdv') || name.includes('rendez-vous')) return '#f97316';
    if (name.includes('devis')) return '#22c55e';
    if (name.includes('signature') || name.includes('acompte')) return '#16a34a';
    
    return '#9ca3af';
  };

  const getStageName = (stageId?: number) => {
    const stage = pipelineStages.find(s => s.id === stageId);
    return stage?.nom || 'Non défini';
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
  };

  if (!contact) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </div>
        <div className="text-center py-12">
          <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3>Contact non trouvé</h3>
          <p className="text-muted-foreground">
            Le contact demandé n'existe pas ou n'est plus disponible.
          </p>
        </div>
      </div>
    );
  }

  const displayName = getCompanyDisplayName(associatedCompany?.name, associatedCompany?.canonical_url);

  const currentData = isEditing ? formData : {
    email: contact.email,
    tel: contact.tel
  };

  // Calculs pour les opportunités
  const totalOpportunityValue = contactOpportunities.reduce((sum, opp) => sum + (opp.montant || opp.value || 0), 0);
  const activeOpportunities = contactOpportunities.filter(opp => {
    const stage = pipelineStages.find(s => s.id === opp.stage_id);
    return stage && !stage.nom.toLowerCase().includes('signature') && !stage.nom.toLowerCase().includes('acompte');
  });
  const wonOpportunities = contactOpportunities.filter(opp => {
    const stage = pipelineStages.find(s => s.id === opp.stage_id);
    return stage && (stage.nom.toLowerCase().includes('signature') || stage.nom.toLowerCase().includes('acompte'));
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="flex items-center gap-2">
              Contact : {displayName}
              <CheckCircle className="h-5 w-5 text-green-600" />
            </h1>
            <p className="text-muted-foreground">
              Détails du contact • ID: {contact.id}
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

      {/* Métriques des opportunités optimisées */}
      <div className="grid grid-cols-4 gap-2 md:gap-4">
        <Card className="text-center">
          <CardContent className="p-3">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="text-lg md:text-xl font-bold">{contactOpportunities.length}</div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="p-3">
            <div className="flex items-center justify-center gap-1 mb-1">
              <DollarSign className="h-3 w-3 text-green-600" />
              <span className="text-xs text-muted-foreground">Valeur</span>
            </div>
            <div className="text-lg md:text-xl font-bold text-green-600">
              {formatAmount(totalOpportunityValue)}€
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="p-3">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Activity className="h-3 w-3 text-blue-600" />
              <span className="text-xs text-muted-foreground">Actives</span>
            </div>
            <div className="text-lg md:text-xl font-bold text-blue-600">{activeOpportunities.length}</div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="p-3">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-green-700" />
              <span className="text-xs text-muted-foreground">Gagnées</span>
            </div>
            <div className="text-lg md:text-xl font-bold text-green-700">{wonOpportunities.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations principales */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informations de contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="email">Adresse email</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={currentData.email || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="contact@entreprise.fr"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      {currentData.email ? (
                        <a 
                          href={`mailto:${currentData.email}`}
                          className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          {currentData.email}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">Non renseigné</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="tel">Numéro de téléphone</Label>
                  {isEditing ? (
                    <Input
                      id="tel"
                      type="tel"
                      value={currentData.tel || ''}
                      onChange={(e) => handleInputChange('tel', e.target.value)}
                      placeholder="+33 1 23 45 67 89"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      {currentData.tel ? (
                        <a 
                          href={`tel:${currentData.tel}`}
                          className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <Phone className="h-3 w-3" />
                          {currentData.tel}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">Non renseigné</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informations de l'entreprise associée */}
          {associatedCompany && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Entreprise associée
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nom de l'entreprise</Label>
                  <p className="text-sm p-2 bg-muted rounded">
                    {displayName}
                  </p>
                </div>

                {associatedCompany.canonical_url && (
                  <div>
                    <Label>Site web</Label>
                    <div className="flex items-center gap-2">
                      <a 
                        href={associatedCompany.canonical_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                      >
                        <Globe className="h-3 w-3" />
                        {associatedCompany.canonical_url}
                      </a>
                    </div>
                  </div>
                )}

                {associatedCompany.adresse && (
                  <div>
                    <Label>Adresse</Label>
                    <p className="text-sm p-2 bg-muted rounded">
                      {associatedCompany.adresse}
                    </p>
                  </div>
                )}

                {associatedCompany.premiers_tags && (
                  <div>
                    <Label>Tags de l'entreprise</Label>
                    <div className="flex flex-wrap gap-1 p-2 bg-muted rounded">
                      {associatedCompany.premiers_tags.split(',').map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Employés de l'entreprise */}
          {associatedCompany && (
            <EmployeesList
              companyId={associatedCompany.id}
              companyName={displayName}
            />
          )}

          {/* Opportunités liées */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Opportunités ({contactOpportunities.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={onNavigateToOpportunities}
                    className="text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Voir opportunités
                  </Button>
                  <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Nouvelle
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contactOpportunities.length > 0 ? (
                <div className="space-y-3">
                  {contactOpportunities.map((opportunity) => {
                    const stageName = getStageName(opportunity.stage_id);
                    const stageColor = getStageColor(stageName);
                    
                    return (
                      <div key={opportunity.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stageColor }}
                          ></div>
                          <div>
                            <p className="text-sm font-medium">
                              {formatAmount(opportunity.montant || opportunity.value || 0)}€
                            </p>
                            <p className="text-xs text-muted-foreground">{stageName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {opportunity.date_prochain_suivi && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Suivi {new Date(opportunity.date_prochain_suivi).toLocaleDateString('fr-FR')}
                            </Badge>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {contactOpportunities.length > 3 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={onNavigateToOpportunities}
                    >
                      Voir toutes les opportunités
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Aucune opportunité pour ce contact
                  </p>
                  <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Créer une opportunité
                      </Button>
                    </DialogTrigger>
                  </Dialog>
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
              <CardTitle className="text-lg">Statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Type</span>
                <Badge variant="default">
                  Contact qualifié
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Entreprise ID</span>
                <span className="text-sm">{contact.entreprise_id}</span>
              </div>

              {contact.dateQualified && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Date de qualification</span>
                  <span className="text-sm">{new Date(contact.dateQualified).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions rapides */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentData.email && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`mailto:${currentData.email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Envoyer un email
                  </a>
                </Button>
              )}
              
              {currentData.tel && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`tel:${currentData.tel}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Appeler
                  </a>
                </Button>
              )}
              
              {associatedCompany?.canonical_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={associatedCompany.canonical_url} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" />
                    Visiter le site web
                  </a>
                </Button>
              )}
              
              {associatedCompany?.lat && associatedCompany?.lng && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a 
                    href={`https://www.google.com/maps?q=${associatedCompany.lat},${associatedCompany.lng}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Voir sur la carte
                  </a>
                </Button>
              )}

              <Separator className="my-3" />

              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={onNavigateToPipeline}
              >
                <Target className="h-4 w-4 mr-2" />
                Voir dans le pipeline
              </Button>

              <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Créer une opportunité
                  </Button>
                </DialogTrigger>
              </Dialog>
            </CardContent>
          </Card>

          {/* Performance du contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Taux de conversion</span>
                <span className="text-sm font-medium">
                  {contactOpportunities.length > 0 
                    ? `${Math.round((wonOpportunities.length / contactOpportunities.length) * 100)}%`
                    : 'N/A'
                  }
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Valeur moyenne</span>
                <span className="text-sm font-medium">
                  {contactOpportunities.length > 0 
                    ? `${formatAmount(Math.round(totalOpportunityValue / contactOpportunities.length))}€`
                    : 'N/A'
                  }
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Dernière activité</span>
                <span className="text-sm font-medium">
                  {contactOpportunities.length > 0 
                    ? new Date(Math.max(...contactOpportunities.map(opp => new Date(opp.updated_at || opp.created_at).getTime()))).toLocaleDateString('fr-FR')
                    : contact.dateQualified ? new Date(contact.dateQualified).toLocaleDateString('fr-FR') : 'N/A'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de création d'opportunité */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Créer une opportunité</DialogTitle>
            <DialogDescription>
              Créer une nouvelle opportunité pour {displayName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="montant" className="text-right">
                Montant
              </Label>
              <Input
                id="montant"
                type="number"
                value={opportunityForm.montant}
                onChange={(e) => setOpportunityForm(prev => ({
                  ...prev,
                  montant: parseInt(e.target.value) || 0
                }))}
                className="col-span-3"
                placeholder="2500"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priorite" className="text-right">
                Priorité
              </Label>
              <Select
                value={opportunityForm.priorite}
                onValueChange={(value) => setOpportunityForm(prev => ({
                  ...prev,
                  priorite: value as 'haute' | 'moyenne' | 'basse'
                }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Sélectionner une priorité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basse">Basse</SelectItem>
                  <SelectItem value="moyenne">Moyenne</SelectItem>
                  <SelectItem value="haute">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stage" className="text-right">
                Étape
              </Label>
              <Select
                value={opportunityForm.stage_id}
                onValueChange={(value) => setOpportunityForm(prev => ({
                  ...prev,
                  stage_id: value
                }))}
              >
                <SelectTrigger className="col-span-3">
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tags" className="text-right">
                Tags
              </Label>
              <Input
                id="tags"
                value={opportunityForm.tags}
                onChange={(e) => setOpportunityForm(prev => ({
                  ...prev,
                  tags: e.target.value
                }))}
                className="col-span-3"
                placeholder="tag1, tag2, tag3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="suivi" className="text-right">
                Prochain suivi
              </Label>
              <Input
                id="suivi"
                type="date"
                value={opportunityForm.date_prochain_suivi}
                onChange={(e) => setOpportunityForm(prev => ({
                  ...prev,
                  date_prochain_suivi: e.target.value
                }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="note" className="text-right">
                Note
              </Label>
              <Textarea
                id="note"
                value={opportunityForm.note_base}
                onChange={(e) => setOpportunityForm(prev => ({
                  ...prev,
                  note_base: e.target.value
                }))}
                className="col-span-3"
                placeholder="Note sur cette opportunité..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowCreateModal(false)}
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              onClick={handleCreateOpportunity}
              disabled={isCreatingOpportunity}
            >
              {isCreatingOpportunity ? 'Création...' : 'Créer opportunité'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};