import type { AuditContent } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { CSS_COMPACT, CSS_DEBUG_DEBORDEMENT, LIEN_POLICES } from './audit/compactCss';
import { corpsCompact } from './audit/htmlCompact';

/**
 * Le document d'audit, en un seul HTML autonome.
 *
 * Il n'y a plus qu'un rendu. L'ancien deck de six pages — six composants React
 * pour l'aperçu, six générateurs de chaîne pour l'export — est supprimé : le
 * même contenu écrit deux fois finit toujours par diverger, et il divergeait.
 * L'aperçu de l'éditeur affiche désormais cette chaîne-ci, donc ce que
 * l'opérateur relit est exactement ce qui part.
 *
 * `debordement` neutralise la troncature silencieuse des demi-pages. À n'activer
 * qu'en recette : en production, une page qui déborde est pire qu'un bloc coupé.
 */
export function generateAuditHtml(
  content: AuditContent,
  mesures: MesuresAudit,
  opts: { debordement?: boolean } = {},
): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=794">
<title>Audit — ${content.page1.client_name || 'Client'}</title>
${LIEN_POLICES}
<style>${CSS_COMPACT}${opts.debordement ? CSS_DEBUG_DEBORDEMENT : ''}</style>
</head>
<body>
<div id="doc">${corpsCompact(content, mesures)}</div>
</body>
</html>`;
}
