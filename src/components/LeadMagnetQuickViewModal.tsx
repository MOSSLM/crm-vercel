"use client";

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { type LeadMagnetProjectRecord } from '@/utils/leadMagnetV2Api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Mail, MapPin, Clock, Download } from 'lucide-react';

interface LeadMagnetQuickViewModalProps {
  opportunityId: string | null;
  open: boolean;
  onClose: () => void;
  companyName?: string;
}

function parseServiceTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // not JSON, fall through to CSV split
    }
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function formatStatut(statut: string | null | undefined): string {
  switch (statut) {
    case 'draft': return 'Brouillon';
    case 'in_progress': return 'En cours';
    case 'ready': return 'Prêt';
    case 'framer': return 'Framer';
    case 'archived': return 'Archivé';
    default: return statut ?? 'Inconnu';
  }
}

function statutVariant(statut: string | null | undefined): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (statut) {
    case 'ready': return 'default';
    case 'in_progress': return 'secondary';
    case 'archived': return 'destructive';
    default: return 'outline';
  }
}

export function LeadMagnetQuickViewModal({
  opportunityId,
  open,
  onClose,
  companyName,
}: LeadMagnetQuickViewModalProps) {
  const supabase = createClient();
  const [project, setProject] = useState<LeadMagnetProjectRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !opportunityId) {
      setProject(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('lead_magnet_projects')
      .select('*')
      .eq('opportunite_id', opportunityId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError('Erreur lors du chargement du projet lead magnet.');
        } else {
          setProject(data as LeadMagnetProjectRecord | null);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, opportunityId]);

  const stats = project ? [
    { value: project.stat_years_experience, label: "Ans d'expérience" },
    { value: project.stat_satisfied_clients, label: 'Clients satisfaits' },
    { value: project.stat_installations_completed, label: 'Installations réalisées' },
    { value: project.stat_rge_count, label: 'Certifications RGE' },
  ] : [];

  const serviceTags = project ? parseServiceTags(project.service_tags_snapshot) : [];

  const displayName = project?.override_entreprise_name ?? companyName ?? 'Entreprise inconnue';

  const hasContact = project && (
    project.override_phone ||
    project.override_email ||
    project.override_address ||
    project.override_city ||
    project.opening_hours
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="p-6">
          <DialogHeader className="mb-6">
            <DialogTitle>Aperçu Lead Magnet</DialogTitle>
            <DialogDescription>
              Données du projet pour {displayName}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <div className="text-sm text-destructive py-8 text-center">{error}</div>
          )}

          {!loading && !error && !project && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Pas de projet lead magnet trouvé pour cette opportunité.
            </div>
          )}

          {!loading && !error && project && (
            <div className="space-y-6">
              {/* Header : logo + nom + badges */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  {project.logo_url ? (
                    <img
                      src={project.logo_url}
                      alt="Logo"
                      className="h-16 w-16 rounded-lg object-contain border border-gray-100 bg-white"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                      <span className="text-2xl text-gray-300">?</span>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {project.logo_url && (
                      <a
                        href={project.logo_url}
                        download={`${displayName}-logo.png`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5 bg-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                        PNG
                      </a>
                    )}
                    {project.favicon_url && (
                      <a
                        href={project.favicon_url}
                        download={`${displayName}-favicon.jpg`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5 bg-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                        ICO
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold leading-tight truncate">{displayName}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant={statutVariant(project.statut)}>
                      {formatStatut(project.statut)}
                    </Badge>
                    {project.pret_pour_lm === true && (
                      <Badge className="bg-green-600 hover:bg-green-600/80 text-white">
                        Prêt pour LM
                      </Badge>
                    )}
                    {project.pret_pour_lm === false && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Pas prêt
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats 2×2 */}
              <div className="grid grid-cols-2 gap-3">
                {stats.map(({ value, label }) => {
                  const isEmpty = !value || (typeof value === 'string' && value.trim() === '');
                  return (
                    <div
                      key={label}
                      className={`border rounded-lg p-4 text-center ${isEmpty ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <div
                        className={`text-4xl font-bold leading-none mb-1 ${isEmpty ? 'text-gray-300' : 'text-gray-900'}`}
                      >
                        {isEmpty ? '—' : String(value)}
                      </div>
                      <div className={`text-xs ${isEmpty ? 'text-gray-300' : 'text-muted-foreground'}`}>
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Contact */}
              {hasContact && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Contact
                  </h3>
                  <div className="space-y-2">
                    {project.override_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{project.override_phone}</span>
                      </div>
                    )}
                    {project.override_email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="break-all">{project.override_email}</span>
                      </div>
                    )}
                    {(project.override_address || project.override_city) && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span>
                          {[project.override_address, project.override_city].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    {project.opening_hours && (
                      <div className="flex items-start gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="whitespace-pre-line">{project.opening_hours}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Services */}
              {serviceTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Services
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {serviceTags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Contenu héro */}
              {(project.hero_title || project.hero_subtitle || project.cta_primary_text) && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Contenu héro
                  </h3>
                  <div className="space-y-2">
                    {project.hero_title && (
                      <p className="font-bold text-base leading-snug">{project.hero_title}</p>
                    )}
                    {project.hero_subtitle && (
                      <p className="text-sm text-muted-foreground">{project.hero_subtitle}</p>
                    )}
                    {project.cta_primary_text && (
                      <div className="mt-3">
                        <span className="inline-block bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md select-none">
                          {project.cta_primary_text}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
