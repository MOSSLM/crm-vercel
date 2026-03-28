"use client";

import React, { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { useAppData } from "./AppDataContext";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { contactsApi } from "../utils/api";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  User,
  Building,
  Mail,
  Phone,
  Briefcase,
  Globe,
  Users,
  MessageSquare,
} from "lucide-react";
import logger from "../utils/logger";

interface AddContactFormProps {
  onContactAdded?: () => void;
  className?: string;
}

const defaultFormData = {
  first_name: "",
  last_name: "",
  email: "",
  tel: "",
  role_title: "",
  linkedin_url: "",
  is_decision_maker: false,
  preferred_channel: "email",
  notes: "",
  entreprise_id: "",
};

export const AddContactForm: React.FC<AddContactFormProps> = ({ onContactAdded, className }) => {
  const { companies } = useAppData();
  const [formData, setFormData] = useState(defaultFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.entreprise_id) {
      toast.error("Veuillez sélectionner une entreprise");
      return;
    }

    if (!formData.first_name.trim() && !formData.last_name.trim()) {
      toast.error("Veuillez saisir au moins un prénom ou un nom");
      return;
    }

    setIsLoading(true);

    try {
      await contactsApi.create({
        entreprise_id: Number.parseInt(formData.entreprise_id, 10),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        tel: formData.tel.trim() || undefined,
        role_title: formData.role_title.trim() || undefined,
        linkedin_url: formData.linkedin_url.trim() || undefined,
        is_decision_maker: formData.is_decision_maker,
        preferred_channel: formData.preferred_channel || "email",
        notes: formData.notes.trim() || undefined,
      });

      toast.success("Contact ajouté avec succès");
      setFormData(defaultFormData);
      setIsExpanded(false);
      onContactAdded?.();
    } catch (error) {
      logger.error("Error adding contact:", error);
      toast.error("Erreur lors de l'ajout du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(defaultFormData);
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <Card className={className} withBorder radius="lg" p="md">
        <Button variant="light" fullWidth leftSection={<Plus size={16} />} onClick={() => setIsExpanded(true)}>
          Ajouter un nouveau contact
        </Button>
      </Card>
    );
  }

  return (
    <Card className={className} withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Group gap="xs">
          <ThemeIcon variant="light" size="md">
            <User size={16} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Ajouter un contact</Text>
            <Text size="sm" c="dimmed">
              Créer un nouveau contact dans l&apos;une de vos entreprises
            </Text>
          </div>
        </Group>

        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            <Select
              label="Entreprise *"
              data={companies.map((company) => ({
                value: company.id.toString(),
                label: getCompanyDisplayName(company.name, company.canonical_url),
              }))}
              searchable
              leftSection={<Building size={16} />}
              placeholder="Sélectionner une entreprise"
              value={formData.entreprise_id}
              onChange={(value) => handleInputChange("entreprise_id", value ?? "")}
              disabled={isLoading}
              required
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label="Prénom"
                value={formData.first_name}
                onChange={(event) => handleInputChange("first_name", event.currentTarget.value)}
                disabled={isLoading}
              />
              <TextInput
                label="Nom"
                value={formData.last_name}
                onChange={(event) => handleInputChange("last_name", event.currentTarget.value)}
                disabled={isLoading}
              />
            </SimpleGrid>

            <TextInput
              label="Email"
              type="email"
              placeholder="email@exemple.com"
              value={formData.email}
              onChange={(event) => handleInputChange("email", event.currentTarget.value)}
              leftSection={<Mail size={16} />}
              disabled={isLoading}
            />

            <TextInput
              label="Téléphone"
              type="tel"
              placeholder="+33 1 23 45 67 89"
              value={formData.tel}
              onChange={(event) => handleInputChange("tel", event.currentTarget.value)}
              leftSection={<Phone size={16} />}
              disabled={isLoading}
            />

            <TextInput
              label="Poste"
              placeholder="Directeur, Commercial, etc."
              value={formData.role_title}
              onChange={(event) => handleInputChange("role_title", event.currentTarget.value)}
              leftSection={<Briefcase size={16} />}
              disabled={isLoading}
            />

            <TextInput
              label="LinkedIn"
              type="url"
              placeholder="https://linkedin.com/in/..."
              value={formData.linkedin_url}
              onChange={(event) => handleInputChange("linkedin_url", event.currentTarget.value)}
              leftSection={<Globe size={16} />}
              disabled={isLoading}
            />

            <Checkbox
              label={
                <Group gap={6}>
                  <Users size={14} />
                  <span>Décideur</span>
                </Group>
              }
              checked={formData.is_decision_maker}
              onChange={(event) => handleInputChange("is_decision_maker", event.currentTarget.checked)}
              disabled={isLoading}
            />

            <Select
              label="Canal de communication préféré"
              leftSection={<MessageSquare size={16} />}
              data={[
                { value: "email", label: "Email" },
                { value: "phone", label: "Téléphone" },
                { value: "linkedin", label: "LinkedIn" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "sms", label: "SMS" },
              ]}
              value={formData.preferred_channel}
              onChange={(value) => handleInputChange("preferred_channel", value ?? "email")}
              disabled={isLoading}
            />

            <Textarea
              label="Notes"
              placeholder="Notes sur ce contact..."
              value={formData.notes}
              onChange={(event) => handleInputChange("notes", event.currentTarget.value)}
              minRows={3}
              disabled={isLoading}
            />

            <Text size="sm" c="dimmed">
              * Au moins un prénom ou un nom est requis
            </Text>

            <Group grow>
              <Button variant="default" onClick={handleCancel} disabled={isLoading}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !formData.entreprise_id || (!formData.first_name.trim() && !formData.last_name.trim())}
                leftSection={isLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              >
                {isLoading ? "Ajout..." : "Ajouter"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Card>
  );
};
