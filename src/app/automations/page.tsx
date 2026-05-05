import AppLayout from '@/components/layout/AppLayout'
import AutomationsListPage from '@/components/automations/AutomationsListPage'

export const metadata = { title: 'Automatisations — CRM' }

export default function Page() {
  return (
    <AppLayout>
      <AutomationsListPage />
    </AppLayout>
  )
}
