import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpsCompact, dateLisible, MAX_LIGNES_AVANT_APRES } from '../htmlCompact';
import { CSS_COMPACT } from '../compactCss';
import { C } from '@/components/audit/AuditShared';
import { construireMesures, mesuresVides, NOTE_DEMO } from '@/lib/audit/mesures';
import { getDefaultAuditContent } from '@/lib/audit/default-content';
import type { AuditLu } from '@/lib/audit-site/lecture';
import type { AuditContent } from '@/types';

/**
 * Ces tests protègent trois propriétés du document ENVOYÉ — donc trois défauts
 * qu'on ne verrait qu'en rendez-vous :
 *
 *   1. chaque bloc reste éditable (sans `data-field`, il sera abandonné) ;
 *   2. rien ne dépend du réseau (une capture manquante creuse un trou) ;
 *   3. le tableau avant/après ne détaille que ce qui se compare.
 */

const CONTENU: AuditContent = getDefaultAuditContent({
  entreprise_nom: 'Menuiserie Berthier',
  demo_url: 'https://berthier.sama.fr',
});

const AUDIT: AuditLu = {
  entreprise_id: 7,
  url_analysee: 'https://berthier.fr',
  url_finale: 'https://berthier.fr',
  http_status: 200,
  bloque: false,
  injoignable: false,
  note_globale: 37,
  libelle: 'faible',
  axes: [
    { id: 'vitesse', note: 14, confiance: 'haute', preuves: [], mesureGoogle: true, constats: [] },
    { id: 'conversion', note: 52, confiance: 'haute', preuves: [] },
  ],
  axes_masques: ['popularite'],
  issue_keys: [],
  constats_google: [],
  observations: [],
  alertes: [],
  ttfb_ms: null,
  chargement_ms: null,
  poids_octets: null,
  capture_url: null,
  note_globale_demo: null,
  analyse_le: '2026-07-12T19:47:00.000Z',
  psi_performance: 14,
  psi_recupere_le: '2026-07-12T19:47:00.000Z',
};

describe('corpsCompact — le document reste éditable', () => {
  it('pose un data-field sur chaque bloc que l’opérateur doit pouvoir corriger', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    for (const champ of [
      'page1.date',
      'page1.client',
      'page2.section_intro',
      'page4.livrables.0',
      'page5.pricing',
      'page6.cta',
    ]) {
      expect(html).toContain(`data-field="${champ}"`);
    }
  });

  it('rend trois feuilles, pas six pages', () => {
    const html = corpsCompact(CONTENU, mesuresVides());
    expect(html.match(/<div class="sheet[ "]/g)).toHaveLength(3);
    expect(html.match(/<div class="half[ "]/g)).toHaveLength(6);
  });
});

describe('corpsCompact — aucune dépendance réseau dans le corps', () => {
  it('ne va chercher ni capture ni favicon chez un tiers', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    // Les deux fuites de l'ancienne couverture : elles manquaient une fois sur
    // trois et laissaient un rectangle mort en haut du document.
    expect(html).not.toContain('image.thum.io');
    expect(html).not.toContain('s2/favicons');
  });

  it('dessine un squelette quand la capture manque, et l’image quand elle est là', () => {
    const sans = corpsCompact(CONTENU, construireMesures(AUDIT));
    expect(sans).toContain('mockup-skeleton');
    expect(sans).not.toContain('<img src=');

    const avec = corpsCompact(
      CONTENU,
      construireMesures({ ...AUDIT, capture_url: 'https://cdn.sama/capture.png' }),
    );
    expect(avec).toContain('https://cdn.sama/capture.png');
  });
});

describe('corpsCompact — la réglette', () => {
  it('affiche le repère démo, et sans jamais le dire mesuré', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    expect(html).toContain(`· ${NOTE_DEMO}`);
    // Le seul repère du document qui affirme sans relever.
    expect(html).toMatch(/Votre site démo[\s\S]{0,200}?ce que fait le site préparé/);
  });

  it('n’affiche pas le repère médiane quand l’échantillon manque', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT, { valeur: 77, effectif: 4 }));
    expect(html).not.toContain('Médiane');
  });

  it('affiche la médiane et son effectif quand elle est solide', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT, { valeur: 77, effectif: 430 }));
    expect(html).toContain('Médiane');
    expect(html).toContain('430 sites');
  });
});

describe('corpsCompact — la méthode dit ce qui n’a pas été testé', () => {
  it('nomme les axes écartés plutôt que de les taire', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    expect(html).toContain('Non testé faute de mesure fiable');
    expect(html).toContain('notoriété');
  });

  it('ne cite Google que lorsqu’il a réellement mesuré', () => {
    const maison = corpsCompact(
      CONTENU,
      construireMesures({
        ...AUDIT,
        psi_recupere_le: null,
        axes: [{ id: 'conversion', note: 52, confiance: 'haute', preuves: [] }],
      }),
    );
    expect(maison).not.toContain('PageSpeed');
    expect(corpsCompact(CONTENU, construireMesures(AUDIT))).toContain('PageSpeed');
  });
});

describe('corpsCompact — le tableau avant/après', () => {
  const avec = (n: number): AuditContent => ({
    ...CONTENU,
    page3: {
      ...CONTENU.page3,
      avant_apres: Array.from({ length: n }, (_, i) => ({
        cle: `k${i}`,
        avant: `${9 - i} s d’attente`,
        apres: `${i + 1} s`,
        reponse: 'Site reconstruit.',
      })),
    },
  });

  it('ne détaille jamais plus de lignes que la demi-page n’en tient', () => {
    const html = corpsCompact(avec(6), mesuresVides());
    expect(html.match(/class="ba-row"/g)).toHaveLength(MAX_LIGNES_AVANT_APRES);
  });

  it('compte les lignes restantes au lieu de les perdre', () => {
    const html = corpsCompact(avec(6), mesuresVides());
    expect(html).toContain('+3');
    expect(html).toContain('constats de plus');
  });

  it('écarte du détail une ligne sans après — elle changerait de sujet', () => {
    // « 9ᵉ sur menuisier Antibes » face à « suivi 30 jours » ne se lit pas d'un
    // coup d'œil : la ligne existe, elle n'est simplement pas mise en regard.
    const contenu: AuditContent = {
      ...CONTENU,
      page3: {
        ...CONTENU.page3,
        avant_apres: [
          { cle: 'rang', avant: '9ᵉ sur « menuisier Antibes »' },
          { cle: 'vitesse', avant: '9,8 s d’attente', apres: '1,2 s' },
        ],
      },
    };
    const html = corpsCompact(contenu, mesuresVides());
    expect(html.match(/class="ba-row"/g)).toHaveLength(1);
    expect(html).toContain('9,8 s');
  });

  it('n’affiche aucun bandeau quand il ne reste rien à annoncer', () => {
    expect(corpsCompact(avec(2), mesuresVides())).not.toContain('plus-strip');
  });

  it('compte les lignes non comparables au lieu de les perdre en route', () => {
    // Elles sont écartées du DÉTAIL, pas du document : le commentaire du rendu
    // le promettait déjà, le code les oubliait. Le bandeau affichait « +0 » —
    // donc rien du tout — là où l'opérateur avait saisi deux constats de plus.
    const contenu: AuditContent = {
      ...CONTENU,
      page3: {
        ...CONTENU.page3,
        avant_apres: [
          { cle: 'vitesse', avant: '9,8 s d’attente', apres: '1,2 s' },
          { cle: 'rang', avant: '9ᵉ sur « menuisier Antibes »' },
          { cle: 'avis', avant: '2 avis Google' },
        ],
      },
    };
    const html = corpsCompact(contenu, mesuresVides());
    expect(html.match(/class="ba-row"/g)).toHaveLength(1);
    expect(html).toContain('plus-strip');
    expect(html).toContain('+2');
    expect(html).toContain('menuisier Antibes');
  });
});

describe('corpsCompact — les cartes d’axes', () => {
  it('détache la provenance de la mesure du nom de l’axe', () => {
    // Elle sortait en `<u>` collé au nom : « RAPIDITÉMESURÉ PAR GOOGLE »,
    // souligné, passait à la ligne et déformait la carte.
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    expect(html).toContain('<span class="ax-src">mesuré par Google</span>');
    expect(html).not.toContain('<u>');
  });

  it('range quatre axes en deux colonnes, pas en trois avec un orphelin', () => {
    const quatre = construireMesures({
      ...AUDIT,
      axes: ['vitesse', 'seo', 'mobile', 'conversion'].map((id) => ({
        id: id as AuditLu['axes'][number]['id'],
        note: 40,
        confiance: 'haute' as const,
        preuves: [],
      })),
    });
    expect(corpsCompact(CONTENU, quatre)).toContain('class="ax-grid ax-n4"');
    expect(corpsCompact(CONTENU, construireMesures(AUDIT))).toContain('class="ax-grid"');
  });
});

describe('corpsCompact — chaque demi-page est atteignable', () => {
  it('porte un identifiant de défilement, sinon les onglets ne visent rien', () => {
    const html = corpsCompact(CONTENU, construireMesures(AUDIT));
    for (let n = 1; n <= 6; n++) expect(html).toContain(`id="audit-h${n}"`);
  });
});

describe('corpsCompact — l’échappement', () => {
  it('neutralise le HTML venu du contenu', () => {
    const contenu: AuditContent = {
      ...CONTENU,
      page1: { ...CONTENU.page1, client_name: '<script>alert(1)</script>' },
    };
    const html = corpsCompact(contenu, mesuresVides());
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('remplit les vides plutôt que de laisser un trou', () => {
    const contenu: AuditContent = {
      ...CONTENU,
      page1: { ...CONTENU.page1, client_name: '', client_meta: '   ' },
    };
    const html = corpsCompact(contenu, mesuresVides());
    expect(html).toContain('Entreprise cliente');
    expect(html).toContain('Secteur · Ville');
  });
});

describe('dateLisible', () => {
  it('écrit la date en clair — c’est ce qui rend la mesure opposable', () => {
    expect(dateLisible('2026-07-12T19:47:00.000Z')).toBe('12 juillet 2026');
  });

  it('rend une chaîne vide sur une date absente ou illisible', () => {
    expect(dateLisible(null)).toBe('');
    expect(dateLisible('pas une date')).toBe('');
  });
});

describe('la palette suit la charte, elle ne la recopie pas', () => {
  const SOURCES = ['../compactCss.ts', '../htmlCompact.ts'];

  /** Les couleurs de la charte, plus celles qu'elle a remplacées. */
  const MARQUE = [...Object.values(C), '#0B1D3A', '#3A7BD5', '#F4F1EB'];
  const triplet = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  };

  it.each(SOURCES)('%s n’écrit aucune couleur de marque en dur', (fichier) => {
    // Les couleurs étaient recopiées de la maquette. La charte Sama en a changé
    // trois — nuit, azur, crème — et le document se serait mis à sortir hors
    // charte sans que rien ne le signale : le seul symptôme aurait été un bleu
    // légèrement différent du reste du CRM, sur un document qu'on ne regarde
    // qu'une fois avant de l'envoyer.
    //
    // Les anciennes valeurs sont interdites au même titre que les nouvelles :
    // écrire la bonne couleur en dur aujourd'hui produit la mauvaise demain.
    const source = readFileSync(join(__dirname, fichier), 'utf-8');
    for (const hex of MARQUE) {
      expect(source).not.toContain(hex);
      // Une `rgba()` recopiée porte le triplet et redevient un point de
      // divergence, en plus discret.
      expect(source).not.toContain(`rgba(${triplet(hex)}`);
    }
  });

  it('sert bien les valeurs courantes de la charte', () => {
    expect(CSS_COMPACT).toContain(`--nuit:${C.nuit}`);
    expect(CSS_COMPACT).toContain(`--azur:${C.azur}`);
    expect(CSS_COMPACT).toContain(`--creme:${C.creme}`);
  });
});
