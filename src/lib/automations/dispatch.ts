// dispatch.ts — résout un événement CRM vers les automatisations concernées.
import { getServiceClient } from '@/app/api/_lib/service-client'
import { runWorkflowAutomation, enrollInSequence, type RunContext } from './engine'
import type { Automation } from '@/components/automations/types'

export async function dispatchEvent(payload: Record<string, unknown>): Promise<void> {
  const sb = getServiceClient()
  const event = String(payload.event ?? '')
  const ctx: RunContext = {
    event,
    opportunite_id: (payload.opportunite_id as string) ?? null,
    contact_id: (payload.contact_id as string) ?? null,
    entreprise_id: (payload.entreprise_id as number) ?? null,
    pipeline_id: (payload.pipeline_id as string) ?? null,
    stage_id: payload.stage_id != null ? Number(payload.stage_id) : null,
    from_stage_id: payload.from_stage_id != null ? Number(payload.from_stage_id) : null,
  }

  const triggerType =
    event === 'stage_changed'
      ? 'trg.stage_changed'
      : event === 'opportunity_created'
        ? 'trg.opportunity_created'
        : event === 'contact_created'
          ? 'trg.contact_created'
          : event === 'form_submitted'
            ? 'trg.form_submitted'
            : null

  // ── Workflows ────────────────────────────────────────────────────────────
  if (triggerType) {
    let q = sb
      .from('automations')
      .select('*')
      .eq('kind', 'workflow')
      .eq('status', 'on')
      .eq('trigger_type', triggerType)
    if (event === 'stage_changed' && ctx.pipeline_id != null && ctx.stage_id != null) {
      q = q.eq('trigger_pipeline_id', ctx.pipeline_id).eq('trigger_stage_id', ctx.stage_id)
    } else if (event === 'opportunity_created' && ctx.pipeline_id != null) {
      q = q.eq('trigger_pipeline_id', ctx.pipeline_id)
    }
    const { data: wfs } = await q
    for (const wf of (wfs ?? []) as Automation[]) {
      // garde anti-boucle : pas deux exécutions de ce workflow pour la
      // même opportunité dans la dernière minute
      if (ctx.opportunite_id) {
        const since = new Date(Date.now() - 60000).toISOString()
        const { data: recent } = await sb
          .from('automation_runs')
          .select('id')
          .eq('automation_id', wf.id)
          .gte('started_at', since)
          .filter('context->>opportunite_id', 'eq', ctx.opportunite_id)
          .limit(1)
        if (recent && recent.length > 0) continue
      }
      await runWorkflowAutomation(wf, ctx)
    }
  }

  // ── Séquences (entrée à un stage donné) ──────────────────────────────────
  if (event === 'stage_changed' && ctx.pipeline_id != null && ctx.stage_id != null) {
    const { data: seqs } = await sb
      .from('automations')
      .select('*')
      .eq('kind', 'sequence')
      .eq('status', 'on')
      .eq('trigger_pipeline_id', ctx.pipeline_id)
      .eq('trigger_stage_id', ctx.stage_id)
    for (const seq of (seqs ?? []) as Automation[]) {
      await enrollInSequence(seq, ctx)
    }
  }
}
