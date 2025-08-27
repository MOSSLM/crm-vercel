"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Building, Globe, ExternalLink } from 'lucide-react';

interface CompanyInfoFormProps {
  isEditing: boolean;
  currentData: any;
  handleInputChange: (field: string, value: any) => void;
}

/** Form section for editing basic company information. */
export const CompanyInfoForm: React.FC<CompanyInfoFormProps> = ({ isEditing, currentData, handleInputChange }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Building className="h-5 w-5" />
        Informations générales
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name">Nom de l'entreprise</Label>
          {isEditing ? (
            <Input
              id="name"
              value={currentData.name || ''}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Nom de l'entreprise"
            />
          ) : (
            <p className="text-sm p-2 bg-muted rounded">
              {currentData.name || 'Non renseigné'}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="site_web_canonique">Site web canonique</Label>
          {isEditing ? (
            <Input
              id="site_web_canonique"
              value={currentData.site_web_canonique || ''}
              onChange={(e) => handleInputChange('site_web_canonique', e.target.value)}
              placeholder="https://..."
            />
          ) : (
            <div className="flex items-center gap-2">
              {currentData.site_web_canonique ? (
                <a
                  href={currentData.site_web_canonique}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                >
                  <Globe className="h-3 w-3" />
                  {currentData.site_web_canonique}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Non renseigné</p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="canonical_url">URL découverte</Label>
          {isEditing ? (
            <Input
              id="canonical_url"
              value={currentData.canonical_url || ''}
              onChange={(e) => handleInputChange('canonical_url', e.target.value)}
              placeholder="https://..."
            />
          ) : (
            <div className="flex items-center gap-2">
              {currentData.canonical_url ? (
                <a
                  href={currentData.canonical_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                >
                  <Globe className="h-3 w-3" />
                  {currentData.canonical_url}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Non renseigné</p>
              )}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn entreprise</Label>
          {isEditing ? (
            <Input
              id="linkedin_url"
              value={currentData.linkedin_url || ''}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/company/..."
            />
          ) : (
            <div className="flex items-center gap-2">
              {currentData.linkedin_url ? (
                <a
                  href={currentData.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  LinkedIn
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Non renseigné</p>
              )}
            </div>
          )}
        </div>
      </div>
      <div>
        <Label htmlFor="adresse">Adresse</Label>
        {isEditing ? (
          <Textarea
            id="adresse"
            value={currentData.adresse || ''}
            onChange={(e) => handleInputChange('adresse', e.target.value)}
            placeholder="Adresse complète"
            rows={2}
          />
        ) : (
          <p className="text-sm p-2 bg-muted rounded">
            {currentData.adresse || 'Non renseignée'}
          </p>
        )}
      </div>
    </CardContent>
  </Card>
);
