"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { toast } from "sonner";
import {
  User,
  Loader2,
  Mail,
  Phone,
  Briefcase,
  Globe,
  Users,
  MessageSquare,
  Plus,
  Save,
} from "lucide-react";
import logger from "../utils/logger";

interface Employee {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  tel?: string;
  role_title?: string;
  linkedin_url?: string;
  is_decision_maker?: boolean;
  preferred_channel?: string;
  notes?: string;
  entreprise_id: number;
  poste?: string;
  linkedin?: string;
}

interface EditEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  companyName: string;
  onEmployeeUpdated: () => void;
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
};

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  open,
  onOpenChange,
  employee,
  companyName,
  onEmployeeUpdated,
}) => {
  const [formData, setFormData] = useState(defaultFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (employee && open) {
      setFormData({
        first_name: employee.first_name || "",
        last_name: employee.last_name || "",
        email: employee.email || "",
        tel: employee.tel || "",
        role_title: employee.role_title || employee.poste || "",
        linkedin_url: employee.linkedin_url || employee.linkedin || "",
        is_decision_maker: employee.is_decision_maker || false,
        preferred_channel: employee.preferred_channel || "email",
        notes: employee.notes || "",
      });
    }
  }, [employee, open]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!employee) {
      toast.error("Erreur: contact non trouvé");
      return;
    }

    if (!formData.first_name.trim() && !formData.last_name.trim()) {
      toast.error("Veuillez saisir au moins un prénom ou un nom");
      return;
    }

    setIsLoading(true);

    try {
      const { contactsApi } = await import("../utils/api");

      await contactsApi.update(employee.id, {
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        tel: formData.tel.trim() || undefined,
        role_title: formData.role_title.trim() || undefined,
        linkedin_url: formData.linkedin_url.trim() || undefined,
        is_decision_maker: formData.is_decision_maker,
        preferred_channel: formData.preferred_channel,
        notes: formData.notes.trim() || undefined,
      });

      toast.success("Contact modifié avec succès");
      onOpenChange(false);
      onEmployeeUpdated();
    } catch (error) {
      logger.error("Error updating employee:", error);
      toast.error("Erreur lors de la modification du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !employee) return;

    setAddingNote(true);
    try {
      const { contactsApi } = await import("../utils/api");
      await contactsApi.addNote(employee.id, newNote.trim());

      const timestamp = new Date().toLocaleString("fr-FR");
      const noteWithTimestamp = `[${timestamp}] ${newNote}`;
      const updatedNotes = formData.notes ? `${formData.notes}\n\n${noteWithTimestamp}` : noteWithTimestamp;

      setFormData((prev) => ({ ...prev, notes: updatedNotes }));
      setNewNote("");
      toast.success("Note ajoutée avec succès");
    } catch (error) {
      logger.error("Error adding note:", error);
      toast.error("Erreur lors de l'ajout de la note");
    } finally {
      setAddingNote(false);
    }
  };

  const getEmployeeDisplayName = () => {
    if (!employee) return "Contact";
    if (employee.first_name && employee.last_name) return `${employee.first_name} ${employee.last_name}`;
    if (employee.last_name) return employee.last_name;
    if (employee.first_name) return employee.first_name;
    if (employee.email) return employee.email;
    if (employee.tel) return employee.tel;
    return "Contact";
  };

  if (!employee) return null;

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" size="md">
            <User size={16} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Détails du contact</Text>
            <Text size="sm" c="dimmed">
              Modifier {getEmployeeDisplayName()} chez {companyName}
            </Text>
          </div>
        </Group>
      }
      centered
      size="xl"
      radius="lg"
      closeOnClickOutside={false}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            <Stack gap="sm">
              <Text fw={500}>Informations du contact</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput
                  label="Prénom"
                  value={formData.first_name}
                  onChange={(event) => handleInputChange("first_name", event.currentTarget.value)}
                  leftSection={<User size={16} />}
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
                value={formData.email}
                onChange={(event) => handleInputChange("email", event.currentTarget.value)}
                leftSection={<Mail size={16} />}
                disabled={isLoading}
              />
              <TextInput
                label="Téléphone"
                type="tel"
                value={formData.tel}
                onChange={(event) => handleInputChange("tel", event.currentTarget.value)}
                leftSection={<Phone size={16} />}
                disabled={isLoading}
              />
              <TextInput
                label="Poste"
                value={formData.role_title}
                onChange={(event) => handleInputChange("role_title", event.currentTarget.value)}
                leftSection={<Briefcase size={16} />}
                disabled={isLoading}
              />
              <TextInput
                label="LinkedIn"
                type="url"
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
                label="Canal préféré"
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

              <Text size="sm" c="dimmed">
                * Au moins un prénom ou un nom est requis
              </Text>
            </Stack>

            <Stack gap="sm">
              <Group gap="xs">
                <MessageSquare size={16} />
                <Text fw={500}>Notes & historique</Text>
              </Group>

              <Card withBorder radius="md" p="sm">
                <Text size="sm" fw={500} mb="xs">
                  Notes actuelles
                </Text>
                <Textarea
                  value={formData.notes}
                  onChange={(event) => handleInputChange("notes", event.currentTarget.value)}
                  minRows={8}
                  disabled={isLoading}
                />
              </Card>

              <Card withBorder radius="md" p="sm">
                <Text size="sm" fw={500}>
                  Ajouter une note
                </Text>
                <Text size="xs" c="dimmed" mb="xs">
                  Une date est ajoutée automatiquement.
                </Text>
                <Textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.currentTarget.value)}
                  placeholder="Nouvelle note..."
                  minRows={3}
                  disabled={addingNote}
                />
                <Button
                  mt="sm"
                  fullWidth
                  size="sm"
                  variant="light"
                  leftSection={addingNote ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  {addingNote ? "Ajout en cours..." : "Ajouter la note"}
                </Button>
              </Card>
            </Stack>
          </SimpleGrid>

          <Divider />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isLoading || (!formData.first_name.trim() && !formData.last_name.trim())}
              leftSection={isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            >
              {isLoading ? "Modification..." : "Modifier"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};
