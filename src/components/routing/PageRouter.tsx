"use client";

import React, { useState } from "react";
import { useNavigation } from "./NavigationContext";
import { DashboardPage } from "../DashboardPage";
import { ResultsPage } from "../ResultsPage";
import { NewSearchPage } from "../NewSearchPage";
import { AllCompaniesPage } from "../AllCompaniesPage";
import { QualificationPage } from "../QualificationPage";
import { QualifiedCompaniesPage } from "../QualifiedCompaniesPage";
import { ContactsPage } from "../ContactsPage";
import { OpportunitiesPage } from "../OpportunitiesPage";
import { PipelinePage } from "../PipelinePage";
import { ObjectivesProgressPage } from "../ObjectivesProgressPage";
import { SettingsPage } from "../SettingsPage";
import { CompanyDetailPage } from "../CompanyDetailPage";
import { EmployeeDetailPage } from "../EmployeeDetailPage";

const CreatePage: React.FC = () => (
  <div className="p-6">
    <h1>Créer</h1>
    <p className="text-muted-foreground">Fonctionnalité de création à venir...</p>
  </div>
);

export const PageRouter: React.FC = () => {
  // On ne lit que ce que le NavContext expose réellement
  const { currentPage, setCurrentPage } = useNavigation();

  // Sélections locales
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedQualifiedCompanyId, setSelectedQualifiedCompanyId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null); // <- string

  // Adapteurs de callback avec la signature exacte attendue par les pages enfants
  const handleNavigateToCompany = (id: number) => setSelectedCompanyId(id);
  const handleQualifiedClick = (id: number) => setSelectedQualifiedCompanyId(id);
  const handleEmployeeClick = (employeeId: string) => setSelectedEmployeeId(employeeId); // <- string

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />;

      case "results":
        return <ResultsPage />;

      case "new-search":
        return <NewSearchPage />;

      case "all-companies":
        return selectedCompanyId !== null ? (
          <CompanyDetailPage
            companyId={selectedCompanyId as number}
            onBack={() => {
              setSelectedCompanyId(null);
              setCurrentPage("all-companies");
            }}
          />
        ) : (
          <AllCompaniesPage onNavigateToCompany={handleNavigateToCompany} />
        );

      case "qualification":
        return <QualificationPage />;

      case "qualified":
        return selectedQualifiedCompanyId !== null ? (
          <CompanyDetailPage
            companyId={selectedQualifiedCompanyId as number}
            onBack={() => {
              setSelectedQualifiedCompanyId(null);
              setCurrentPage("qualified");
            }}
          />
        ) : (
          <QualifiedCompaniesPage onContactClick={handleQualifiedClick} />
        );

      case "contacts":
        return selectedEmployeeId !== null ? (
          <EmployeeDetailPage
            employeeId={selectedEmployeeId as string} // <- string
            onBack={() => {
              setSelectedEmployeeId(null);
              setCurrentPage("contacts");
            }}
          />
        ) : (
          <ContactsPage onEmployeeClick={handleEmployeeClick} /> // <- string callback
        );

      case "opportunities":
        return <OpportunitiesPage />;

      case "pipeline":
        return <PipelinePage />;

      case "objectives":
        return <ObjectivesProgressPage />;

      case "settings":
        return <SettingsPage />;

      case "create":
        return <CreatePage />;

      default:
        return <DashboardPage />;
    }
  };

  return renderPage();
};
