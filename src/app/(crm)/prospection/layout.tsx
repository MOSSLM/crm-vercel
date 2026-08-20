import AppLayout from '@/components/layout/AppLayout'

export const metadata = { title: 'Prospection — Sama CRM' }

/**
 * LE RAIL MANQUAIT, ET ÇA NE SE VOYAIT QU'EN REGARDANT.
 *
 * Les six écrans de Prospection se montaient nus : le menu de gauche pointait
 * bien vers eux (`spaces.ts`), mais une fois arrivé on ne pouvait plus en
 * repartir — et on ne pouvait pas y arriver en cliquant non plus. Le groupe
 * `(crm)` ne porte que la coquille HTML (polices, providers) ; le shell
 * d'administration se monte PAR SECTION, comme `automations/layout.tsx` monte
 * le sien.
 *
 * `AppLayout` fait deux choses, et les deux sont voulues ici :
 *   · il rend `StudioShell`, donc le rail et le sous-menu de l'espace, lu dans
 *     `spaces.ts` — c'est ce qui rend « Prospection » navigable ;
 *   · il REFUSE tout ce qui n'est pas admin, et renvoie un freelance vers son
 *     portail. Toutes les routes d'API de cet espace sont déjà en
 *     `role: 'admin'` : sans cette garde, un agent verrait des écrans qui ne
 *     lui rendraient que des 401.
 */
export default function ProspectionLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
