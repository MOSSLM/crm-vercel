'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { AuditEditorPage } from '@/components/AuditEditorPage';
import { upsertAudit } from '@/utils/auditApi';
import { supabase } from '@/utils/supabase/client';
import { normalizeIssueKeys } from '@/data/auditIssues';
import type { Audit } from '@/types';
import { Loader2 } from 'lucide-react';

/** Ajoute https:// si l'URL n'a pas de schéma (les domaines bruts sinon ne s'ouvrent pas). */
function withScheme(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function AuditPage() {
  const { opportuniteId } = useParams<{ opportuniteId: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [opportunityName, setOpportunityName] = useState<string>('');
  const [siteUrl, setSiteUrl] = useState<string>('');
  const [googleUrl, setGoogleUrl] = useState<string>('');
  const [detectedIssueKeys, setDetectedIssueKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opportuniteId) return;

    async function init() {
      try {
        // Load opportunity, lead magnet delivery, and lead magnet project in parallel
        const [{ data: opp }, { data: plm }, { data: lmp }] = await Promise.all([
          supabase
            .from('opportunites')
            .select('id, name, entreprise_id, entreprises(name, adresse, ville, logo_url, site_web_canonique, canonical_url, google_url, google_maps_url)')
            .eq('id', opportuniteId)
            .maybeSingle(),
          supabase
            .from('production_lead_magnets')
            .select('lien_livraison')
            .eq('opportunite_id', opportuniteId)
            .maybeSingle(),
          supabase
            .from('lead_magnet_projects')
            .select('override_address, override_city, override_location, variables')
            .eq('opportunite_id', opportuniteId)
            .maybeSingle(),
        ]);

        const company = (opp as {
          entreprises?: {
            name?: string; adresse?: string; ville?: string; logo_url?: string;
            site_web_canonique?: string; canonical_url?: string;
            google_url?: string; google_maps_url?: string;
          };
        } | null)?.entreprises;
        const companyName = company?.name || '';
        const logoUrl = company?.logo_url || '';
        const demoUrl = plm?.lien_livraison || '';

        // Liens de vérification : site actuel + fiche Google
        setSiteUrl(withScheme(company?.site_web_canonique || company?.canonical_url));
        setGoogleUrl(withScheme(company?.google_url || company?.google_maps_url));

        // Prefer lead_magnet_projects override fields over entreprises defaults
        const lmpData = lmp as {
          override_address?: string; override_city?: string; override_location?: string;
          variables?: { address?: string; audit_detected_issues?: string[] };
        } | null;
        const lmpVariables = lmpData?.variables || {};
        const companyAdresse = lmpData?.override_address || (lmpVariables as { address?: string }).address || company?.adresse || '';
        const companyVille = lmpData?.override_location || lmpData?.override_city || company?.ville || '';

        // Problèmes pré-détectés par l'edge function d'enrichissement
        const detected = normalizeIssueKeys((lmpVariables as { audit_detected_issues?: string[] }).audit_detected_issues);
        setDetectedIssueKeys(detected);

        setOpportunityName((opp as { name?: string } | null)?.name || companyName || opportuniteId);

        const existing = await upsertAudit({
          opportunite_id: opportuniteId,
          entreprise_nom: companyName,
          entreprise_adresse: companyAdresse,
          entreprise_ville: companyVille,
          entreprise_logo_url: logoUrl,
          demo_site_url: demoUrl,
          detected_issue_keys: detected,
        });

        setAudit(existing);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [opportuniteId]);

  return (
    <AppLayout>
      {loading && (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full text-destructive text-sm">{error}</div>
      )}
      {!loading && !error && audit && (
        <AuditEditorPage
          audit={audit}
          opportunityName={opportunityName}
          siteUrl={siteUrl}
          googleUrl={googleUrl}
          detectedIssueKeys={detectedIssueKeys}
        />
      )}
    </AppLayout>
  );
}
