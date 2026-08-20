import { Veilles } from '@/components/prospection/Veilles'

export const metadata = { title: 'Signaux — Sama CRM' }

// `AppLayout` est monté par `prospection/layout.tsx` : le remettre ici
// emboîterait deux `StudioShell`, donc deux rails de navigation.
export default function Page() {
  return <Veilles />
}
