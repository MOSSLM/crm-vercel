'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import type { AuditContent } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { CSS_COMPACT } from '@/utils/audit/compactCss';
import { corpsCompact } from '@/utils/audit/htmlCompact';

/**
 * L'aperçu de l'éditeur : le document lui-même, pas une imitation.
 *
 * AVANT, six composants React reproduisaient à la main ce que six générateurs de
 * chaîne produisaient pour l'export. Les deux divergeaient — inévitablement,
 * puisque toute modification devait être faite deux fois — et l'opérateur
 * relisait donc autre chose que ce qu'il envoyait. On rend maintenant la MÊME
 * chaîne, ce qui supprime la question.
 *
 * LE CLIC VERS LE CHAMP SURVIT, et il est même plus simple : le rendu pose un
 * `data-field` sur chaque nœud éditable, et un unique écouteur délégué remonte
 * jusqu'au plus proche pour ouvrir le bon formulaire. Plus besoin d'un composant
 * `Zone` autour de chaque bloc.
 *
 * `dangerouslySetInnerHTML` est ici sans danger : la chaîne vient de nos propres
 * fonctions de rendu, qui échappent toute valeur venue du contenu ou de la base.
 */

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
  mesures: MesuresAudit;
}

export function AuditPreview({ content, activeField, onFieldClick, mesures }: Props) {
  const hote = useRef<HTMLDivElement>(null);
  const html = useMemo(() => corpsCompact(content, mesures), [content, mesures]);

  // Le liseré de sélection : posé sur le DOM plutôt que dans la chaîne, pour que
  // changer de champ actif ne relance pas tout le rendu.
  useEffect(() => {
    const racine = hote.current;
    if (!racine) return;
    const marques = racine.querySelectorAll<HTMLElement>('[data-field]');
    marques.forEach((el) => {
      el.style.outline = el.dataset.field === activeField ? '2px solid #3A7BD5' : '';
      el.style.outlineOffset = '2px';
      el.style.cursor = onFieldClick ? 'pointer' : '';
    });
  }, [activeField, html, onFieldClick]);

  const clic = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFieldClick) return;
    const cible = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
    const champ = cible?.dataset.field;
    if (!champ) return;
    // Un aperçu n'est pas un site : suivre un lien du document ferait quitter
    // l'éditeur en plein travail, avec des modifications non sauvegardées.
    e.preventDefault();
    onFieldClick(champ);
  };

  return (
    <>
      <style>{CSS_COMPACT}</style>
      <div ref={hote} onClick={clic} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
