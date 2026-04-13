"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const set = (field: string, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) { toast.error("Erreur: contact non trouvé"); return; }
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

  const displayName = () => {
    if (!employee) return "Contact";
    if (employee.first_name && employee.last_name) return `${employee.first_name} ${employee.last_name}`;
    return employee.last_name || employee.first_name || employee.email || employee.tel || "Contact";
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
              <User className="h-4 w-4" />
            </div>
            <div>
              <div>Détails du contact</div>
              <p className="text-sm font-normal text-muted-foreground">
                Modifier {displayName()} chez {companyName}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2 mt-4">
            {/* Left: contact info */}
            <div className="space-y-4">
              <p className="font-medium text-sm">Informations du contact</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">Prénom</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="first_name"
                      className="pl-9"
                      value={formData.first_name}
                      onChange={(e) => set("first_name", e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Nom</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {[
                { id: "email", label: "Email", type: "email", icon: Mail, field: "email" },
                { id: "tel", label: "Téléphone", type: "tel", icon: Phone, field: "tel" },
                { id: "role_title", label: "Poste", type: "text", icon: Briefcase, field: "role_title" },
                { id: "linkedin_url", label: "LinkedIn", type: "url", icon: Globe, field: "linkedin_url" },
              ].map(({ id, label, type, icon: Icon, field }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={id}
                      type={type}
                      className="pl-9"
                      value={formData[field as keyof typeof formData] as string}
                      onChange={(e) => set(field, e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_decision_maker"
                  checked={formData.is_decision_maker}
                  onCheckedChange={(checked) => set("is_decision_maker", Boolean(checked))}
                  disabled={isLoading}
                />
                <Label htmlFor="is_decision_maker" className="flex items-center gap-1.5 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Décideur
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Canal préféré
                </Label>
                <Select value={formData.preferred_channel} onValueChange={(v) => set("preferred_channel", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Téléphone</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">* Au moins un prénom ou un nom est requis</p>
            </div>

            {/* Right: notes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <p className="font-medium text-sm">Notes & historique</p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">Notes actuelles</p>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={8}
                  disabled={isLoading}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">Ajouter une note</p>
                <p className="text-xs text-muted-foreground">Une date est ajoutée automatiquement.</p>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Nouvelle note..."
                  rows={3}
                  disabled={addingNote}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  {addingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {addingNote ? "Ajout en cours..." : "Ajouter la note"}
                </Button>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isLoading || (!formData.first_name.trim() && !formData.last_name.trim())}
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isLoading ? "Modification..." : "Modifier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
