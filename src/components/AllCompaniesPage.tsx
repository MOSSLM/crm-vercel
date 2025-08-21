import React, { useState } from 'react';
import { useAppData, Company } from './AppDataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { getCompanyDisplayName, ensureHttpsUrl } from '../utils/displayHelpers';
import { 
  LayoutGrid, 
  List, 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  Globe, 
  MapPin, 
  Star,
  CheckCircle,
  Building
} from 'lucide-react';

interface AllCompaniesPageProps {
  onNavigateToCompany?: (companyId: number) => void;
}

export const AllCompaniesPage: React.FC<AllCompaniesPageProps> = ({ onNavigateToCompany }) => {
  const { companies } = useAppData();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const filteredCompanies = companies.filter(company => {
    // Safe search with null checks
    const companyName = getCompanyDisplayName(company.name, company.canonical_url);
    const companyAddress = company.adresse || '';
    const companyTags = Array.isArray(company.premiers_tags?.split(',')) 
      ? company.premiers_tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    const matchesSearch = !searchTerm || 
      companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      companyAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      companyTags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = 
      filterBy === 'all' ||
      (filterBy === 'qualified' && company.qualifie) ||
      (filterBy === 'has-url' && company.canonical_url) ||
      (filterBy === 'has-tags' && company.premiers_tags);

    const matchesSource = 
      sourceFilter === 'all' ||
      (sourceFilter === 'maps' && company.sources.includes('google_maps')) ||
      (sourceFilter === 'google' && company.sources.includes('google_search'));
    
    return matchesSearch && matchesFilter && matchesSource;
  });

  const qualifiedCount = companies.filter(c => c.qualifie).length;
  const withUrlCount = companies.filter(c => c.canonical_url).length;
  const withTagsCount = companies.filter(c => c.premiers_tags).length;

  const CompanyCard: React.FC<{ company: Company }> = ({ company }) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const tags = company.premiers_tags 
      ? company.premiers_tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    return (
      <Card className="h-full cursor-pointer card-no-flicker" onClick={() => onNavigateToCompany?.(company.id)}>
        <CardHeader className="pb-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg leading-tight flex-1 pr-2">{displayName}</CardTitle>
              {company.qualifie && (
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <Badge 
                variant={company.sources.includes('google_maps') ? 'default' : 'secondary'} 
                className="text-xs"
              >
                {company.sources.includes('google_maps') ? 'Maps' : 'Google'}
              </Badge>
            </div>

            {company.adresse && (
              <CardDescription className="flex items-center gap-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{company.adresse}</span>
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {company.canonical_url && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <a 
                  href={ensureHttpsUrl(company.canonical_url)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  Site web
                </a>
              </div>
            )}
          </div>

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
        </CardContent>
      </Card>
    );
  };

  const CompanyRow: React.FC<{ company: Company }> = ({ company }) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const tags = company.premiers_tags 
      ? company.premiers_tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    return (
      <div className="flex items-center justify-between p-4 border rounded-lg cursor-pointer card-no-flicker" onClick={() => onNavigateToCompany?.(company.id)}>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{displayName}</span>
              {company.qualifie && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              <Badge 
                variant={company.sources.includes('google_maps') ? 'default' : 'secondary'} 
                className="text-xs"
              >
                {company.sources.includes('google_maps') ? 'M' : 'G'}
              </Badge>
            </div>
            {company.adresse && (
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {company.adresse}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {company.canonical_url && <Globe className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </div>
        
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 max-w-xs">
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
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Toutes les Entreprises</h1>
        <p className="text-muted-foreground">
          Base de données complète de toutes les entreprises découvertes
        </p>
      </div>

      {/* Métriques principales - toutes en même taille */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
            <p className="text-xs text-muted-foreground">Entreprises</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualifiées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{qualifiedCount}</div>
            <p className="text-xs text-muted-foreground">
              {companies.length > 0 ? Math.round((qualifiedCount / companies.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec Site Web</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{withUrlCount}</div>
            <p className="text-xs text-muted-foreground">Ont un site web</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{withTagsCount}</div>
            <p className="text-xs text-muted-foreground">Ont des tags</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, adresse ou tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={filterBy} onValueChange={setFilterBy}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les entreprises</SelectItem>
            <SelectItem value="qualified">Qualifiées uniquement</SelectItem>
            <SelectItem value="has-url">Avec site web</SelectItem>
            <SelectItem value="has-tags">Avec tags</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="maps">Maps</SelectItem>
            <SelectItem value="google">Google</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex border rounded-lg">
          <Button
            variant={viewMode === 'cards' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('cards')}
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

      <div className="text-sm text-muted-foreground">
        {filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? 's' : ''} trouvée{filteredCompanies.length > 1 ? 's' : ''}
      </div>

      {/* Grille d'entreprises : 2 colonnes en mode cards sur mobile, 3+ sur desktop */}
      {viewMode === 'cards' ? (
        <div className="grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCompanies.map((company) => (
            <CompanyRow key={company.id} company={company} />
          ))}
        </div>
      )}

      {filteredCompanies.length === 0 && (
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3>Aucune entreprise trouvée</h3>
          <p className="text-muted-foreground">
            Essayez d'ajuster vos critères de recherche ou de filtrage.
          </p>
        </div>
      )}
    </div>
  );
};