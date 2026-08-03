import '@/components/automations/automations-skin.css'
import { AutomationsShell } from '@/components/automations/AutomationsShell'

export const metadata = { title: 'Automatisations — Sama CRM' }

export default function AutomationsLayout({ children }: { children: React.ReactNode }) {
  return <AutomationsShell>{children}</AutomationsShell>
}
