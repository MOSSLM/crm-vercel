"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { useAppData } from "./AppDataContext";
import { Contact } from "@/types";
import { EditEmployeeModal } from "./EditEmployeeModal";
import { AddContactForm } from "./AddContactForm";
import { getCompanyDisplayName } from "../utils/displayHelpers";
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

interface ContactsPageProps {
  onEmployeeClick?: (employeeId: string) => void;
}

export const ContactsPage: React.FC<ContactsPageProps> = () => {
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

  const getCompanyForEmployee = (employeeId: number) => companies.find((company) => company.id === employeeId);

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

  const withEmailCount = allEmployees.filter((employee) => employee.email).length;
  const withPhoneCount = allEmployees.filter((employee) => employee.tel).length;
  const withPositionCount = allEmployees.filter((employee) => employee.poste).length;

  const handleEmployeeClick = (employee: Employee) => {
    const company = getCompanyForEmployee(employee.entreprise_id);
    const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);

    setSelectedEmployee(employee);
    setSelectedCompanyName(companyName);
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
      <Stack p="lg" align="center" gap="sm">
        <Loader />
        <Text c="dimmed">Chargement des contacts...</Text>
      </Stack>
    );
  }

  return (
    <Stack p={{ base: "md", md: "lg" }} gap="md">
      <Stack gap={2}>
        <Text component="h1" fw={700} size="xl">
          Contacts
        </Text>
        <Text c="dimmed">Tous les contacts et employés de vos entreprises</Text>
      </Stack>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <MetricCard label="Total" value={allEmployees.length} description="Contacts" />
        <MetricCard
          label="Avec Email"
          value={withEmailCount}
          description={`${allEmployees.length > 0 ? Math.round((withEmailCount / allEmployees.length) * 100) : 0}% du total`}
          color="green"
        />
        <MetricCard label="Avec Téléphone" value={withPhoneCount} description="Téléphone disponible" color="blue" />
        <MetricCard label="Avec Poste" value={withPositionCount} description="Poste renseigné" color="teal" />
      </SimpleGrid>

      <Paper withBorder p="sm" radius="lg">
        <Stack gap="sm">
          <TextInput
            placeholder="Rechercher par nom, entreprise, email, téléphone ou poste..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            leftSection={<Search size={16} />}
          />
          <Group justify="space-between" wrap="wrap">
            <Select
              data={[
                { value: "all", label: "Tous les contacts" },
                { value: "has-email", label: "Avec email" },
                { value: "has-phone", label: "Avec téléphone" },
                { value: "has-both", label: "Email + téléphone" },
                { value: "has-position", label: "Avec poste" },
              ]}
              value={filterBy}
              onChange={(value) => setFilterBy(value ?? "all")}
              leftSection={<Filter size={16} />}
              w={{ base: "100%", sm: 240 }}
            />

            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as "cards" | "list")}
              data={[
                { value: "cards", label: <LayoutGrid size={16} /> },
                { value: "list", label: <List size={16} /> },
              ]}
            />
          </Group>
        </Stack>
      </Paper>

      <Text size="sm" c="dimmed">
        {filteredEmployees.length} contact{filteredEmployees.length > 1 ? "s" : ""} trouvé
        {filteredEmployees.length > 1 ? "s" : ""}
      </Text>

      <AddContactForm onContactAdded={handleContactAdded} />

      {viewMode === "cards" ? (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
          {filteredEmployees.map((employee) => (
            <ContactCard key={employee.id} employee={employee} getCompany={getCompanyForEmployee} onClick={handleEmployeeClick} />
          ))}
        </SimpleGrid>
      ) : (
        <Stack gap="xs">
          {filteredEmployees.map((employee) => (
            <ContactRow key={employee.id} employee={employee} getCompany={getCompanyForEmployee} onClick={handleEmployeeClick} />
          ))}
        </Stack>
      )}

      {filteredEmployees.length === 0 && (
        <Stack align="center" py="xl" gap="xs">
          <Users size={44} />
          <Text fw={500}>Aucun contact trouvé</Text>
          <Text c="dimmed" size="sm" ta="center">
            {allEmployees.length === 0
              ? "Aucun contact n&apos;a été trouvé dans vos entreprises."
              : "Essayez d&apos;ajuster vos critères de recherche ou de filtrage."}
          </Text>
        </Stack>
      )}

      <EditEmployeeModal
        open={showEditEmployeeModal}
        onOpenChange={setShowEditEmployeeModal}
        employee={selectedEmployee}
        companyName={selectedCompanyName}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </Stack>
  );
};

function MetricCard({
  label,
  value,
  description,
  color,
}: {
  label: string;
  value: number;
  description: string;
  color?: string;
}) {
  return (
    <Card withBorder radius="lg" p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {description}
      </Text>
    </Card>
  );
}

function ContactCard({
  employee,
  getCompany,
  onClick,
}: {
  employee: Employee;
  getCompany: (id: number) => { name?: string | null; canonical_url?: string | null; adresse?: string | null } | undefined;
  onClick: (employee: Employee) => void;
}) {
  const company = getCompany(employee.entreprise_id);
  const employeeName = `${employee.prenom ?? ""} ${employee.nom ?? ""}`.trim() || "Employé";
  const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);

  return (
    <Card withBorder radius="lg" p="md" style={{ cursor: "pointer" }} onClick={() => onClick(employee)}>
      <Stack gap="xs">
        <Group gap="xs" align="center">
          <ThemeIcon variant="light">
            <User size={16} />
          </ThemeIcon>
          <Text fw={600}>{employeeName}</Text>
          {employee.poste && (
            <Badge variant="light" leftSection={<Briefcase size={12} />}>
              {employee.poste}
            </Badge>
          )}
        </Group>

        <Group gap={6} wrap="nowrap">
          <Building size={14} />
          <Text size="sm" c="dimmed" truncate>
            {companyName}
          </Text>
        </Group>

        {employee.email && (
          <Group gap={6} wrap="nowrap">
            <Mail size={14} />
            <Text size="sm" truncate>
              {employee.email}
            </Text>
          </Group>
        )}

        {employee.tel && (
          <Group gap={6}>
            <Phone size={14} />
            <Text size="sm">{employee.tel}</Text>
          </Group>
        )}

        {company?.adresse && (
          <Group gap={6} wrap="nowrap">
            <MapPin size={14} />
            <Text size="xs" c="dimmed" truncate>
              {company.adresse}
            </Text>
          </Group>
        )}

        {company?.canonical_url && (
          <Anchor href={company.canonical_url} target="_blank" rel="noopener noreferrer" size="sm" onClick={(event) => event.stopPropagation()}>
            <Group gap={6}>
              <Globe size={14} />
              <span>Site web</span>
            </Group>
          </Anchor>
        )}
      </Stack>
    </Card>
  );
}

function ContactRow({
  employee,
  getCompany,
  onClick,
}: {
  employee: Employee;
  getCompany: (id: number) => { name?: string | null; canonical_url?: string | null; adresse?: string | null } | undefined;
  onClick: (employee: Employee) => void;
}) {
  const company = getCompany(employee.entreprise_id);
  const employeeName = `${employee.prenom ?? ""} ${employee.nom ?? ""}`.trim() || "Employé";
  const companyName = getCompanyDisplayName(company?.name, company?.canonical_url);

  return (
    <Paper withBorder radius="md" p="sm" style={{ cursor: "pointer" }} onClick={() => onClick(employee)}>
      <Group justify="space-between" wrap="nowrap">
        <Group wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light">
            <User size={16} />
          </ThemeIcon>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="wrap">
              <Text fw={500} truncate>
                {employeeName}
              </Text>
              {employee.poste && <Badge variant="outline">{employee.poste}</Badge>}
            </Group>
            <Text size="sm" c="dimmed" truncate>
              {companyName}
            </Text>
          </Stack>
        </Group>

        <Group gap={4} wrap="nowrap">
          {employee.email && (
            <ActionIcon variant="subtle" color="gray" aria-label="a un email">
              <Mail size={16} />
            </ActionIcon>
          )}
          {employee.tel && (
            <ActionIcon variant="subtle" color="gray" aria-label="a un téléphone">
              <Phone size={16} />
            </ActionIcon>
          )}
          {company?.canonical_url && (
            <ActionIcon variant="subtle" color="gray" aria-label="a un site web">
              <Globe size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Paper>
  );
}
