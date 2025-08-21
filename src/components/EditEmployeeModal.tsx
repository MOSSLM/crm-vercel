"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { toast } from "sonner";
import { User, Loader2, Mail, Phone, Briefcase, Globe, Users, MessageSquare, Plus, Save } from 'lucide-react';

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
  // Legacy compatibility fields
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

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  open,
  onOpenChange,
  employee,
  companyName,
  onEmployeeUpdated
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
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Initialize form with employee data when modal opens
  useEffect(() => {
    if (employee && open) {
      setFormData({
        first_name: employee.first_name || '',
        last_name: employee.last_name || '',
        email: employee.email || '',
        tel: employee.tel || '',
        role_title: employee.role_title || employee.poste || '',
        linkedin_url: employee.linkedin_url || employee.linkedin || '',
        is_decision_maker: employee.is_decision_maker || false,
        preferred_channel: employee.preferred_channel || 'email',
        notes: employee.notes || ''
      });
    }
  }, [employee, open]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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
      // Import contactsApi here to avoid circular dependencies
      const { contactsApi } = await import('../utils/api');
      
      const updatedEmployee = {
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        tel: formData.tel.trim() || undefined,
        role_title: formData.role_title.trim() || undefined,
        linkedin_url: formData.linkedin_url.trim() || undefined,
        is_decision_maker: formData.is_decision_maker,
        preferred_channel: formData.preferred_channel,
        notes: formData.notes.trim() || undefined
      };
      
      await contactsApi.update(employee.id, updatedEmployee);
      
      toast.success("Contact modifié avec succès");
      
      onOpenChange(false);
      onEmployeeUpdated();
      
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error("Erreur lors de la modification du contact");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !employee) return;

    setAddingNote(true);
    try {
      const { contactsApi } = await import('../utils/api');
      await contactsApi.addNote(employee.id, newNote.trim());
      
      // Update the notes field locally
      const timestamp = new Date().toLocaleString('fr-FR');
      const noteWithTimestamp = `[${timestamp}] ${newNote}`;
      const updatedNotes = formData.notes 
        ? `${formData.notes}\n\n${noteWithTimestamp}`
        : noteWithTimestamp;
      
      setFormData(prev => ({ ...prev, notes: updatedNotes }));
      setNewNote('');
      toast.success("Note ajoutée avec succès");
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error("Erreur lors de l'ajout de la note");
    } finally {
      setAddingNote(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const getEmployeeDisplayName = () => {
    if (!employee) return 'Contact';
    
    if (employee.first_name && employee.last_name) {
      return `${employee.first_name} ${employee.last_name}`;
    } else if (employee.last_name) {
      return employee.last_name;
    } else if (employee.first_name) {
      return employee.first_name;
    } else if (employee.email) {
      return employee.email;
    } else if (employee.tel) {
      return employee.tel;
    }
    return 'Contact';
  };

  if (!employee) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Détails du contact
          </DialogTitle>
          <DialogDescription>
            Modifier les informations de {getEmployeeDisplayName()} chez {companyName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact Information Form */}
          <div className="space-y-4">
            <h3 className="font-medium">Informations du contact</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-first-name" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Prénom
                  </Label>
                  <Input
                    id="edit-first-name"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    placeholder="Prénom"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-last-name">Nom</Label>
                  <Input
                    id="edit-last-name"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    placeholder="Nom"
                    disabled={isLoading}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="email@exemple.com"
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-tel" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Téléphone
                </Label>
                <Input
                  id="edit-tel"
                  type="tel"
                  value={formData.tel}
                  onChange={(e) => handleInputChange('tel', e.target.value)}
                  placeholder="+33 1 23 45 67 89"
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-role" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Poste
                </Label>
                <Input
                  id="edit-role"
                  value={formData.role_title}
                  onChange={(e) => handleInputChange('role_title', e.target.value)}
                  placeholder="Directeur, Commercial, etc."
                  disabled={isLoading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-linkedin" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  LinkedIn
                </Label>
                <Input
                  id="edit-linkedin"
                  type="url"
                  value={formData.linkedin_url}
                  onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-decision-maker"
                  checked={formData.is_decision_maker}
                  onCheckedChange={(checked) => handleInputChange('is_decision_maker', checked as boolean)}
                  disabled={isLoading}
                />
                <Label 
                  htmlFor="edit-decision-maker" 
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Users className="h-4 w-4" />
                  Décideur
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-channel" className="flex items-center gap-2">
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
              
              <div className="text-sm text-muted-foreground">
                * Au moins un prénom ou un nom est requis
              </div>
            </form>
          </div>

          {/* Notes Section */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notes & Historique
            </h3>
            
            {/* Current Notes Display */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes actuelles</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Notes sur ce contact..."
                  disabled={isLoading}
                  rows={8}
                  className="resize-none"
                />
              </CardContent>
            </Card>

            {/* Add New Note */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ajouter une note</CardTitle>
                <CardDescription>
                  Ajouter une note avec horodatage automatique
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Nouvelle note..."
                  rows={3}
                  disabled={addingNote}
                />
                <Button 
                  onClick={handleAddNote} 
                  disabled={!newNote.trim() || addingNote}
                  className="w-full"
                  size="sm"
                >
                  {addingNote ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Ajout en cours...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter la note
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />
        
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
            onClick={handleSubmit}
            disabled={isLoading || (!formData.first_name.trim() && !formData.last_name.trim())}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Modification en cours...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Modifier
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};