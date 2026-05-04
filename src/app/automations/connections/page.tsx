import { Metadata } from 'next'
import AutomationsConnectionsPage from '@/components/automations/AutomationsConnectionsPage'

export const metadata: Metadata = {
  title: 'Connexions | Automatisations',
}

export default function Page() {
  return <AutomationsConnectionsPage />
}
