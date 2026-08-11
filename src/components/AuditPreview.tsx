'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AuditContent } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { documentAudit } from '@/utils/audit/compactCss';
import { corpsCompact } from '@/utils/audit/htmlCompact';

/**
 * L'aperçu de l'éditeur : le document lui-même, dans son propre document.
 *
 * AVANT, six composants React reproduisaient à la main ce que six générateurs de
 * chaîne produisaient pour l'export. Les deux divergeaient — inévitablement,
 * puisque toute modification devait être faite deux fois — et l'opérateur
 * relisait donc autre chose que ce qu'il envoyait. On rend maintenant la MÊME
 * chaîne, ce qui supprime la question.
 *
 * L'IFRAME N'EST PAS UN DÉTAIL D'IMPLÉMENTATION, c'est la correction d'un bug
 * qui abîmait tout l'écran. La feuille du document était injectée dans un
 * `<style>` ordinaire, donc GLOBAL à la page du CRM : sa remise à zéro
 * (`* { margin:0; padding:0 }`), son fond sombre sur `body`, sa couleur de lien
 * et ses règles `@page` / `@media print` s'appliquaient au panneau d'édition
 * qui l'entoure. D'où un formulaire de gauche méconnaissable, et un Ctrl+P du
 * CRM qui tentait d'imprimer un A4. Une iframe isole la feuille pour de bon, et
 * l'aperçu devient au passage exactement ce qui sort à l'impression.
 *
 * LE DOCUMENT N'EST PAS RECHARGÉ À CHAQUE FRAPPE. L'enveloppe est montée une
 * fois ; les modifications ne réécrivent que le corps. Recharger l'iframe
 * rejouerait le téléchargement des polices et ferait clignoter la page à chaque
 * caractère saisi.
 *
 * `innerHTML` est ici sans danger : la chaîne vient de nos propres fonctions de
 * rendu, qui échappent toute valeur venue du contenu ou de la base.
 */

/** La largeur d'une feuille A4 à 96 dpi. Le dessin entier est calé dessus. */
const LARGEUR_A4 = 794;

/** L'enveloppe vide, montée une seule fois. Sa stabilité évite un rechargement. */
const ENVELOPPE = documentAudit('Aperçu de l’audit', '', { apercu: true });

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
  mesures: MesuresAudit;
  /** La demi-page à amener à l'écran (1 à 6). Suit les onglets de l'éditeur. */
  demiPage?: number;
}

export function AuditPreview({ content, activeField, onFieldClick, mesures, demiPage }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLIFrameElement>(null);
  const [pret, setPret] = useState(false);
  const [hauteur, setHauteur] = useState(3481);
  const [echelle, setEchelle] = useState(0.55);

  const html = useMemo(() => corpsCompact(content, mesures), [content, mesures]);

  /** Le document de l'iframe, ou `null` tant qu'il n'est pas monté. */
  const doc = useCallback(() => (pret ? (cadre.current?.contentDocument ?? null) : null), [pret]);

  // L'échelle suit la largeur disponible : le document reste un A4, c'est la
  // loupe qui change. 24 px de marge de chaque côté pour ne pas coller au bord.
  useEffect(() => {
    const el = conteneur.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setEchelle(Math.max(0.25, (e.contentRect.width - 48) / LARGEUR_A4));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Le corps, réécrit à chaque modification du contenu. La hauteur est MESURÉE
  // et non calculée : trois feuilles plus leurs marges, c'est au document de le
  // dire. Un calcul en dur ici redeviendrait faux à la première marge changée.
  useLayoutEffect(() => {
    const d = doc();
    const hote = d?.getElementById('doc');
    if (!d || !hote) return;
    hote.innerHTML = html;
    setHauteur(Math.max(1, d.documentElement.scrollHeight));
  }, [html, doc]);

  // Un seul écouteur délégué : chaque nœud éditable porte un `data-field`, et on
  // remonte au plus proche. Il vit sur le document de l'iframe, pas sur le nôtre.
  const clicRef = useRef(onFieldClick);
  clicRef.current = onFieldClick;

  useEffect(() => {
    const d = doc();
    if (!d) return;
    const surClic = (e: MouseEvent) => {
      const cible = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-field]');
      // Un aperçu n'est pas un site : suivre un lien du document ferait quitter
      // l'éditeur en plein travail, avec des modifications non sauvegardées.
      e.preventDefault();
      const champ = cible?.dataset.field;
      if (champ) clicRef.current?.(champ);
    };
    d.addEventListener('click', surClic);
    return () => d.removeEventListener('click', surClic);
  }, [doc]);

  // Le liseré de sélection, posé sur le DOM plutôt que dans la chaîne : changer
  // de champ actif ne doit pas relancer tout le rendu.
  useEffect(() => {
    const d = doc();
    if (!d) return;
    d.querySelectorAll<HTMLElement>('[data-field].champ-actif').forEach((el) =>
      el.classList.remove('champ-actif'),
    );
    if (!activeField) return;
    d.querySelector<HTMLElement>(`[data-field="${CSS.escape(activeField)}"]`)?.classList.add(
      'champ-actif',
    );
  }, [activeField, html, doc]);

  // Le défilement vers la demi-page choisie dans les onglets. C'est le conteneur
  // extérieur qui défile : l'iframe fait la hauteur entière du document.
  useEffect(() => {
    const d = doc();
    const boite = conteneur.current;
    if (!d || !boite || !demiPage) return;
    const cible = d.getElementById(`audit-h${demiPage}`);
    if (!cible) return;
    const haut = cible.getBoundingClientRect().top - d.body.getBoundingClientRect().top;
    boite.scrollTo({ top: Math.max(0, haut * echelle - 12), behavior: 'smooth' });
  }, [demiPage, echelle, hauteur, doc]);

  return (
    <div ref={conteneur} className="h-full overflow-y-auto overflow-x-hidden bg-[#1a1a1e]">
      {/* La boîte extérieure occupe la place APRÈS mise à l'échelle : une
          transformation ne réserve pas d'espace, et sans elle le panneau ne
          défilerait que sur la hauteur non réduite. */}
      <div style={{ width: LARGEUR_A4 * echelle, height: hauteur * echelle, margin: '0 auto' }}>
        <iframe
          ref={cadre}
          title="Aperçu du document d’audit"
          srcDoc={ENVELOPPE}
          onLoad={() => setPret(true)}
          scrolling="no"
          style={{
            width: LARGEUR_A4,
            height: hauteur,
            border: 0,
            display: 'block',
            transformOrigin: 'top left',
            transform: `scale(${echelle})`,
          }}
        />
      </div>
    </div>
  );
}
