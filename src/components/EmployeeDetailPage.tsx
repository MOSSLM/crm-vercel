"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAppData, Contact } from "./AppDataContext";
import { Company } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Globe,
  Phone as PhoneIcon,
  Mail,
  MapPin,
  User,
  Edit3,
  Building,
  Briefcase,
} from "lucide-react";

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

interface EmployeeDetailPageProps {
  employeeId: string;
  onBack: () => void;
}

// Les champs éditables du formulaire
type EmployeeForm = Pick<Employee, "nom" | "prenom" | "email" | "tel" | "poste">;

export const EmployeeDetailPage: React.FC<EmployeeDetailPageProps> = ({
  employeeId,
  onBack,
}) => {
  const { companies, contacts, updateContact, loading: appDataLoading } = useAppData();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [associatedCompany, setAssociatedCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<EmployeeForm>({
    nom: "",
    prenom: "",
    email: "",
    tel: "",
    poste: "",
  });

  const contactFromContext = useMemo(() => {
    return contacts.find((c) => c.id === employeeId) || null;
  }, [contacts, employeeId]);

  useEffect(() => {
    if (appDataLoading) {
      setLoading(true);
      return;
    }

    setLoading(false);

    if (contactFromContext) {
      const mappedEmployee: Employee = {
        id: contactFromContext.id,
        entreprise_id: contactFromContext.entreprise_id,
        nom: contactFromContext.nom ?? contactFromContext.last_name,
        prenom: contactFromContext.prenom ?? contactFromContext.first_name,
        email: contactFromContext.email,
        tel: contactFromContext.tel,
        poste: contactFromContext.poste ?? contactFromContext.role_title,
      };

      setEmployee(mappedEmployee);
      const company = companies.find((c) => c.id === contactFromContext.entreprise_id) ?? null;
      setAssociatedCompany(company);

      const {
        nom = "",
        prenom = "",
        email = "",
        tel = "",
        poste = "",
      } = mappedEmployee;

      setFormData({ nom, prenom, email, tel, poste });
    } else {
      setEmployee(null);
      setAssociatedCompany(null);
    }
  }, [appDataLoading, contactFromContext, companies]);

  const handleSave = async () => {
    if (!employee) return;

    setIsLoading(true);
    try {
      const updatedData: Partial<Contact> = {
        last_name: formData.nom?.trim() || undefined,
        first_name: formData.prenom?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        tel: formData.tel?.trim() || undefined,
        role_title: formData.poste?.trim() || undefined,
      };

      await updateContact(employee.id, updatedData);

      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              nom: updatedData.last_name ?? prev.nom,
              prenom: updatedData.first_name ?? prev.prenom,
              email: updatedData.email ?? prev.email,
              tel: updatedData.tel ?? prev.tel,
              poste: updatedData.role_title ?? prev.poste,
            }
          : prev
      );
      setIsEditing(false);
      toast.success("Contact mis à jour avec succès");
    } catch (error) {
      logger.error("Erreur lors de la mise à jour:", error);
      toast.error("Erreur lors de la mise à jour du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (employee) {
      const {
        nom = "",
        prenom = "",
        email = "",
        tel = "",
        poste = "",
      } = employee;
      setFormData({ nom, prenom, email, tel, poste });
    }
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof EmployeeForm, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const getEmployeeDisplayName = () => {
    if (!employee) return "Contact";
    if (employee.prenom && employee.nom) return `${employee.prenom} ${employee.nom}`;
    if (employee.nom) return employee.nom;
    if (employee.prenom) return employee.prenom;
    return "Contact";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement du contact...</p>
        </div>
      </div>
    );
  }

  if (!employee || !associatedCompany) {
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
            Le contact demandé n&apos;existe pas ou n&apos;est plus disponible.
          </p>
        </div>
      </div>
    );
  }

  const displayName = getEmployeeDisplayName();
  const companyDisplayName = getCompanyDisplayName(
    associatedCompany?.name,
    associatedCompany?.canonical_url
  );

  const currentData: EmployeeForm = isEditing
    ? formData
    : {
        nom: employee.nom ?? "",
        prenom: employee.prenom ?? "",
        email: employee.email ?? "",
        tel: employee.tel ?? "",
        poste: employee.poste ?? "",
      };

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
              <User className="h-5 w-5" />
              {displayName}
            </h1>
            <p className="text-muted-foreground">
              Contact chez {companyDisplayName} • ID: {employee.id}
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
                {isLoading ? "Sauvegarde..." : "Sauvegarder"}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations principales */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informations personnelles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="nom">Nom</Label>
                  {isEditing ? (
                    <Input
                      id="nom"
                      value={currentData.nom}
                      onChange={(e) => handleInputChange("nom", e.target.value)}
                      placeholder="Nom de famille"
                    />
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded">
                      {currentData.nom || "Non renseigné"}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="prenom">Prénom</Label>
                  {isEditing ? (
                    <Input
                      id="prenom"
                      value={currentData.prenom}
                      onChange={(e) => handleInputChange("prenom", e.target.value)}
                      placeholder="Prénom"
                    />
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded">
                      {currentData.prenom || "Non renseigné"}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="poste" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Poste
                </Label>
                {isEditing ? (
                  <Input
                    id="poste"
                    value={currentData.poste}
                    onChange={(e) => handleInputChange("poste", e.target.value)}
                    placeholder="Directeur, Commercial, etc."
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {currentData.poste ? (
                      <Badge variant="outline" className="text-sm">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {currentData.poste}
                      </Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">Non renseigné</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneIcon className="h-5 w-5" />
                Informations de contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                {isEditing ? (
                  <Input
                    id="email"
                    type="email"
                    value={currentData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
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
                <Label htmlFor="tel" className="flex items-center gap-2">
                  <PhoneIcon className="h-4 w-4" />
                  Téléphone
                </Label>
                {isEditing ? (
                  <Input
                    id="tel"
                    type="tel"
                    value={currentData.tel}
                    onChange={(e) => handleInputChange("tel", e.target.value)}
                    placeholder="+33 1 23 45 67 89"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {currentData.tel ? (
                      <a
                        href={`tel:${currentData.tel}`}
                        className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                      >
                        <PhoneIcon className="h-3 w-3" />
                        {currentData.tel}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">Non renseigné</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Entreprise associée */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Entreprise
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nom de l&apos;entreprise</Label>
                <p className="text-sm p-2 bg-muted rounded">{companyDisplayName}</p>
              </div>

              {associatedCompany?.canonical_url && (
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

              {associatedCompany?.adresse && (
                <div>
                  <Label>Adresse</Label>
                  <p className="text-sm p-2 bg-muted rounded flex items-start gap-2">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {associatedCompany.adresse}
                  </p>
                </div>
              )}

              {associatedCompany?.premiers_tags && (
                <div>
                  <Label>Tags de l&apos;entreprise</Label>
                  <div className="flex flex-wrap gap-1 p-2 bg-muted rounded">
                    {associatedCompany.premiers_tags
                      .split(",")
                      .map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag.trim()}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
                    <PhoneIcon className="h-4 w-4 mr-2" />
                    Appeler
                  </a>
                </Button>
              )}

              {associatedCompany?.canonical_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a
                    href={associatedCompany.canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">ID du contact</span>
                <span className="text-sm font-medium">{employee.id}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Entreprise ID</span>
                <span className="text-sm font-medium">{employee.entreprise_id}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Type</span>
                <Badge variant="secondary">Contact</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
