import type { AuditContent } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { documentAudit } from './audit/compactCss';
import { corpsCompact } from './audit/htmlCompact';

/**
 * Le document d'audit, en un seul HTML autonome.
 *
 * Il n'y a plus qu'un rendu. L'ancien deck de six pages — six composants React
 * pour l'aperçu, six générateurs de chaîne pour l'export — est supprimé : le
 * même contenu écrit deux fois finit toujours par diverger, et il divergeait.
 * L'aperçu de l'éditeur affiche désormais cette chaîne-ci, dans la même
 * enveloppe (`documentAudit`), donc ce que l'opérateur relit est exactement ce
 * qui part chez le prospect.
 *
 * `debordement` neutralise la troncature silencieuse des demi-pages. À n'activer
 * qu'en recette : en production, une page qui déborde est pire qu'un bloc coupé.
 *
 * `impression` fait s'imprimer la fenêtre dès que les polices sont arrivées.
 * C'est le seul moyen fiable : un délai fixe imprime parfois avant elles, et le
 * PDF part alors dans une police de secours.
 */
export function generateAuditHtml(
  content: AuditContent,
  mesures: MesuresAudit,
  opts: { debordement?: boolean; impression?: boolean } = {},
): string {
  return documentAudit(
    `Audit — ${content.page1.client_name || 'Client'}`,
    corpsCompact(content, mesures),
    { debordement: opts.debordement, impressionAuto: opts.impression },
  );
}
