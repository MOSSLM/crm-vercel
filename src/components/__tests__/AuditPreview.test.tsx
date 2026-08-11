import React from 'react';
import { act, render } from '@testing-library/react';
import { AuditPreview } from '../AuditPreview';
import { mesuresVides } from '@/lib/audit/mesures';
import { getDefaultAuditContent } from '@/lib/audit/default-content';

// jsdom n'implémente pas ResizeObserver.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const CONTENU = getDefaultAuditContent({ entreprise_nom: 'Menuiserie Berthier' });

/** Monte l'aperçu et laisse l'iframe finir de charger avant d'observer. */
async function monter(ui: React.ReactElement) {
  const rendu = render(ui);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu;
}

/**
 * CE QUE CE TEST EMPÊCHE DE REVENIR.
 *
 * L'aperçu injectait la feuille du document dans un `<style>` ordinaire, donc
 * global à la page du CRM. Sa remise à zéro — `* { margin:0; padding:0 }` —, son
 * fond sombre sur `body`, sa couleur de lien et ses règles d'impression
 * s'appliquaient au panneau d'édition qui l'entoure : le formulaire de gauche
 * devenait méconnaissable, et un Ctrl+P dans le CRM tentait d'imprimer un A4.
 *
 * Rien dans le composant ne signalait la fuite — c'est la page AUTOUR qui
 * cassait. D'où ce test : il regarde ce que l'aperçu ajoute au document hôte, et
 * exige que ce soit rien.
 */
describe('AuditPreview — le document ne déborde pas sur le CRM', () => {
  it('n’ajoute aucune feuille de style au document qui l’accueille', async () => {
    const avant = document.querySelectorAll('style').length;
    await monter(<AuditPreview content={CONTENU} mesures={mesuresVides()} />);
    expect(document.querySelectorAll('style').length).toBe(avant);
  });

  it('rend le document dans une iframe, seul cadre qui isole vraiment', async () => {
    const { container } = await monter(<AuditPreview content={CONTENU} mesures={mesuresVides()} />);
    const cadre = container.querySelector('iframe');
    expect(cadre).not.toBeNull();
    // L'enveloppe porte la feuille : c'est elle qui reste confinée à l'iframe.
    expect(cadre?.getAttribute('srcdoc') ?? '').toContain('.sheet{');
  });

  it('monte l’enveloppe une seule fois — sinon les polices se rechargent à chaque frappe', async () => {
    const { container, rerender } = await monter(
      <AuditPreview content={CONTENU} mesures={mesuresVides()} />,
    );
    const srcdoc = container.querySelector('iframe')?.getAttribute('srcdoc');
    await act(async () => {
      rerender(
        <AuditPreview
          content={{ ...CONTENU, page1: { ...CONTENU.page1, client_name: 'Autre' } }}
          mesures={mesuresVides()}
        />,
      );
    });
    // Le corps est réécrit dans l'iframe, l'enveloppe ne bouge pas : un srcDoc
    // qui change relance le chargement du document entier.
    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe(srcdoc);
  });
});
