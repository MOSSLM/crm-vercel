"use client";

import React, { useState } from "react";
import { useAppData } from "./AppDataContext";
import { getCompanyDisplayName } from "../utils/displayHelpers";
import { contactsApi } from "../utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronDown,
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

  const set = (field: string, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.entreprise_id) { toast.error("Veuillez sélectionner une entreprise"); return; }
    if (!formData.first_name.trim() && !formData.last_name.trim()) {
      toast.error("Veuillez saisir au moins un prénom ou un nom");
      return;
    }
    setIsLoading(true);
    try {
      await contactsApi.create({
        entreprise_id: parseInt(formData.entreprise_id, 10),
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

  if (!isExpanded) {
    return (
      <div className={`rounded-xl border bg-card p-4 ${className ?? ""}`}>
        <Button variant="outline" className="w-full" onClick={() => setIsExpanded(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un nouveau contact
          <ChevronDown className="h-4 w-4 ml-auto" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-card p-5 space-y-5 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
          <User className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold">Ajouter un contact</p>
          <p className="text-sm text-muted-foreground">
            Créer un nouveau contact dans l&apos;une de vos entreprises
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Company select */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Building className="h-4 w-4" />
            Entreprise *
          </Label>
          <Select value={formData.entreprise_id} onValueChange={(v) => set("entreprise_id", v)} disabled={isLoading} required>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une entreprise" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id.toString()}>
                  {getCompanyDisplayName(company.name, company.canonical_url)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="add_first_name">Prénom</Label>
            <Input
              id="add_first_name"
              value={formData.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add_last_name">Nom</Label>
            <Input
              id="add_last_name"
              value={formData.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Other fields */}
        {[
          { id: "add_email", label: "Email", type: "email", icon: Mail, placeholder: "email@exemple.com", field: "email" },
          { id: "add_tel", label: "Téléphone", type: "tel", icon: Phone, placeholder: "+33 1 23 45 67 89", field: "tel" },
          { id: "add_role", label: "Poste", type: "text", icon: Briefcase, placeholder: "Directeur, Commercial…", field: "role_title" },
          { id: "add_linkedin", label: "LinkedIn", type: "url", icon: Globe, placeholder: "https://linkedin.com/in/…", field: "linkedin_url" },
        ].map(({ id, label, type, icon: Icon, placeholder, field }) => (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
              <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={id}
                type={type}
                placeholder={placeholder}
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
            id="add_decision_maker"
            checked={formData.is_decision_maker}
            onCheckedChange={(checked) => set("is_decision_maker", Boolean(checked))}
            disabled={isLoading}
          />
          <Label htmlFor="add_decision_maker" className="flex items-center gap-1.5 cursor-pointer">
            <Users className="h-4 w-4" />
            Décideur
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Canal de communication préféré
          </Label>
          <Select value={formData.preferred_channel} onValueChange={(v) => set("preferred_channel", v)} disabled={isLoading}>
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

        <div className="space-y-1.5">
          <Label htmlFor="add_notes">Notes</Label>
          <Textarea
            id="add_notes"
            placeholder="Notes sur ce contact..."
            value={formData.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            disabled={isLoading}
          />
        </div>

        <p className="text-xs text-muted-foreground">* Au moins un prénom ou un nom est requis</p>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => { setFormData(defaultFormData); setIsExpanded(false); }}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isLoading || !formData.entreprise_id || (!formData.first_name.trim() && !formData.last_name.trim())}
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {isLoading ? "Ajout..." : "Ajouter"}
          </Button>
        </div>
      </form>
    </div>
  );
};
