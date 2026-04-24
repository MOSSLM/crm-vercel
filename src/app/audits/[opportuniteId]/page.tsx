'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { AuditEditorPage } from '@/components/AuditEditorPage';
import { fetchAuditByOpportunite, upsertAudit } from '@/utils/auditApi';
import { supabase } from '@/utils/supabase/client';
import type { Audit } from '@/types';
import { Loader2 } from 'lucide-react';

export default function AuditPage() {
  const { opportuniteId } = useParams<{ opportuniteId: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [opportunityName, setOpportunityName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opportuniteId) return;

    async function init() {
      try {
        // Load opportunity + company info
        const { data: opp } = await supabase
          .from('opportunites')
          .select('id, name, entreprise_id, entreprises(name, ville, logo_url)')
          .eq('id', opportuniteId)
          .maybeSingle();

        // Load production lead magnet for demo URL
        const { data: plm } = await supabase
          .from('production_lead_magnets')
          .select('lien_livraison')
          .eq('opportunite_id', opportuniteId)
          .maybeSingle();

        const company = (opp as { entreprises?: { name?: string; ville?: string; logo_url?: string } } | null)?.entreprises;
        const companyName = company?.name || '';
        const companyVille = company?.ville || '';
        const logoUrl = company?.logo_url || '';
        const demoUrl = plm?.lien_livraison || '';

        setOpportunityName((opp as { name?: string } | null)?.name || companyName || opportuniteId);

        const existing = await upsertAudit({
          opportunite_id: opportuniteId,
          entreprise_nom: companyName,
          entreprise_ville: companyVille,
          entreprise_logo_url: logoUrl,
          demo_site_url: demoUrl,
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
        <AuditEditorPage audit={audit} opportunityName={opportunityName} />
      )}
    </AppLayout>
  );
}
