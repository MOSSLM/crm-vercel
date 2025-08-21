import React from 'react';
import { useNavigation } from './NavigationContext';
import { PageLoadingSkeleton } from './PageLoadingSkeleton';
import { DashboardPage } from '../DashboardPage';
import { ResultsPage } from '../ResultsPage';
import { NewSearchPage } from '../NewSearchPage';
import { AllCompaniesPage } from '../AllCompaniesPage';
import { QualificationPage } from '../QualificationPage';
import { QualifiedCompaniesPage } from '../QualifiedCompaniesPage';
import { ContactsPage } from '../ContactsPage';
import { OpportunitiesPage } from '../OpportunitiesPage';
import { PipelinePage } from '../PipelinePage';
import { ObjectivesProgressPage } from '../ObjectivesProgressPage';
import { SettingsPage } from '../SettingsPage';
import { CompanyDetailPage } from '../CompanyDetailPage';
import { EmployeeDetailPage } from '../EmployeeDetailPage';

const CreatePage: React.FC = () => (
  <div className="p-6">
    <h1>Créer</h1>
    <p className="text-muted-foreground">
      Fonctionnalité de création à venir...
    </p>
  </div>
);

export const PageRouter: React.FC = () => {
  const {
    currentPage,
    selectedCompanyId,
    selectedQualifiedCompanyId,
    selectedEmployeeId,
    setSelectedCompanyId,
    setSelectedQualifiedCompanyId,
    setSelectedEmployeeId,
    setCurrentPage
  } = useNavigation();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      
      case 'results':
        return <ResultsPage />;
      
      case 'new-search':
        return <NewSearchPage />;
      
      case 'all-companies':
        return selectedCompanyId ? (
          <CompanyDetailPage 
            companyId={selectedCompanyId} 
            onBack={() => {
              setSelectedCompanyId(null);
              setCurrentPage('all-companies');
            }} 
          />
        ) : (
          <AllCompaniesPage onNavigateToCompany={setSelectedCompanyId} />
        );
      
      case 'qualification':
        return <QualificationPage />;
      
      case 'qualified':
        return selectedQualifiedCompanyId ? (
          <CompanyDetailPage 
            companyId={selectedQualifiedCompanyId} 
            onBack={() => {
              setSelectedQualifiedCompanyId(null);
              setCurrentPage('qualified');
            }} 
          />
        ) : (
          <QualifiedCompaniesPage onContactClick={setSelectedQualifiedCompanyId} />
        );
      
      case 'contacts':
        return selectedEmployeeId ? (
          <EmployeeDetailPage 
            employeeId={selectedEmployeeId} 
            onBack={() => {
              setSelectedEmployeeId(null);
              setCurrentPage('contacts');
            }}
          />
        ) : (
          <ContactsPage onEmployeeClick={setSelectedEmployeeId} />
        );
      
      case 'opportunities':
        return <OpportunitiesPage />;
      
      case 'pipeline':
        return <PipelinePage />;
      
      case 'objectives':
        return <ObjectivesProgressPage />;
      
      case 'settings':
        return <SettingsPage />;
      
      case 'create':
        return <CreatePage />;
      
      default:
        return <DashboardPage />;
    }
  };

  return renderPage();
};