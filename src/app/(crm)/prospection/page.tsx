import { redirect } from 'next/navigation'

// L'espace Prospection s'ouvre sur les campagnes : c'est l'unité de travail.
export default function Page() {
  redirect('/prospection/campagnes')
}
