"use client";

import React, { useState } from 'react';
import { useAppData, SearchResult } from './AppDataContext';
import { SearchDetailPage } from './SearchDetailPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { LayoutGrid, List, Search, Filter, Calendar, MapPin, Building, ChevronRight } from 'lucide-react';

export const ResultsPage: React.FC = () => {
  const { searchResults } = useAppData();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  if (selectedResult) {
    return (
      <SearchDetailPage 
        searchResult={selectedResult} 
        onBack={() => setSelectedResult(null)} 
      />
    );
  }

  const filteredResults = searchResults.filter(result => {
    const matchesSearch = 
      result.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = 
      filterBy === 'all' ||
      (filterBy === 'high-qualified' && result.qualifiedCompanies > 50) ||
      (filterBy === 'recent' && new Date(result.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // Calcul des totaux
  const totalSearches = filteredResults.length;
  const totalCompaniesFound = filteredResults.reduce((sum, result) => sum + result.totalCompanies, 0);
  const totalQualifiedCompanies = filteredResults.reduce((sum, result) => sum + result.qualifiedCompanies, 0);
  const qualificationRate = totalCompaniesFound > 0 ? Math.round((totalQualifiedCompanies / totalCompaniesFound) * 100) : 0;

  const ResultCard: React.FC<{ result: SearchResult }> = ({ result }) => (
    <Card 
      className="h-full cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setSelectedResult(result)}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {result.keyword}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {result.location}
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(result.date)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{result.totalCompanies}</div>
              <div className="text-xs text-blue-600">Entreprises trouvées</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{result.qualifiedCompanies}</div>
              <div className="text-xs text-green-600">Qualifiées</div>
            </div>
          </div>
          
          <div className="text-center p-2 bg-purple-50 rounded-lg">
            <div className="text-sm font-medium text-purple-600">
              Taux de qualification: {Math.round((result.qualifiedCompanies / result.totalCompanies) * 100)}%
            </div>
          </div>
          
          <div className="flex gap-2">
            <Badge variant={result.useMaps ? "default" : "secondary"}>
              Maps: {result.useMaps ? 'Oui' : 'Non'}
            </Badge>
            <Badge variant={result.useGoogle ? "default" : "secondary"}>
              Google: {result.useGoogle ? 'Oui' : 'Non'}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Précision: {result.precision}
          </div>
          <div className="text-xs text-blue-600 font-medium">
            Cliquer pour voir les détails →
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ResultRow: React.FC<{ result: SearchResult }> = ({ result }) => (
    <div 
      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => setSelectedResult(result)}
    >
      <div className="flex items-center gap-4">
        <div>
          <div className="font-medium flex items-center gap-2">
            {result.keyword}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">{result.location} • {formatDate(result.date)}</div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-lg font-bold">{result.totalCompanies}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-600">{result.qualifiedCompanies}</div>
          <div className="text-xs text-muted-foreground">Qualifiées</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-purple-600">
            {Math.round((result.qualifiedCompanies / result.totalCompanies) * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">Taux</div>
        </div>
        <div className="flex gap-1">
          <Badge variant={result.useMaps ? "default" : "secondary"} className="text-xs">M</Badge>
          <Badge variant={result.useGoogle ? "default" : "secondary"} className="text-xs">G</Badge>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Résultats des Recherches</h1>
        <p className="text-muted-foreground">
          Toutes vos recherches d'entreprises effectuées
        </p>
      </div>

      {/* Métriques globales - même système que AllCompaniesPage */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total recherches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSearches}</div>
            <p className="text-xs text-muted-foreground">Recherches effectuées</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Entreprises trouvées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalCompaniesFound}</div>
            <p className="text-xs text-muted-foreground">Au total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Entreprises qualifiées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalQualifiedCompanies}</div>
            <p className="text-xs text-muted-foreground">{qualificationRate}% du total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Taux moyen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{qualificationRate}%</div>
            <p className="text-xs text-muted-foreground">Qualification</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par mot-clé ou localisation..."
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
            <SelectItem value="all">Toutes les recherches</SelectItem>
            <SelectItem value="high-qualified">Haute qualification (&gt;50)</SelectItem>
            <SelectItem value="recent">Récentes (7 jours)</SelectItem>
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
        {filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''} trouvé{filteredResults.length > 1 ? 's' : ''} • 
        {' '}{totalCompaniesFound} entreprise{totalCompaniesFound > 1 ? 's' : ''} au total • 
        {' '}{totalQualifiedCompanies} qualifiée{totalQualifiedCompanies > 1 ? 's' : ''}
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredResults.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredResults.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </div>
      )}

      {filteredResults.length === 0 && (
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3>Aucun résultat trouvé</h3>
          <p className="text-muted-foreground">
            Essayez d'ajuster vos critères de recherche ou de filtrage.
          </p>
        </div>
      )}
    </div>
  );
};