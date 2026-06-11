import { preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { createTestOpportunitySchema } from '@/app/api/_lib/schemas'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

/**
 * Crée une opportunité de test : entreprise + contact fictifs dont l'email
 * est une adresse de test du user. Les triggers SQL existants
 * (opportunity_created / stage_changed) font entrer l'opportunité dans les
 * automatisations comme n'importe quelle autre — les envois aboutissent
 * dans la boîte du user.
 */
export const POST = withAuth({ body: createTestOpportunitySchema }, async ({ body, cors }) => {
  const sb = getServiceClient()

  const { data: addr } = await sb
    .from('test_email_addresses')
    .select('id,label,email')
    .eq('id', body.test_address_id)
    .maybeSingle()
  if (!addr) return jsonError('Adresse de test introuvable', 404, {}, cors)

  const label = (addr.label as string)?.trim() || (addr.email as string).split('@')[0]
  const name = body.name?.trim() || `[TEST] ${label}`

  const { data: company, error: companyErr } = await sb
    .from('entreprises')
    .insert({ name, email: addr.email })
    .select('id')
    .single()
  if (companyErr || !company) {
    return jsonError(companyErr?.message ?? "Échec création de l'entreprise de test", 502, {}, cors)
  }

  const { data: contact, error: contactErr } = await sb
    .from('contacts')
    .insert({
      entreprise_id: company.id,
      first_name: 'Test',
      last_name: label,
      email: addr.email,
    })
    .select('id')
    .single()
  if (contactErr || !contact) {
    await sb.from('entreprises').delete().eq('id', company.id)
    return jsonError(contactErr?.message ?? 'Échec création du contact de test', 502, {}, cors)
  }

  const { data: opp, error: oppErr } = await sb
    .from('opportunites')
    .insert({
      entreprise_id: company.id,
      contact_id: contact.id,
      pipeline_id: body.pipeline_id,
      stage_id: body.stage_id,
      name,
      montant: 0,
      priorite: 'basse',
      lead_magnet: false,
      is_test: true,
    })
    .select('id')
    .single()
  if (oppErr || !opp) {
    await sb.from('contacts').delete().eq('id', contact.id)
    await sb.from('entreprises').delete().eq('id', company.id)
    return jsonError(oppErr?.message ?? "Échec création de l'opportunité de test", 502, {}, cors)
  }

  return json(
    {
      ok: true,
      opportunite_id: opp.id,
      entreprise_id: company.id,
      contact_id: contact.id,
      email: addr.email,
    },
    { headers: cors },
  )
})
