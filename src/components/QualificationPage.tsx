"use client";

import React, { useState } from 'react';
import { useAppData } from './AppDataContext';
import { Company } from './AppDataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from './ui/pagination';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  MapPin, 
  Calendar,
  Target,
  LayoutGrid,
  List,
  Eye,
  CheckCircle,
  Edit3,
  Phone,
  Mail,
  User,
  Save,
  X,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { getCompanyDisplayName, ensureHttpsUrl } from '../utils/displayHelpers';

import logger from '../utils/logger';
export const QualificationPage: React.FC = () => {
  const {
    companies,
    qualifyCompany,
    unqualifyCompany,
    updateCompany,
    deleteCompany,
    loading,
    isDuplicate
  } = useAppData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [qualificationFilter, setQualificationFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // 12 items per page
  
  // Quick edit state
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [quickEditForm, setQuickEditForm] = useState({
    telephone: '',
    email: '',
    contact_name: ''
  });

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);

  const filteredCompanies = companies.filter(company => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const matchesSearch =
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.adresse && company.adresse.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (company.premiers_tags && company.premiers_tags.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSource = sourceFilter === 'all' || 
      (sourceFilter === 'google_search' && company.sources.includes('google_search')) ||
      (sourceFilter === 'google_maps' && company.sources.includes('google_maps'));
    
    const matchesQualification = qualificationFilter === 'all' ||
      (qualificationFilter === 'qualified' && company.qualifie) ||
      (qualificationFilter === 'not_qualified' && !company.qualifie);
    
    const hideByDuplicate =
      !showDuplicates &&
      (isDuplicate(company.id) || company.is_network || company.is_blacklisted);

    return matchesSearch && matchesSource && matchesQualification && !hideByDuplicate;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sourceFilter, qualificationFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const handleQualificationToggle = async (company: Company) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    
    try {
      if (company.qualifie) {
        await unqualifyCompany(company.id);
        toast.success(`${displayName} déqualifiée`);
      } else {
        await qualifyCompany(company.id);
        toast.success(`${displayName} qualifiée avec succès !`);
      }
    } catch (error) {
      logger.error('Erreur lors de la qualification:', error);
      toast.error('Erreur lors de la modification de la qualification');
    }
  };

  const handleVisitWebsite = (company: Company) => {
    if (company.canonical_url) {
      const url = ensureHttpsUrl(company.canonical_url);
      window.open(url, '_blank', 'noopener,noreferrer');
      
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(`Site web de ${displayName} ouvert`);
    } else {
      toast.error('Aucune URL disponible pour cette entreprise');
    }
  };

  const handleQuickEdit = (company: Company) => {
    setEditingCompany(company);
    // Reset form with current company data if any
    setQuickEditForm({
      telephone: '',
      email: '',
      contact_name: ''
    });
    setShowQuickEditModal(true);
  };

  const handleSaveQuickEdit = async () => {
    if (!editingCompany) return;

    try {
      // Prepare updates - only include non-empty values
      const updates: Partial<Company> = {};
      
      if (quickEditForm.telephone.trim()) {
        updates.telephone = quickEditForm.telephone.trim();
      }
      if (quickEditForm.email.trim()) {
        updates.email = quickEditForm.email.trim();
      }
      if (quickEditForm.contact_name.trim()) {
        updates.contact_name = quickEditForm.contact_name.trim();
      }

      // If no updates, just close the modal
      if (Object.keys(updates).length === 0) {
        setShowQuickEditModal(false);
        return;
      }

      await updateCompany(editingCompany.id, updates);
      
      const displayName = getCompanyDisplayName(editingCompany.name, editingCompany.canonical_url);
      toast.success(`Informations de contact mises à jour pour ${displayName}`);
      
      setShowQuickEditModal(false);
      setEditingCompany(null);
    } catch (error) {
      logger.error('Error updating company contact info:', error);
      toast.error('Erreur lors de la mise à jour des informations de contact');
    }
  };

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!companyToDelete) return;

    try {
      await deleteCompany(companyToDelete.id);
      setShowDeleteModal(false);
      setCompanyToDelete(null);
    } catch (error) {
      logger.error('Error deleting company:', error);
    }
  };

  const CompanyCard = ({ company }: { company: Company }) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const tags = company.premiers_tags ? company.premiers_tags.split(',').map(t => t.trim()) : [];
    
    return (
      <Card className={`hover:shadow-md transition-shadow ${company.qualifie ? 'bg-green-50 border-green-200' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-base leading-tight">{displayName}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={company.qualifie ? 'default' : 'secondary'}>
                  {company.qualifie ? 'Qualifiée' : 'En attente'}
                </Badge>
                <Badge variant="outline">
                  {company.sources.includes('google_maps') ? 'Maps' : 'Search'}
                </Badge>
                {/* Contact info indicators */}
                {company.telephone && (
                  <Phone className="h-3 w-3 text-blue-600" />
                )}
                {company.email && (
                  <Mail className="h-3 w-3 text-green-600" />
                )}
                {company.contact_name && (
                  <User className="h-3 w-3 text-purple-600" />
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteClick(company)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Supprimer l'entreprise"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {company.adresse && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-600 leading-tight">{company.adresse}</span>
              </div>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Contact information if available */}
            {(company.telephone || company.email || company.contact_name) && (
              <div className="space-y-1 text-xs">
                {company.telephone && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Phone className="h-3 w-3" />
                    {company.telephone}
                  </div>
                )}
                {company.email && (
                  <div className="flex items-center gap-1 text-green-600">
                    <Mail className="h-3 w-3" />
                    {company.email}
                  </div>
                )}
                {company.contact_name && (
                  <div className="flex items-center gap-1 text-purple-600">
                    <User className="h-3 w-3" />
                    {company.contact_name}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Créé le {formatDate(company.created_at)}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {company.canonical_url && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleVisitWebsite(company)}
                  className="px-2"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleQuickEdit(company)}
                className="px-2"
                title="Enrichir les données"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setSelectedCompany(company)}
                className="flex-1"
              >
                <Eye className="h-3 w-3 mr-1" />
                Voir
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-sm font-medium">
                {company.qualifie ? 'Qualifiée' : 'Qualifier'}
              </span>
              <Switch
                checked={company.qualifie}
                onCheckedChange={() => handleQualificationToggle(company)}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Qualification des Entreprises</h1>
        <p className="text-muted-foreground">
          Qualifiez les entreprises trouvées pour créer automatiquement des opportunités (création ou refonte de site)
        </p>
      </div>

      {/* Métriques rapides - optimisées pour mobile */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total entreprises</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualifiées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {companies.filter(c => c.qualifie).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {companies.length > 0 ? Math.round((companies.filter(c => c.qualifie).length / companies.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Google Search</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {companies.filter(c => c.sources.includes('google_search')).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {companies.filter(c => c.telephone || c.email || c.contact_name).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {companies.length > 0 ? Math.round((companies.filter(c => c.telephone || c.email || c.contact_name).length / companies.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et recherche - optimisés pour mobile */}
      <div className="space-y-4 md:space-y-0 md:flex md:flex-wrap md:gap-4 md:items-center md:justify-between">
        <div className="space-y-3 md:space-y-0 md:flex md:gap-4 md:items-center md:flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une entreprise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:flex md:gap-4">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-card text-card-foreground text-sm"
            >
              <option value="all">Toutes les sources</option>
              <option value="google_search">Google Search</option>
              <option value="google_maps">Google Maps</option>
            </select>

            <select
              value={qualificationFilter}
              onChange={(e) => setQualificationFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-card text-card-foreground text-sm"
            >
              <option value="all">Toutes</option>
              <option value="qualified">Qualifiées</option>
              <option value="not_qualified">Non qualifiées</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={showDuplicates}
              onCheckedChange={setShowDuplicates}
            />
            <Label>Afficher les duplicats</Label>
          </div>
        </div>

        {/* Toggle grille/liste unifié */}
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
            className="rounded-l-none"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Liste/Grille des entreprises - optimisée pour mobile */}
      {viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paginatedCompanies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead className="hidden lg:table-cell">Adresse</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="text-center">Qualification</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCompanies.map((company) => {
                  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
                  const tags = company.premiers_tags ? company.premiers_tags.split(',').map(t => t.trim()) : [];
                  
                  return (
                    <TableRow 
                      key={company.id} 
                      className={company.qualifie ? 'bg-green-50' : ''}
                    >
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{displayName}</span>
                            {/* Contact info indicators */}
                            {company.telephone && (
                              <Phone className="h-3 w-3 text-blue-600" />
                            )}
                            {company.email && (
                              <Mail className="h-3 w-3 text-green-600" />
                            )}
                            {company.contact_name && (
                              <User className="h-3 w-3 text-purple-600" />
                            )}
                          </div>
                          {company.canonical_url && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {company.canonical_url}
                            </div>
                          )}
                          {/* Contact info on mobile */}
                          <div className="md:hidden space-y-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {company.sources.includes('google_maps') ? 'Maps' : 'Search'}
                            </Badge>
                            {(company.telephone || company.email || company.contact_name) && (
                              <div className="text-xs text-muted-foreground">
                                {company.telephone && `📞 ${company.telephone}`}{" "}
                                {company.email && `✉️ ${company.email}`}{" "}
                                {company.contact_name && `👤 ${company.contact_name}`}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {formatDate(company.created_at)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">
                          {company.sources.includes('google_maps') ? 'Maps' : 'Search'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell max-w-xs">
                        {company.adresse ? (
                          <div className="flex items-start gap-1">
                            <MapPin className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm truncate">{company.adresse}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 2).map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {tags.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(company.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleVisitWebsite(company)}
                            disabled={!company.canonical_url}
                            title="Visiter le site"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleQuickEdit(company)}
                            title="Enrichir les données"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedCompany(company)}
                            title="Voir détails"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={company.qualifie}
                            onCheckedChange={() => handleQualificationToggle(company)}
                            disabled={loading}
                          />
                          {company.qualifie && (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteClick(company)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Supprimer l'entreprise"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              
              {/* First page */}
              {currentPage > 2 && (
                <>
                  <PaginationItem>
                    <PaginationLink onClick={() => setCurrentPage(1)} className="cursor-pointer">
                      1
                    </PaginationLink>
                  </PaginationItem>
                  {currentPage > 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                </>
              )}
              
              {/* Current page and adjacent pages */}
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 3) {
                  pageNum = i + 1;
                } else if (currentPage <= 2) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 1) {
                  pageNum = totalPages - 2 + i;
                } else {
                  pageNum = currentPage - 1 + i;
                }
                
                if (pageNum < 1 || pageNum > totalPages) return null;
                
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink 
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              {/* Last page */}
              {currentPage < totalPages - 1 && (
                <>
                  {currentPage < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationLink onClick={() => setCurrentPage(totalPages)} className="cursor-pointer">
                      {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          
          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages} ({filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? 's' : ''} au total)
          </div>
        </div>
      )}

      {filteredCompanies.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-medium mb-2">Aucune entreprise trouvée</h3>
            <p className="text-muted-foreground">
              {searchTerm || sourceFilter !== 'all' || qualificationFilter !== 'all' 
                ? 'Modifiez vos filtres pour voir plus d\'entreprises'
                : 'Lancez une recherche pour découvrir des entreprises'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Modal d'édition rapide */}
      <Dialog open={showQuickEditModal} onOpenChange={setShowQuickEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Enrichir les données
            </DialogTitle>
            <DialogDescription>
              {editingCompany ? 
                `Ajoutez des informations de contact pour ${getCompanyDisplayName(editingCompany.name, editingCompany.canonical_url)}` :
                'Ajoutez des informations de contact pour cette entreprise'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="quick-phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Téléphone
              </Label>
              <Input
                id="quick-phone"
                value={quickEditForm.telephone}
                onChange={(e) => setQuickEditForm(prev => ({ ...prev, telephone: e.target.value }))}
                placeholder="Ex: 01 23 45 67 89 ou 06 12 34 56 78"
              />
            </div>

            <div>
              <Label htmlFor="quick-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                id="quick-email"
                type="email"
                value={quickEditForm.email}
                onChange={(e) => setQuickEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="contact@entreprise.com"
              />
            </div>

            <div>
              <Label htmlFor="quick-contact" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Nom du contact
              </Label>
              <Input
                id="quick-contact"
                value={quickEditForm.contact_name}
                onChange={(e) => setQuickEditForm(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="Nom de la personne de contact"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowQuickEditModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveQuickEdit}>
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de détail */}
      <Dialog open={!!selectedCompany} onOpenChange={() => setSelectedCompany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCompany ? getCompanyDisplayName(selectedCompany.name, selectedCompany.canonical_url) : ''}
            </DialogTitle>
            <DialogDescription>Détails de l'entreprise</DialogDescription>
          </DialogHeader>

          {selectedCompany && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Statut de qualification</label>
                  <div className="mt-1">
                    <Badge variant={selectedCompany.qualifie ? 'default' : 'secondary'}>
                      {selectedCompany.qualifie ? 'Qualifiée' : 'En attente'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Source</label>
                  <div className="mt-1">
                    <Badge variant="outline">
                      {selectedCompany.sources.includes('google_maps') ? 'Google Maps' : 'Google Search'}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedCompany.canonical_url && (
                <div>
                  <label className="text-sm font-medium">Site web</label>
                  <div className="mt-1">
                    <a 
                      href={ensureHttpsUrl(selectedCompany.canonical_url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {selectedCompany.canonical_url}
                    </a>
                  </div>
                </div>
              )}

              {selectedCompany.adresse && (
                <div>
                  <label className="text-sm font-medium">Adresse</label>
                  <div className="mt-1 flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                    <span className="text-sm">{selectedCompany.adresse}</span>
                  </div>
                </div>
              )}

              {/* Contact information section */}
              {(selectedCompany.telephone || selectedCompany.email || selectedCompany.contact_name) && (
                <div>
                  <label className="text-sm font-medium">Informations de contact</label>
                  <div className="mt-2 space-y-2">
                    {selectedCompany.telephone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{selectedCompany.telephone}</span>
                      </div>
                    )}
                    {selectedCompany.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{selectedCompany.email}</span>
                      </div>
                    )}
                    {selectedCompany.contact_name && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-purple-600" />
                        <span className="text-sm">{selectedCompany.contact_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedCompany.premiers_tags && (
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCompany.premiers_tags.split(',').map(t => t.trim()).map((tag, index) => (
                      <Badge key={index} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Créée le</label>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatDate(selectedCompany.created_at)}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Mise à jour le</label>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatDate(selectedCompany.updated_at)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={() => handleVisitWebsite(selectedCompany)}
                  disabled={!selectedCompany.canonical_url}
                  className="flex-1"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visiter le site
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setSelectedCompany(null);
                    handleQuickEdit(selectedCompany);
                  }}
                  className="flex-1"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Enrichir les données
                </Button>
                <Button 
                  variant={selectedCompany.qualifie ? "destructive" : "default"}
                  onClick={() => {
                    handleQualificationToggle(selectedCompany);
                    setSelectedCompany(null);
                  }}
                  className="flex-1"
                >
                  {selectedCompany.qualifie ? 'Déqualifier' : 'Qualifier'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmation de suppression */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Supprimer l'entreprise
            </DialogTitle>
            <DialogDescription>
              {companyToDelete && (
                <>
                  Êtes-vous sûr de vouloir supprimer <strong>{getCompanyDisplayName(companyToDelete.name, companyToDelete.canonical_url)}</strong> ?
                  <br /><br />
                  Cette action supprimera également :
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Toutes les données brutes associées</li>
                    <li>Tous les contacts liés à cette entreprise</li>
                    <li>Toutes les opportunités en cours</li>
                  </ul>
                  <br />
                  <strong>Cette action est irréversible.</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
