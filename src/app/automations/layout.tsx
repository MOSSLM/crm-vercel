import '@/components/automations/automations-skin.css'
import { AutomationsShell } from '@/components/automations/AutomationsShell'
import { getShellCounts } from '@/components/automations/shell-counts'

export const metadata = { title: 'Automatisations — Sama CRM' }

export default async function AutomationsLayout({ children }: { children: React.ReactNode }) {
  const counts = await getShellCounts()
  return <AutomationsShell counts={counts}>{children}</AutomationsShell>
}
