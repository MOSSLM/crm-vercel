"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from "sonner";
import { Plus, Loader2, Mail, Phone, Briefcase, Globe, User, Users, MessageSquare } from 'lucide-react';

import logger from '../utils/logger';
interface AddEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
  companyName: string;
  onEmployeeAdded: () => void;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  open,
  onOpenChange,
  companyId,
  companyName,
  onEmployeeAdded
}) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    tel: '',
    role_title: '',
    linkedin_url: '',
    is_decision_maker: false,
    preferred_channel: 'email',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name.trim() && !formData.last_name.trim()) {
      toast.error("Veuillez saisir au moins un prénom ou un nom");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Import contactsApi here to avoid circular dependencies
      const { contactsApi } = await import('../utils/api');
      
      const newEmployee = {
        entreprise_id: companyId,
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
      
      await contactsApi.create(newEmployee);
      
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
        notes: ''
      });
      
      onOpenChange(false);
      onEmployeeAdded();
      
    } catch (error) {
      logger.error('Error adding employee:', error);
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
      notes: ''
    });
    onOpenChange(false);
  };

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        tel: '',
        role_title: '',
        linkedin_url: '',
        is_decision_maker: false,
        preferred_channel: 'email',
        notes: ''
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Ajouter un contact
          </DialogTitle>
          <DialogDescription>
            Ajouter un nouveau contact à {companyName}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="add-first-name" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Prénom
              </Label>
              <Input
                id="add-first-name"
                value={formData.first_name}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                placeholder="Prénom"
                disabled={isLoading}
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-last-name">Nom</Label>
              <Input
                id="add-last-name"
                value={formData.last_name}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                placeholder="Nom"
                disabled={isLoading}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="add-email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="add-email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="email@exemple.com"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="add-tel" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Téléphone
            </Label>
            <Input
              id="add-tel"
              type="tel"
              value={formData.tel}
              onChange={(e) => handleInputChange('tel', e.target.value)}
              placeholder="+33 1 23 45 67 89"
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="add-role" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Poste
            </Label>
            <Input
              id="add-role"
              value={formData.role_title}
              onChange={(e) => handleInputChange('role_title', e.target.value)}
              placeholder="Directeur, Commercial, etc."
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="add-linkedin" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              LinkedIn
            </Label>
            <Input
              id="add-linkedin"
              type="url"
              value={formData.linkedin_url}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="add-decision-maker"
              checked={formData.is_decision_maker}
              onCheckedChange={(checked) => handleInputChange('is_decision_maker', checked as boolean)}
              disabled={isLoading}
            />
            <Label 
              htmlFor="add-decision-maker" 
              className="flex items-center gap-2 cursor-pointer"
            >
              <Users className="h-4 w-4" />
              Décideur
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-channel" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Canal préféré
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
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
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
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCancel}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || (!formData.first_name.trim() && !formData.last_name.trim())}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ajout en cours...
                </>
              ) : (
                'Ajouter'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};