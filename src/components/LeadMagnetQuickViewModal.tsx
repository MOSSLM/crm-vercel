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
import { Loader2, Phone, Mail, MapPin, Clock, Download, ExternalLink, Check } from 'lucide-react';

type ProjectRecord = LeadMagnetProjectRecord;

type ProductionLm = {
  id: string;
  lien_livraison: string | null;
};

interface LeadMagnetQuickViewModalProps {
  opportunityId: string | null;
  open: boolean;
  onClose: () => void;
  companyName?: string;
  onStatusChange?: (newStatus: string) => void;
}

const STATUT_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'framer', label: 'Framer' },
  { value: 'ready', label: 'Prêt ✓' },
  { value: 'archived', label: 'Archivé' },
];

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

export function LeadMagnetQuickViewModal({
  opportunityId,
  open,
  onClose,
  companyName,
  onStatusChange,
}: LeadMagnetQuickViewModalProps) {
  const supabase = createClient();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [productionLm, setProductionLm] = useState<ProductionLm | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingStatut, setEditingStatut] = useState('');
  const [isSavingStatut, setIsSavingStatut] = useState(false);
  const [editingLienLivraison, setEditingLienLivraison] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);

  useEffect(() => {
    if (!open || !opportunityId) {
      setProject(null);
      setProductionLm(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase.from('lead_magnet_projects').select('*').eq('opportunite_id', opportunityId).maybeSingle(),
      supabase.from('production_lead_magnets').select('id,lien_livraison').eq('opportunite_id', opportunityId).maybeSingle(),
    ]).then(([{ data: lmpData, error: lmpError }, { data: plmData }]) => {
      if (cancelled) return;
      if (lmpError) {
        setError('Erreur lors du chargement du projet lead magnet.');
      } else {
        const p = lmpData as ProjectRecord | null;
        const plm = plmData as ProductionLm | null;
        setProject(p);
        setProductionLm(plm);
        setEditingStatut(p?.statut ?? 'draft');
        setEditingLienLivraison(plm?.lien_livraison ?? '');
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, opportunityId]);

  const handleStatutChange = async (newStatut: string) => {
    if (!project) return;
    setEditingStatut(newStatut);
    setIsSavingStatut(true);
    await supabase.from('lead_magnet_projects').update({ statut: newStatut }).eq('id', project.id);
    setProject({ ...project, statut: newStatut });
    setIsSavingStatut(false);
    onStatusChange?.(newStatut);
  };

  const handleLienLivraisonSave = async () => {
    if (!productionLm) return;
    setIsSavingUrl(true);
    await supabase.from('production_lead_magnets').update({ lien_livraison: editingLienLivraison || null }).eq('id', productionLm.id);
    setProductionLm({ ...productionLm, lien_livraison: editingLienLivraison || null });
    setIsSavingUrl(false);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

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
              {/* Header : logo + nom + statut dropdown */}
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
                <div className="flex-1 min-w-0 space-y-3">
                  <h2 className="text-xl font-bold leading-tight truncate">{displayName}</h2>

                  {/* Statut dropdown */}
                  <div className="flex items-center gap-2">
                    <select
                      value={editingStatut}
                      onChange={(e) => handleStatutChange(e.target.value)}
                      disabled={isSavingStatut}
                      className="text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 cursor-pointer"
                    >
                      {STATUT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {isSavingStatut && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {project.pret_pour_lm === true && (
                      <Badge className="bg-green-600 hover:bg-green-600/80 text-white">Prêt pour LM</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Lien de livraison client */}
              {productionLm && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Lien de livraison client
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={editingLienLivraison}
                      onChange={(e) => { setEditingLienLivraison(e.target.value); setUrlSaved(false); }}
                      onBlur={handleLienLivraisonSave}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                      placeholder="https://mon-site.framer.website"
                      className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {isSavingUrl && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center flex-shrink-0" />}
                    {urlSaved && !isSavingUrl && <Check className="h-4 w-4 text-green-500 self-center flex-shrink-0" />}
                    {editingLienLivraison && !isSavingUrl && (
                      <a
                        href={editingLienLivraison}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-gray-50 flex-shrink-0 self-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </div>
              )}

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
