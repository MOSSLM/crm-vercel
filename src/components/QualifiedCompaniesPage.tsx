"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useAppData, Contact } from "./AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { EditEmployeeModal } from "./EditEmployeeModal";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { LayoutGrid, List, Search, Filter, CheckCircle } from "lucide-react";
import { Employee, QualifiedCompaniesPageProps, QUALIFIED_COMPANIES_CONSTANTS } from "./qualified/types";
import { CompanyCard } from "./qualified/CompanyCard";
import { CompanyRow } from "./qualified/CompanyRow";
import { calculateMetrics, filterCompanies } from "./qualified/utils";
import { QualifiedColdCallWorkspace } from "./QualifiedColdCallWorkspace";
import logger from "../utils/logger";

export const QualifiedCompaniesPage: React.FC<QualifiedCompaniesPageProps> = ({ onContactClick }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companies, contacts, refreshData } = useAppData();
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [qualifiedMode, setQualifiedMode] = useState<"standard" | "cold_call">(
    searchParams.get("mode") === "cold_call" ? "cold_call" : "standard"
  );
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Entreprises qualifiées
  const qualifiedCompanies = companies.filter((c) => c.qualifie);

  const companyEmployees = React.useMemo(() => {
    const employeesMap: Record<number, Employee[]> = {};

    qualifiedCompanies.forEach((company) => {
      const employeesForCompany = contacts
        .filter((contact) => contact.entreprise_id === company.id)
        .map((contact: Contact) => ({
          id: contact.id,
          entreprise_id: contact.entreprise_id,
          nom: contact.nom ?? contact.last_name,
          prenom: contact.prenom ?? contact.first_name,
          email: contact.email,
          tel: contact.tel,
          poste: contact.poste ?? contact.role_title,
        }));

      employeesMap[company.id] = employeesForCompany;
    });

    return employeesMap;
  }, [qualifiedCompanies, contacts]);

  // Filtrage
  const filteredCompanies = React.useMemo(
    () => filterCompanies(qualifiedCompanies, companyEmployees, searchTerm, filterBy, getCompanyDisplayName),
    [qualifiedCompanies, companyEmployees, searchTerm, filterBy]
  );

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / QUALIFIED_COMPANIES_CONSTANTS.ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * QUALIFIED_COMPANIES_CONSTANTS.ITEMS_PER_PAGE;
  const paginatedCompanies = filteredCompanies.slice(startIndex, startIndex + QUALIFIED_COMPANIES_CONSTANTS.ITEMS_PER_PAGE);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterBy]);

  React.useEffect(() => {
    setQualifiedMode(searchParams.get("mode") === "cold_call" ? "cold_call" : "standard");
  }, [searchParams]);

  const { withEmailCount, withPhoneCount, withBothCount, withEmployeesCount } = React.useMemo(
    () => calculateMetrics(qualifiedCompanies, companyEmployees),
    [qualifiedCompanies, companyEmployees]
  );

  // Clic sur un employé dans la ligne (empêche la navigation de la ligne)
  const handleEmployeeClick = (employee: Employee, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const company = companies.find((c) => c.id === employee.entreprise_id);
    const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);
    setSelectedEmployee(employee);
    setSelectedCompanyName(companyName);
    setShowEditEmployeeModal(true);
  };

  const handleEmployeeUpdated = async () => {
    setSelectedEmployee(null);
    setSelectedCompanyName("");
    try {
      await refreshData();
    } catch (error) {
      logger.error("Error refreshing contacts after update:", error);
    }
  };

  // Navigation helper
  const goToCompany = (id: number) => router.push(`/qualified/${id}`);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1>Entreprises Qualifiées</h1>
        <p className="text-muted-foreground">Gestion de vos entreprises qualifiées</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant={qualifiedMode === "standard" ? "default" : "outline"} onClick={() => setQualifiedMode("standard")}>Vue standard</Button>
        <Button variant={qualifiedMode === "cold_call" ? "default" : "outline"} onClick={() => setQualifiedMode("cold_call")}>Mode Cold Call CRM</Button>
      </div>

      {qualifiedMode === "cold_call" && <QualifiedColdCallWorkspace />}

      {qualifiedMode === "standard" && (
        <>

      {/* Métriques */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{qualifiedCompanies.length}</div>
            <p className="text-xs text-muted-foreground">Entreprises qualifiées</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avec Email</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">{withEmailCount}</div>
            <p className="text-xs text-muted-foreground">
              {qualifiedCompanies.length > 0 ? Math.round((withEmailCount / qualifiedCompanies.length) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avec Téléphone</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{withPhoneCount}</div>
            <p className="text-xs text-muted-foreground">Téléphone disponible</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Avec Employés</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-purple-600">{withEmployeesCount}</div>
            <p className="text-xs text-muted-foreground">Contacts renseignés</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="space-y-3 md:space-y-0 md:flex md:gap-4 md:items-center md:flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, adresse ou contact..."
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
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              <SelectItem value="has-email">Avec email</SelectItem>
              <SelectItem value="has-phone">Avec téléphone</SelectItem>
              <SelectItem value="has-both">Email + téléphone</SelectItem>
              <SelectItem value="has-employees">Avec employés</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex border rounded-lg">
            <Button variant={viewMode === "cards" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("cards")} className="rounded-r-none">
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-l-none">
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""} trouvée{filteredCompanies.length > 1 ? "s" : ""}
      </div>

      {/* Cartes (plus de <Link> ici) */}
      {viewMode === "cards" ? (
        <div className="grid gap-3 grid-cols-1 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paginatedCompanies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              employees={companyEmployees[company.id] || []}
              // Utilise le clic sur la carte pour naviguer
              onContactClick={() => goToCompany(company.id)}
            />
          ))}
        </div>
      ) : (
        // Liste : on rend la ligne cliquable (div), pas de <Link>
        <div className="space-y-2">
          {paginatedCompanies.map((company) => (
            <div
              key={company.id}
              role="link"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => goToCompany(company.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToCompany(company.id)}
            >
              <CompanyRow
                company={company}
                employees={companyEmployees[company.id] || []}
                onContactClick={onContactClick}
                onEmployeeClick={handleEmployeeClick} // empêche la propagation
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

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

              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 3) pageNum = i + 1;
                else if (currentPage <= 2) pageNum = i + 1;
                else if (currentPage >= totalPages - 1) pageNum = totalPages - 2 + i;
                else pageNum = currentPage - 1 + i;

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
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages} ({filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? "s" : ""} au total)
          </div>
        </div>
      )}

      {filteredCompanies.length === 0 && (
        <div className="text-center py-8 md:py-12">
          <CheckCircle className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-sm md:text-base">Aucune entreprise qualifiée trouvée</h3>
          <p className="text-muted-foreground text-xs md:text-sm">
            {qualifiedCompanies.length === 0
              ? "Aucune entreprise n'a encore été qualifiée."
              : "Essayez d'ajuster vos critères de recherche ou de filtrage."}
          </p>
        </div>
      )}

      <EditEmployeeModal
        open={showEditEmployeeModal}
        onOpenChange={setShowEditEmployeeModal}
        employee={selectedEmployee}
        companyName={selectedCompanyName}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
        </>
      )}
    </div>
  );
};
