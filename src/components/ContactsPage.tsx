"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppData } from "./AppDataContext";
import { Contact } from "@/types";
import { EditEmployeeModal } from "./EditEmployeeModal";
import { AddContactForm } from "./AddContactForm";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
} from "lucide-react";
import logger from "../utils/logger";

interface Employee {
  id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  tel?: string;
  poste?: string;
  entreprise_id: number;
}

export const ContactsPage: React.FC = () => {
  const { companies, contacts, refreshData, loading: appDataLoading } = useAppData();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");

  const mappedContacts = useMemo(
    () =>
      contacts.map((contact: Contact) => ({
        id: contact.id,
        entreprise_id: contact.entreprise_id,
        nom: contact.nom ?? contact.last_name,
        prenom: contact.prenom ?? contact.first_name,
        email: contact.email,
        tel: contact.tel,
        poste: contact.poste ?? contact.role_title,
      })),
    [contacts],
  );

  useEffect(() => {
    setAllEmployees(mappedContacts);
    setLoading(appDataLoading && mappedContacts.length === 0);
  }, [mappedContacts, appDataLoading]);

  const getEmployeeDisplayName = (employee: Employee) => {
    if (employee.prenom && employee.nom) return `${employee.prenom} ${employee.nom}`;
    if (employee.nom) return employee.nom;
    if (employee.prenom) return employee.prenom;
    return "Employé";
  };

  const getCompanyForEmployee = (employeeId: number) =>
    companies.find((company) => company.id === employeeId);

  const filteredEmployees = allEmployees.filter((employee) => {
    const associatedCompany = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(associatedCompany?.name, associatedCompany?.canonical_url);
    const employeeName = getEmployeeDisplayName(employee);

    const matchesSearch =
      !searchTerm ||
      employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (employee.tel && employee.tel.includes(searchTerm)) ||
      (employee.poste && employee.poste.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesFilter =
      filterBy === "all" ||
      (filterBy === "has-email" && employee.email) ||
      (filterBy === "has-phone" && employee.tel) ||
      (filterBy === "has-both" && employee.email && employee.tel) ||
      (filterBy === "has-position" && employee.poste);

    return matchesSearch && matchesFilter;
  });

  const withEmailCount = allEmployees.filter((e) => e.email).length;
  const withPhoneCount = allEmployees.filter((e) => e.tel).length;
  const withPositionCount = allEmployees.filter((e) => e.poste).length;

  const handleEmployeeClick = (employee: Employee) => {
    const company = getCompanyForEmployee(employee.entreprise_id);
    setSelectedEmployee(employee);
    setSelectedCompanyName(getCompanyDisplayName(company?.name, company?.canonical_url));
    setShowEditEmployeeModal(true);
  };

  const handleEmployeeUpdated = async () => {
    setSelectedEmployee(null);
    setSelectedCompanyName("");
    setLoading(true);
    try {
      await refreshData();
      toast.success("Contact mis à jour avec succès");
    } catch (error) {
      logger.error("Error refreshing contacts after update:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleContactAdded = async () => {
    setLoading(true);
    try {
      await refreshData();
    } catch (error) {
      logger.error("Error refreshing contacts after addition:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Tous les contacts et employés de vos entreprises
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total" value={allEmployees.length} description="Contacts" />
        <MetricCard
          label="Avec Email"
          value={withEmailCount}
          description={`${allEmployees.length > 0 ? Math.round((withEmailCount / allEmployees.length) * 100) : 0}% du total`}
          color="text-green-600"
        />
        <MetricCard label="Avec Téléphone" value={withPhoneCount} description="Téléphone disponible" color="text-blue-600" />
        <MetricCard label="Avec Poste" value={withPositionCount} description="Poste renseigné" color="text-teal-600" />
      </div>

      {/* Search + filters */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, entreprise, email, téléphone ou poste..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les contacts</SelectItem>
                <SelectItem value="has-email">Avec email</SelectItem>
                <SelectItem value="has-phone">Avec téléphone</SelectItem>
                <SelectItem value="has-both">Email + téléphone</SelectItem>
                <SelectItem value="has-position">Avec poste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => { if (v) setViewMode(v as "cards" | "list"); }}
          >
            <ToggleGroupItem value="cards" aria-label="Vue cartes">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Vue liste">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredEmployees.length} contact{filteredEmployees.length > 1 ? "s" : ""} trouvé
        {filteredEmployees.length > 1 ? "s" : ""}
      </p>

      <AddContactForm onContactAdded={handleContactAdded} />

      {viewMode === "cards" ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((employee) => (
            <ContactCard
              key={employee.id}
              employee={employee}
              getCompany={getCompanyForEmployee}
              onClick={handleEmployeeClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredEmployees.map((employee) => (
            <ContactRow
              key={employee.id}
              employee={employee}
              getCompany={getCompanyForEmployee}
              onClick={handleEmployeeClick}
            />
          ))}
        </div>
      )}

      {filteredEmployees.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Users className="h-11 w-11 text-muted-foreground" />
          <p className="font-medium">Aucun contact trouvé</p>
          <p className="text-sm text-muted-foreground">
            {allEmployees.length === 0
              ? "Aucun contact n'a été trouvé dans vos entreprises."
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
    </div>
  );
};

/* ─── Sub-components ─── */

function MetricCard({
  label, value, description, color,
}: {
  label: string; value: number; description: string; color?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

type CompanyLike = { name?: string | null; canonical_url?: string | null; adresse?: string | null } | undefined;

function ContactCard({
  employee, getCompany, onClick,
}: {
  employee: Employee;
  getCompany: (id: number) => CompanyLike;
  onClick: (employee: Employee) => void;
}) {
  const company = getCompany(employee.entreprise_id);
  const employeeName = `${employee.prenom ?? ""} ${employee.nom ?? ""}`.trim() || "Employé";
  const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);

  return (
    <div
      className="rounded-xl border bg-card p-4 cursor-pointer hover:shadow-md transition-shadow space-y-2"
      onClick={() => onClick(employee)}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <User className="h-4 w-4" />
        </div>
        <span className="font-semibold">{employeeName}</span>
        {employee.poste && (
          <Badge variant="secondary" className="text-xs">
            <Briefcase className="h-3 w-3 mr-1" />
            {employee.poste}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Building className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{companyName}</span>
      </div>

      {employee.email && (
        <div className="flex items-center gap-1.5 text-sm">
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{employee.email}</span>
        </div>
      )}

      {employee.tel && (
        <div className="flex items-center gap-1.5 text-sm">
          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{employee.tel}</span>
        </div>
      )}

      {company?.adresse && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{company.adresse}</span>
        </div>
      )}

      {company?.canonical_url && (
        <a
          href={company.canonical_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-accent-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <Globe className="h-3.5 w-3.5" />
          Site web
        </a>
      )}
    </div>
  );
}

function ContactRow({
  employee, getCompany, onClick,
}: {
  employee: Employee;
  getCompany: (id: number) => CompanyLike;
  onClick: (employee: Employee) => void;
}) {
  const company = getCompany(employee.entreprise_id);
  const employeeName = `${employee.prenom ?? ""} ${employee.nom ?? ""}`.trim() || "Employé";
  const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);

  return (
    <div
      className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => onClick(employee)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{employeeName}</span>
            {employee.poste && (
              <Badge variant="outline" className="text-xs">{employee.poste}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{companyName}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {employee.email && (
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="a un email" tabIndex={-1}>
            <Mail className="h-4 w-4" />
          </Button>
        )}
        {employee.tel && (
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="a un téléphone" tabIndex={-1}>
            <Phone className="h-4 w-4" />
          </Button>
        )}
        {company?.canonical_url && (
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="a un site web" tabIndex={-1}>
            <Globe className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
