import { CSS_COMPACT, CSS_APERCU, documentAudit } from '../compactCss';
import { corpsCompact } from '../htmlCompact';
import { mesuresVides } from '@/lib/audit/mesures';
import { getDefaultAuditContent } from '@/lib/audit/default-content';

/**
 * CE QUE CES TESTS SURVEILLENT : une feuille de style ne se plaint jamais.
 *
 * La règle `@page` du document est restée neutralisée pendant toute la vie du
 * document compact, parce que la ligne de commentaire qui la précédait avait
 * perdu son ouverture — le parseur CSS, qui avale alors tout jusqu'à la
 * prochaine accolade, emportait `@page` avec elle. Aucune erreur, aucun
 * avertissement : le seul symptôme était un PDF en US Letter avec de grosses
 * marges blanches et une page sur deux presque vide, constaté chez le prospect.
 *
 * Un test unitaire ne peut pas juger d'une mise en page. Il peut en revanche
 * vérifier que la feuille est SYNTAXIQUEMENT SAINE et qu'elle dit toujours le
 * format — ce qui aurait suffi à attraper celui-là.
 */

describe('CSS_COMPACT — la feuille se parse sans rien avaler', () => {
  /** Retire les commentaires bien formés, et rend ce qui reste. */
  const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('n’a aucun commentaire qui se referme sans avoir été ouvert', () => {
    // C'est EXACTEMENT le défaut d'origine : un `*/` orphelin, et la règle qui
    // suit disparaît du document sans que rien ne le signale.
    expect(sansCommentaires(CSS_COMPACT)).not.toContain('*/');
  });

  it('n’a aucun commentaire ouvert et jamais refermé', () => {
    expect(sansCommentaires(CSS_COMPACT)).not.toContain('/*');
  });

  it('a autant d’accolades ouvrantes que de fermantes', () => {
    const nu = sansCommentaires(CSS_COMPACT);
    expect((nu.match(/{/g) ?? []).length).toBe((nu.match(/}/g) ?? []).length);
  });

  it('n’émet aucune interpolation non évaluée', () => {
    // Un `${…}` littéral dans la feuille ou dans le corps veut dire qu'une
    // chaîne à guillemets simples a été prise pour un gabarit : la déclaration
    // est alors invalide, donc silencieusement ignorée.
    const contenu = getDefaultAuditContent({ entreprise_nom: 'Test' });
    expect(CSS_COMPACT).not.toContain('${');
    expect(corpsCompact(contenu, mesuresVides())).not.toContain('${');
  });
});

describe('CSS_COMPACT — le format du document', () => {
  /** La règle `@page` telle que le navigateur la verra, une fois les commentaires retirés. */
  const regleAtPage = () =>
    /@page\s*{([^}]*)}/.exec(CSS_COMPACT.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';

  it('déclare un A4 sans marge — sinon le navigateur en met', () => {
    const regle = regleAtPage();
    expect(regle).toContain('A4');
    expect(regle).toMatch(/margin\s*:\s*0/);
  });

  it('n’est précédée d’aucun texte parasite qui la ferait avaler', () => {
    // Le parseur consomme le préambule d'une règle jusqu'à la prochaine `{`.
    // Si ce préambule contient autre chose qu'un sélecteur, la règle est perdue.
    const nu = CSS_COMPACT.replace(/\/\*[\s\S]*?\*\//g, '');
    const avant = nu.slice(0, nu.indexOf('@page'));
    expect(avant.trimEnd().endsWith('}')).toBe(true);
  });

  it('garde chaque feuille sous la hauteur de l’A4', () => {
    // Une feuille de 297 mm exactement dans une page de 297 mm déborde dès que
    // le navigateur arrondit, et le débordement devient une page blanche.
    const hauteur = Number(/\.sheet{[^}]*height:([\d.]+)mm/.exec(CSS_COMPACT)?.[1]);
    expect(hauteur).toBeGreaterThan(290);
    expect(hauteur).toBeLessThan(297);
  });

  it('conserve les aplats à l’impression', () => {
    expect(CSS_COMPACT).toContain('print-color-adjust:exact');
  });
});

describe('documentAudit — une seule enveloppe pour l’aperçu et l’export', () => {
  const corps = '<div class="sheet"></div>';

  it('emporte la feuille du document et les polices', () => {
    const html = documentAudit('Audit — Test', corps);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain(corps);
  });

  it('n’ajoute les styles d’édition que pour l’aperçu', () => {
    expect(documentAudit('t', corps, { apercu: true })).toContain('champ-actif');
    expect(documentAudit('t', corps)).not.toContain('champ-actif');
  });

  it('n’imprime tout seul que si on le demande, et jamais sur un délai fixe', () => {
    const auto = documentAudit('t', corps, { impressionAuto: true });
    expect(auto).toContain('window.print()');
    // Le déclencheur attend les polices : un PDF en police de secours ne se voit
    // qu'une fois chez le prospect.
    expect(auto).toContain('document.fonts');
    expect(documentAudit('t', corps)).not.toContain('window.print()');
  });

  it('neutralise le titre plutôt que de le recopier dans le <head>', () => {
    expect(documentAudit('<script>x</script>', corps)).not.toContain('<script>x');
  });
});

describe('CSS_APERCU — ce que l’export ne doit pas emporter', () => {
  it('ne vit que dans l’aperçu, et ne touche que les nœuds éditables', () => {
    expect(CSS_APERCU).toContain('[data-field]');
    expect(CSS_COMPACT).not.toContain('champ-actif');
  });
});
