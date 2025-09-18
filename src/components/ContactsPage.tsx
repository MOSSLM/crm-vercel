"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from './AppDataContext';
import { Contact } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { EditEmployeeModal } from './EditEmployeeModal';
import { AddContactForm } from './AddContactForm';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { toast } from "sonner";
import { 
  LayoutGrid, 
  List, 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  Globe, 
  MapPin, 
  User,
  Users,
  Building,
  Briefcase,
  Loader2
} from 'lucide-react';

import logger from '../utils/logger';
interface Employee {
  id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  tel?: string;
  poste?: string;
  entreprise_id: number;
}

interface ContactsPageProps {
  onEmployeeClick?: (employeeId: string) => void;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({ onEmployeeClick }) => {
  const { companies, contacts, refreshData, loading: appDataLoading } = useAppData();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');

  const mappedContacts = useMemo(() => {
    return contacts.map((contact: Contact) => ({
      id: contact.id,
      entreprise_id: contact.entreprise_id,
      nom: contact.nom ?? contact.last_name,
      prenom: contact.prenom ?? contact.first_name,
      email: contact.email,
      tel: contact.tel,
      poste: contact.poste ?? contact.role_title,
    }));
  }, [contacts]);

  useEffect(() => {
    setAllEmployees(mappedContacts);
    setLoading(appDataLoading && mappedContacts.length === 0);
  }, [mappedContacts, appDataLoading]);

  const getEmployeeDisplayName = (employee: Employee) => {
    if (employee.prenom && employee.nom) {
      return `${employee.prenom} ${employee.nom}`;
    } else if (employee.nom) {
      return employee.nom;
    } else if (employee.prenom) {
      return employee.prenom;
    }
    return 'Employé';
  };

  const getCompanyForEmployee = (employeeId: number) => {
    return companies.find(c => c.id === employeeId);
  };

  const filteredEmployees = allEmployees.filter(employee => {
    const associatedCompany = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(associatedCompany?.name, associatedCompany?.canonical_url);
    const employeeName = getEmployeeDisplayName(employee);
    
    const matchesSearch = !searchTerm || 
      employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (employee.tel && employee.tel.includes(searchTerm)) ||
      (employee.poste && employee.poste.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = 
      filterBy === 'all' ||
      (filterBy === 'has-email' && employee.email) ||
      (filterBy === 'has-phone' && employee.tel) ||
      (filterBy === 'has-both' && employee.email && employee.tel) ||
      (filterBy === 'has-position' && employee.poste);
    
    return matchesSearch && matchesFilter;
  });

  const withEmailCount = allEmployees.filter(e => e.email).length;
  const withPhoneCount = allEmployees.filter(e => e.tel).length;
  const withBothCount = allEmployees.filter(e => e.email && e.tel).length;
  const withPositionCount = allEmployees.filter(e => e.poste).length;

  const handleEmployeeClick = (employee: Employee) => {
    const company = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);
    
    setSelectedEmployee(employee);
    setSelectedCompanyName(companyName);
    setShowEditEmployeeModal(true);
  };

  const handleEmployeeUpdated = async () => {
    setSelectedEmployee(null);
    setSelectedCompanyName('');
    setLoading(true);
    try {
      await refreshData();
      toast.success("Contact mis à jour avec succès");
    } catch (error) {
      logger.error('Error refreshing contacts after update:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContactAdded = async () => {
    setLoading(true);
    try {
      await refreshData();
    } catch (error) {
      logger.error('Error refreshing contacts after addition:', error);
    } finally {
      setLoading(false);
    }
  };

  const EmployeeCard: React.FC<{ employee: Employee }> = ({ employee }) => {
    const associatedCompany = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(associatedCompany?.name, associatedCompany?.canonical_url);
    const employeeName = getEmployeeDisplayName(employee);

    return (
      <Card 
        className="h-full cursor-pointer hover:shadow-md transition-shadow" 
        onClick={() => handleEmployeeClick(employee)}
      >
        <CardHeader className="pb-2 space-y-1">
          <div className="space-y-2">
            <CardTitle className="text-sm md:text-base leading-tight break-words pr-1 flex items-center gap-2">
              <User className="h-4 w-4 flex-shrink-0" />
              {employeeName}
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {employee.poste && (
                <Badge variant="outline" className="text-xs">
                  <Briefcase className="h-3 w-3 mr-1" />
                  {employee.poste}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Entreprise */}
          <CardDescription className="flex items-start gap-1 mt-2">
            <Building className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="text-xs break-words leading-relaxed">
              {companyName}
            </span>
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-2 pt-2">
          {/* Informations de contact */}
          <div className="space-y-2">
            {employee.email && (
              <div className="flex items-start gap-2">
                <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="text-xs break-all leading-relaxed">
                  {employee.email}
                </span>
              </div>
            )}
            
            {employee.tel && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs">
                  {employee.tel}
                </span>
              </div>
            )}
          </div>

          {/* Adresse de l'entreprise */}
          {associatedCompany?.adresse && (
            <div className="flex items-start gap-2 pt-2 border-t">
              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground break-words leading-relaxed">
                {associatedCompany.adresse}
              </span>
            </div>
          )}

          {/* Site web de l'entreprise */}
          {associatedCompany?.canonical_url && (
            <div className="flex items-start gap-2">
              <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              <a 
                href={associatedCompany.canonical_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs break-all leading-relaxed"
                onClick={(e) => e.stopPropagation()}
              >
                Site web
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const EmployeeRow: React.FC<{ employee: Employee }> = ({ employee }) => {
    const associatedCompany = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(associatedCompany?.name, associatedCompany?.canonical_url);
    const employeeName = getEmployeeDisplayName(employee);

    return (
      <div 
        className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => handleEmployeeClick(employee)}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium truncate">{employeeName}</span>
              {employee.poste && (
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  <Briefcase className="h-3 w-3 mr-1" />
                  {employee.poste}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Building className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{companyName}</span>
            </div>
            {associatedCompany?.adresse && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{associatedCompany.adresse}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex gap-2">
              {employee.email && <Mail className="h-4 w-4 text-muted-foreground" />}
              {employee.tel && <Phone className="h-4 w-4 text-muted-foreground" />}
              {associatedCompany?.canonical_url && <Globe className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </div>
        
        <div className="text-right flex-shrink-0">
          <div className="text-sm">
            {employee.email && <div className="truncate max-w-48">{employee.email}</div>}
            {employee.tel && <div>{employee.tel}</div>}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-3 md:p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Chargement des contacts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Contacts</h1>
        <p className="text-muted-foreground">
          Tous les contacts et employés de vos entreprises
        </p>
      </div>

      {/* Métriques optimisées pour mobile - 2 colonnes */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{allEmployees.length}</div>
            <p className="text-xs text-muted-foreground">Contacts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec Email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">{withEmailCount}</div>
            <p className="text-xs text-muted-foreground">
              {allEmployees.length > 0 ? Math.round((withEmailCount / allEmployees.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec Téléphone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{withPhoneCount}</div>
            <p className="text-xs text-muted-foreground">Téléphone disponible</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avec Poste</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-purple-600">{withPositionCount}</div>
            <p className="text-xs text-muted-foreground">Poste renseigné</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et recherche optimisés pour mobile */}
      <div className="space-y-3 md:space-y-0 md:flex md:gap-4 md:items-center md:flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, entreprise, email, téléphone ou poste..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-3 items-center">
          <Select value={filterBy} onValueChange={setFilterBy}>
            <SelectTrigger className="w-40 md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les contacts</SelectItem>
              <SelectItem value="has-email">Avec email</SelectItem>
              <SelectItem value="has-phone">Avec téléphone</SelectItem>
              <SelectItem value="has-both">Email + téléphone</SelectItem>
              <SelectItem value="has-position">Avec poste</SelectItem>
            </SelectContent>
          </Select>

          {/* Toggle grille/liste unifié */}
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
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredEmployees.length} contact{filteredEmployees.length > 1 ? 's' : ''} trouvé{filteredEmployees.length > 1 ? 's' : ''}
      </div>

      {/* Formulaire d'ajout rapide */}
      <AddContactForm 
        onContactAdded={handleContactAdded}
        className="mb-6"
      />

      {/* Grille de contacts optimisée pour mobile */}
      {viewMode === 'cards' ? (
        <div className="grid gap-3 grid-cols-2 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEmployees.map((employee) => (
            <EmployeeRow key={employee.id} employee={employee} />
          ))}
        </div>
      )}

      {filteredEmployees.length === 0 && (
        <div className="text-center py-8 md:py-12">
          <Users className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm md:text-base">Aucun contact trouvé</h3>
          <p className="text-muted-foreground text-xs md:text-sm">
            {allEmployees.length === 0 
              ? "Aucun contact n'a été trouvé dans vos entreprises."
              : "Essayez d'ajuster vos critères de recherche ou de filtrage."
            }
          </p>
        </div>
      )}

      {/* Modal d'édition d'employé */}
      <EditEmployeeModal
        open={showEditEmployeeModal}
        onOpenChange={setShowEditEmployeeModal}
        employee={selectedEmployee}
        companyName={selectedCompanyName}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </div>
  );
};