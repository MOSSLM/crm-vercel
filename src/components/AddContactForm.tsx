"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAppData } from './AppDataContext';
import { getCompanyDisplayName } from '../utils/displayHelpers';
import { contactsApi } from '../utils/api';
import { toast } from "sonner";
import { Plus, Loader2, User, Building, Mail, Phone, Briefcase, Globe, Users, MessageSquare } from 'lucide-react';

interface AddContactFormProps {
  onContactAdded?: () => void;
  className?: string;
}

export const AddContactForm: React.FC<AddContactFormProps> = ({ onContactAdded, className }) => {
  const { companies } = useAppData();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    tel: '',
    role_title: '',
    linkedin_url: '',
    is_decision_maker: false,
    preferred_channel: 'email',
    notes: '',
    entreprise_id: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
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
      const newContact = {
        entreprise_id: parseInt(formData.entreprise_id),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        tel: formData.tel.trim() || undefined,
        role_title: formData.role_title.trim() || undefined,
        linkedin_url: formData.linkedin_url.trim() || undefined,
        is_decision_maker: formData.is_decision_maker,
        preferred_channel: formData.preferred_channel || 'email',
        notes: formData.notes.trim() || undefined
      };
      
      await contactsApi.create(newContact);
      
      toast.success("Contact ajouté avec succès");
      
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        tel: '',
        role_title: '',
        linkedin_url: '',
        is_decision_maker: false,
        preferred_channel: 'email',
        notes: '',
        entreprise_id: ''
      });
      
      setIsExpanded(false);
      onContactAdded?.();
      
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error("Erreur lors de l'ajout du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      tel: '',
      role_title: '',
      linkedin_url: '',
      is_decision_maker: false,
      preferred_channel: 'email',
      notes: '',
      entreprise_id: ''
    });
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <Button 
            onClick={() => setIsExpanded(true)}
            className="w-full"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un nouveau contact
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Ajouter un contact
        </CardTitle>
        <CardDescription>
          Créer un nouveau contact dans l'une de vos entreprises
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-entreprise" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Entreprise *
            </Label>
            <Select 
              value={formData.entreprise_id} 
              onValueChange={(value) => handleInputChange('entreprise_id', value)}
              disabled={isLoading}
            >
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact-first-name">Prénom</Label>
              <Input
                id="contact-first-name"
                value={formData.first_name}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                placeholder="Prénom"
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contact-last-name">Nom</Label>
              <Input
                id="contact-last-name"
                value={formData.last_name}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                placeholder="Nom"
                disabled={isLoading}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact-email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="contact-email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="email@exemple.com"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact-tel" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Téléphone
            </Label>
            <Input
              id="contact-tel"
              type="tel"
              value={formData.tel}
              onChange={(e) => handleInputChange('tel', e.target.value)}
              placeholder="+33 1 23 45 67 89"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact-role" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Poste
            </Label>
            <Input
              id="contact-role"
              value={formData.role_title}
              onChange={(e) => handleInputChange('role_title', e.target.value)}
              placeholder="Directeur, Commercial, etc."
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact-linkedin" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              LinkedIn
            </Label>
            <Input
              id="contact-linkedin"
              type="url"
              value={formData.linkedin_url}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="contact-decision-maker"
              checked={formData.is_decision_maker}
              onCheckedChange={(checked) => handleInputChange('is_decision_maker', checked as boolean)}
              disabled={isLoading}
            />
            <Label 
              htmlFor="contact-decision-maker" 
              className="flex items-center gap-2 cursor-pointer"
            >
              <Users className="h-4 w-4" />
              Décideur
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-channel" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Canal de communication préféré
            </Label>
            <Select 
              value={formData.preferred_channel} 
              onValueChange={(value) => handleInputChange('preferred_channel', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un canal" />
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
          
          <div className="space-y-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Notes sur ce contact..."
              disabled={isLoading}
              rows={3}
            />
          </div>
          
          <div className="text-sm text-muted-foreground">
            * Au moins un prénom ou un nom est requis
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !formData.entreprise_id || (!formData.first_name.trim() && !formData.last_name.trim())}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ajout...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};