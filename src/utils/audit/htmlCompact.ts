import type { AuditContent, AuditPage5 } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { LIBELLE_DEMO, detailNote, mesuresVides, sousTitreNote } from '@/lib/audit/mesures';
import { esc, logoSvg, makeGrainSvgUrl, getServices, calcTotal, fmtEur } from './htmlShared';
import { C } from './palette';

/** Un hexadécimal en triplet `r,g,b`, pour les teintes transparentes. */
const rgbDe = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/**
 * Le document d'audit : trois feuilles A4, chacune coupée en deux demi-pages.
 *
 * REMPLACE l'ancien deck de six pages. Ce n'est pas une variante — c'est le
 * document envoyé, et l'autre n'existe plus.
 *
 * TROIS PROPRIÉTÉS QUI COMMANDENT L'ÉCRITURE DE CE FICHIER.
 *
 * 1. **Fonctions pures `(contenu, mesures) => string`.** Aucun accès au DOM,
 *    aucun état, aucune dépendance de framework. C'est ce qui permet au même
 *    bloc de servir à l'impression, au rapport public et à l'aperçu de
 *    l'éditeur — au lieu des trois copies divergentes qu'on maintenait.
 *
 * 2. **Les mots et les chiffres arrivent séparément.** `AuditContent` porte la
 *    rédaction, éditable à la main ; `MesuresAudit` porte le relevé, éditable
 *    par personne. Aucune valeur de mesure ne doit être recopiée dans le
 *    contenu : un chiffre retouché à la main est un faux.
 *
 * 3. **Tout nœud éditable porte `data-field`.** L'éditeur pose UN écouteur
 *    délégué qui lit `closest('[data-field]')` pour savoir quel champ ouvrir.
 *    Un bloc dessiné sans identifiant n'est pas éditable, donc il sera
 *    abandonné : c'est la contrainte qui a survécu au changement de rendu.
 *
 * ZÉRO REQUÊTE RÉSEAU dans le corps du document, hors les polices. L'ancienne
 * couverture chargeait sa capture depuis `image.thum.io` et sa favicon depuis
 * Google : deux dépendances qui disparaissent au premier réseau capricieux, et
 * qui manquaient une fois sur trois dans une capture. La capture vient
 * maintenant de `mesures.captureUrl`, hébergée chez nous, avec un état vide
 * dessiné quand elle manque.
 */

/** Le nombre de lignes détaillées de l'avant/après. Au-delà, la demi-page déborde. */
export const MAX_LIGNES_AVANT_APRES = 3;

type Zone = { field?: string };

/** Ouvre une balise en y posant `data-field` s'il y a un champ à éditer. */
function z(tag: string, cls: string, opts: Zone = {}): string {
  const f = opts.field ? ` data-field="${esc(opts.field)}"` : '';
  return `<${tag} class="${cls}"${f}>`;
}

function texte(valeur: string | null | undefined, secours: string): string {
  const v = (valeur ?? '').trim();
  return esc(v || secours);
}

function grainLayer(opacite?: number): string {
  return `<div class="grain" style="opacity:${opacite ?? 0.045};background-image:${makeGrainSvgUrl()}"></div>`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Une date de mesure se lit en clair : c'est ce qui la rend opposable. */
export function dateLisible(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function panelHead(
  eyebrow: string | undefined,
  titre: string | undefined,
  em: string | undefined,
  intro: string | undefined,
  champs: { eyebrow?: string; titre?: string; intro?: string } = {},
): string {
  return `<div><div class="panel-head">${z('div', 'panel-eyebrow', { field: champs.eyebrow })}${esc(eyebrow ?? '')}</div></div>
${z('div', 'panel-title', { field: champs.titre })}${esc(titre ?? '')}${em ? ` <em>${esc(em)}</em>` : ''}</div>
${intro ? `${z('div', 'panel-intro', { field: champs.intro })}${esc(intro)}</div>` : ''}</div>`;
}

/**
 * Ce qui distingue les deux documents que ce fichier rend, réduit au strict
 * minimum : un nombre de feuilles et deux mentions.
 *
 * Ces trois valeurs étaient écrites en dur dans les demi-pages, ce qui allait
 * tant qu'il n'y avait qu'un document. Une plaquette de deux feuilles aurait
 * affiché « 01 / 3 · préparé pour Entreprise cliente » — un total qui envoie le
 * lecteur chercher une troisième feuille inexistante, et un destinataire nommé
 * sur un document envoyé à trois cents personnes.
 */
interface Feuillets {
  /** Le nombre de feuilles A4, pour le « n / total » du pied. */
  total: number;
  /** La mention de gauche du pied de feuille. */
  mention: string;
  /** La ligne de signature, sous la dernière demi-page. */
  signature: string;
}

/** Le destinataire de l'audit, jamais vide : un pied à trou se remarque. */
function destinataire(c: AuditContent): string {
  return (c.page1.client_name ?? '').trim() || 'Entreprise cliente';
}

function feuilletsAudit(c: AuditContent): Feuillets {
  const nom = destinataire(c);
  return {
    total: 3,
    mention: `Confidentiel · préparé pour ${nom}`,
    signature: `Document confidentiel préparé exclusivement pour ${nom}`,
  };
}

/**
 * La plaquette ne nomme personne, et ne se dit pas confidentielle : elle part
 * telle quelle à toute une cohorte. Ce qu'elle doit dire à la place, c'est
 * jusqu'à quand ses prix valent — parce qu'ils sont ceux du jour de l'édition.
 */
const FEUILLETS_PLAQUETTE: Feuillets = {
  total: 2,
  mention: 'SAMA · Agence digitale indépendante',
  signature: 'Tarifs en vigueur au jour de l’édition — devis définitif sur demande.',
};

function sheetFoot(f: Feuillets, n: string): string {
  return `<div class="sheet-foot"><span>${esc(f.mention)}</span><b>${n} / ${f.total}</b></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Couverture
// ─────────────────────────────────────────────────────────────────────────────

function cCouverture(c: AuditContent, m: MesuresAudit): string {
  const p = c.page1;
  const capture = m.captureUrl;

  return `<div class="half half-cover" id="audit-h1" data-screen-label="A4-1 couverture">
<div class="cover-sky"></div>${grainLayer(c.global_style?.grain_opacity)}
<div class="cover-in">
  <div class="cover-top"><div class="logo-block">${logoSvg(22, C.brume)}<span class="logo-wm">SAMA</span></div>${z('span', 'cover-date', { field: 'page1.date' })}${esc(p.date)}</span></div>
  <div class="cover-main">
    ${z('div', 'cover-eyebrow', { field: 'page1.eyebrow' })}${esc(p.eyebrow)}</div>
    ${z('div', 'cover-title', { field: 'page1.title' })}${esc(p.title_line1)}<br>${esc(p.title_line2)} <em>${esc(p.title_line3)}</em></div>
    ${z('div', 'cover-subtitle', { field: 'page1.subtitle' })}${esc(p.subtitle)}</div>
  </div>
  <div class="cover-foot">
    ${z('div', 'cover-client', { field: 'page1.client' })}<div class="cover-client-label">Préparé pour</div><div class="cover-client-name">${texte(p.client_name, 'Entreprise cliente')}</div><div class="cover-client-meta">${texte(p.client_meta, 'Secteur · Ville')}</div></div>
    ${p.demo_url ? blocDemo(p.demo_url, capture) : ''}
  </div>
</div></div>`;
}

/**
 * L'aperçu du site.
 *
 * Le squelette reste visible sous l'image : c'est l'état vide DÉFINI dont parle
 * le cahier des charges. Une capture absente laisse une forme de page plutôt
 * qu'un rectangle mort, et le document ne trahit pas ce qui lui manque.
 */
function blocDemo(url: string, capture: string | null): string {
  return `<a class="demo-cta" href="${esc(url)}" target="_blank" rel="noopener">
  <div class="demo-cta-label">Votre site démo est en ligne</div>
  <div class="mockup"><div class="mockup-chrome"><div class="mockup-dots"><i></i><i></i><i></i></div><div class="mockup-url">${esc(domainOf(url))}</div></div>
    <div class="mockup-screen">
      <div class="mockup-skeleton"><div class="sk-hero"></div><div class="sk-line" style="width:88%"></div><div class="sk-line" style="width:62%"></div><div class="sk-btn"></div></div>
      ${capture ? `<img src="${esc(capture)}" alt="Aperçu du site préparé">` : ''}
    </div>
  </div>
  <div class="demo-cta-link"><span>Découvrez-le maintenant</span><b>→</b></div>
</a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 01 · Le relevé
// ─────────────────────────────────────────────────────────────────────────────

const BANDES = [0.06, 0.1, 0.15, 0.21, 0.28, 0.36, 0.45, 0.56, 0.68, 0.82];

/**
 * La réglette : la note ne se présente jamais seule.
 *
 * Trois repères sur un seul axe — le prospect, la médiane du parc, le site
 * préparé. Elle rend la note relative, donc non vexante, et elle est lisible en
 * une seconde par un artisan français parce qu'elle emprunte à l'étiquette DPE.
 *
 * Le repère médiane s'efface quand l'échantillon est trop maigre. Un repère qui
 * situe quelqu'un par rapport à quatre concurrents vaut moins que pas de repère
 * du tout, et personne ne verrait la différence.
 */
function reglette(m: MesuresAudit): string {
  const bandes = BANDES.map((a) => `<i style="background:rgba(${rgbDe(C.nuit)},${a})"></i>`).join('');
  const marque = (cls: string, v: number | null) =>
    v == null ? '' : `<span class="mk mk-${cls}" style="left:${v}%"></span>`;

  const legende = [
    m.reperes.prospect == null
      ? ''
      : `<div class="lg lg-p"><i></i><span><b>Votre site <em>· ${m.reperes.prospect}</em></b><small>mesuré le ${esc(dateLisible(m.mesureLe))}</small></span></div>`,
    m.reperes.mediane == null
      ? ''
      : `<div class="lg lg-m"><i></i><span><b>Médiane <em>· ${m.reperes.mediane}</em></b><small>${esc(String(m.reperes.medianeN ?? ''))} sites d’artisans mesurés</small></span></div>`,
    `<div class="lg lg-s"><i></i><span><b>Votre site démo <em>· ${m.reperes.demo}</em></b><small>${esc(LIBELLE_DEMO)}</small></span></div>`,
  ].join('');

  return `<div class="score-hero">
<div class="score-num"><div class="score-lbl">Note globale</div>
  <div class="score-val"><b>${m.noteGlobale ?? '—'}</b><s>/ 100</s></div>
  <div class="score-sub">${esc(sousTitreNote(m))}</div>
  ${soustraction(m)}</div>
<div class="score-rail">
  <div class="rail">${bandes}${marque('m', m.reperes.mediane)}${marque('s', m.reperes.demo)}${marque('p', m.reperes.prospect)}</div>
  <div class="rail-axis"><span>0 — rien ne fonctionne</span><span>50</span><span>100 — tout fonctionne</span></div>
  <div class="rail-legend">${legende}</div>
</div></div>`;
}

/**
 * La soustraction, écrite sous la note.
 *
 * C'est ce qui distingue cette note de celle qu'elle remplace : « 58 mesuré par
 * Google, moins 7 » se lit à voix haute en rendez-vous, et chaque point retiré
 * porte une raison que le prospect vérifie sur son téléphone. Une moyenne
 * pondérée ne se raconte pas ; un malus caché serait encore plus opaque qu'elle.
 */
function soustraction(m: MesuresAudit): string {
  const d = detailNote(m);
  if (!d) return '';
  return `<div class="score-calc"><b>${d.base}</b> mesuré par Google, moins <b>${d.retire}</b><span>${d.lignes
    .map(esc)
    .join(' · ')}</span></div>`;
}

/**
 * Une carte par axe mesuré. Quatre à six selon que Google a mesuré.
 *
 * La mention « mesuré par Google » est la seule chose qui distingue un relevé
 * opposable d'une opinion d'agence, et elle passe donc en pastille sous le nom
 * de l'axe. Elle sortait jusqu'ici en `<u>` collé au nom — « RAPIDITÉMESURÉ PAR
 * GOOGLE », souligné, sur deux lignes, la carte déformée.
 */
function cartesAxes(m: MesuresAudit): string {
  const cartes = m.axes
    .map((a) => {
      const remplies = Math.round(a.note / 10);
      const barres = Array.from({ length: 10 }, (_, i) => `<i class="${i < remplies ? 'on' : ''}"></i>`).join('');
      return `<div class="ax-card">
<div class="ax-top"><div class="ax-nm">${esc(a.nom)}${a.mesureGoogle ? '<span class="ax-src">mesuré par Google</span>' : ''}</div><div class="ax-note">${a.note}<s>/100</s></div></div>
<div class="ax-bar">${barres}</div>
${a.valeur ? `<div class="ax-v">${esc(a.valeur)}</div>` : ''}</div>`;
    })
    .join('');
  return `<div class="ax-grid${m.axes.length === 4 ? ' ax-n4' : ''}">${cartes}</div>`;
}

function cReleve(c: AuditContent, m: MesuresAudit): string {
  const p = c.page2;
  const intro = p.section_intro;

  return `<div class="half half-score" id="audit-h2" data-screen-label="A4-1 · 01 Le relevé">
${panelHead(p.section_label, p.section_title, p.section_title_em, intro, {
    eyebrow: 'page2.section_label',
    titre: 'page2.section_heading',
    intro: 'page2.section_intro',
  })}
<div class="panel-body">
  ${reglette(m)}${cartesAxes(m)}
  ${blocMethode(m)}
</div>
${sheetFoot(feuilletsAudit(c), '01')}</div>`;
}

/**
 * La méthode, en quatre lignes.
 *
 * Ce qui a été testé, avec quel outil, quand — et surtout **ce qui ne l'a pas
 * été**. C'est le bloc qu'aucun concurrent ne met, et c'est lui qui rend le
 * reste incontestable : un rapport qui dit où il s'arrête se lit comme un
 * diagnostic, pas comme un argumentaire.
 */
function blocMethode(m: MesuresAudit): string {
  const source = m.mesureParGoogle
    ? 'PageSpeed Insights de Google, sur un vrai téléphone'
    : 'notre analyseur, sur la page publique';
  const nonTeste =
    m.axesNonTestes.length > 0
      ? ` Non testé faute de mesure fiable : ${esc(m.axesNonTestes.join(', ').toLowerCase())}.`
      : '';

  return `<div class="verdict-strip">
<p>Mesuré le ${esc(dateLisible(m.mesureLe))} avec ${esc(source)}, sur ${esc(m.url ?? 'votre site public')}, sans accès à vos comptes.${nonTeste}</p>
<span>${m.mesureParGoogle ? 'Vérifiable en trente secondes sur pagespeed.web.dev' : 'Vérifiable en dix secondes depuis votre téléphone'}</span>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 02 · Constat → après
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'avant/après, et la règle qui décide de ce qui y entre.
 *
 * **Les deux côtés portent la même unité, sinon la ligne n'est pas détaillée.**
 * « 9,8 s → 1,2 s » se lit en une seconde ; « 9ᵉ sur *menuisier Antibes* →
 * suivi 30 jours » change de sujet, et cette bascule est exactement l'endroit où
 * un document de mesure redevient une plaquette. Les lignes qui ne comparent pas
 * la même grandeur ne sont pas jetées pour autant : elles alimentent le bandeau
 * « +N constats de plus », qui prouve la profondeur sans rien promettre.
 */
function cConstats(c: AuditContent, m: MesuresAudit): string {
  const p = c.page3;
  const lignesSaisies = p.avant_apres ?? [];
  const comparables = lignesSaisies.filter((l) => l.apres && l.apres.trim());
  const detaillees = comparables.slice(0, MAX_LIGNES_AVANT_APRES);
  /*
   * Ce qui n'est pas détaillé est COMPTÉ, jamais perdu. Trois sources, et il en
   * manquait une : les lignes sans après — celles dont les deux côtés ne portent
   * pas la même unité — étaient écartées du détail puis oubliées du décompte,
   * alors que ce sont justement des constats relevés sur le site. Le document
   * affichait « +2 » là où l'opérateur en avait saisi quatre, et personne ne
   * pouvait s'en apercevoir sans recompter à la main.
   */
  const reste = [
    ...comparables.slice(MAX_LIGNES_AVANT_APRES),
    ...lignesSaisies.filter((l) => !l.apres || !l.apres.trim()),
    ...m.constats.filter((k) => !lignesSaisies.some((l) => l.cle === k.cle)),
  ];

  const lignes = detaillees
    .map(
      (l, i) => `<div class="ba-row" data-field="page3.avant_apres.${i}">
<div class="ba-side"><div class="ba-v">${esc(l.avant)}</div>${l.precision ? `<div class="ba-d">${esc(l.precision)}</div>` : ''}</div>
<div class="ba-side ba-after"><div class="ba-v">${esc(l.apres ?? '')}</div>${l.reponse ? `<div class="ba-d">${esc(l.reponse)}</div>` : ''}</div>
<span class="ba-arrow">→</span></div>`,
    )
    .join('');

  const bandeau =
    reste.length > 0
      ? `<div class="plus-strip"><div class="plus-n">+${reste.length}</div>
<div><div class="plus-t">constats de plus relevés sur votre site</div><div class="plus-l">${reste
          .slice(0, 6)
          .map((r) => esc('libelle' in r ? r.libelle : r.avant))
          .join(' &nbsp;·&nbsp; ')}</div></div>
<div class="plus-c">Détaillés pendant l’appel</div></div>`
      : '';

  return `<div class="half" id="audit-h3" data-screen-label="A4-2 · 02 Constat → après">
${panelHead(p.section_label, p.section_title, p.section_title_em, p.section_intro, {
    eyebrow: 'page3.section_label',
    titre: 'page3.section_heading',
    intro: 'page3.section_intro',
  })}
<div class="panel-body" style="gap:11px">
  <div class="ba-heads"><div class="ba-h ba-h-b">Avant · votre site aujourd’hui</div><div class="ba-h ba-h-a">Après · ${esc(LIBELLE_DEMO)}</div></div>
  <div class="ba-stack">${lignes}</div>
  ${bandeau}
</div></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 · Ce qui change
// ─────────────────────────────────────────────────────────────────────────────

function cRecu(c: AuditContent, f: Feuillets, n: string): string {
  const p = c.page4;
  const entetes = p.recu_head ?? ['Le volet', 'Ce que vous recevez', 'Ce que ça corrige'];

  return `<div class="half" id="audit-h4" data-screen-label="A4-2 · 03 Ce qui change">
${panelHead(p.section_label, p.section_title, p.section_title_em, p.section_subtitle, {
    eyebrow: 'page4.section_label',
    titre: 'page4.section_heading',
    intro: 'page4.section_subtitle',
  })}
<div class="panel-body">
  <div class="recu-table">
    <div class="recu-th">${entetes.map((h) => `<div>${esc(h)}</div>`).join('')}</div>
    ${p.livrables
      .map(
        (l, i) => `<div class="recu-row" data-field="page4.livrables.${i}"><div class="recu-label">${esc(l.title)}</div><div class="recu-text">${esc(l.items.join(' '))}</div><div class="recu-fix">${(l.fix ?? '')
          .split('\n')
          .map(esc)
          .join('<br>')}</div></div>`,
      )
      .join('')}
  </div>
</div>
${sheetFoot(f, n)}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 · Investissement
// ─────────────────────────────────────────────────────────────────────────────

function cInvestissement(c: AuditContent): string {
  const p = c.page5;
  const services = getServices(p).filter((s) => s.enabled);
  const { total, hasMrr } = calcTotal(getServices(p));
  const additions = p.additional_services ?? [];
  const sc = p.secondary_card;

  /*
   * LE CALAGE VERTICAL DÉPEND DE CE QU'IL Y A À CALER, et ce n'est pas une
   * coquetterie.
   *
   * Un audit remplit cette demi-page : grille tarifaire, formule alternative,
   * jusqu'à trois additions conseillées. Elle doit donc démarrer en haut, sinon
   * la dernière addition passe sous la ligne de coupe — et `overflow:hidden` la
   * ferait disparaître sans rien dire.
   *
   * La plaquette n'a ni addition (aucun constat retenu, donc rien à conseiller)
   * ni forcément d'alternative (le catalogue n'en porte pas toujours une). La
   * même consigne y laisse deux cents pixels de crème sous le bloc de prix, ce
   * qui ne se lit pas comme de l'air mais comme une page tronquée. Un audit sans
   * addition ni alternative souffrait déjà du même trou.
   */
  const pleine = additions.length > 0 || Boolean(sc);

  return `<div class="half" id="audit-h5" data-screen-label="A4-3 · 04 Investissement">
<div class="panel-head">${z('div', 'panel-eyebrow', { field: 'page5.section_label' })}${esc(p.section_label ?? '')}</div></div>
<div class="panel-body" style="justify-content:${pleine ? 'flex-start' : 'center'};padding-top:${pleine ? '6px' : '0'}">
  ${p.pricing_subtitle ? `${z('div', 'invest-subtitle', { field: 'page5.pricing_subtitle' })}${esc(p.pricing_subtitle)}</div>` : ''}
  ${z('div', 'invest-block', { field: 'page5.pricing' })}<div class="invest-gradient"></div>${p.show_grain !== false ? grainLayer(c.global_style?.grain_opacity) : ''}
    <div class="invest-inner">
      ${services
        .map(
          (s) =>
            `<div class="invest-row"><div><div class="invest-label">${esc(s.label)}</div>${s.sub_label ? `<div class="invest-sublabel">${esc(s.sub_label)}</div>` : ''}</div><div class="invest-amount">${s.from ? 'À partir de ' : ''}${fmtEur(s.amount)}${s.is_mrr ? '/mois' : ''}</div></div>`,
        )
        .join('')}
      ${!p.hide_total ? `<div class="invest-row-total"><div class="invest-total-label">${hasMrr ? 'Investissement total (an 1)' : 'Investissement total'}</div><div class="invest-total-amount">${fmtEur(total)}</div></div>` : ''}
      ${p.price_note ? `${z('div', 'invest-note', { field: 'page5.price_note' })}${esc(p.price_note)}</div>` : ''}
    </div>
  </div>
  ${sc ? `<div class="secondary-card"><div>${sc.subtitle ? `<div class="secondary-sub">${esc(sc.subtitle)}</div>` : ''}<div class="secondary-title">${esc(sc.title)}</div>${sc.description ? `<div class="secondary-desc">${esc(sc.description)}</div>` : ''}</div><div>${sc.from ? '<div class="secondary-from">À partir de</div>' : ''}<div class="secondary-amount">${fmtEur(sc.amount)}</div></div></div>` : ''}
  ${
    additions.length > 0
      ? `<div class="opt-wrap"><div class="opt-label">${esc(p.addl_section_title || 'Pour aller plus loin')}</div>
  <div class="opt-grid">${additions
    .map(
      (o, i) =>
        `<div class="opt-card" data-field="page5.additional_services.${i}"><div class="opt-title">${esc(o.label)}</div>${o.description ? `<div class="opt-desc">${esc(o.description)}</div>` : ''}<div class="opt-foot"><span class="opt-amount">${fmtEur(o.amount)}${o.is_mrr ? '<i>/mois</i>' : ''}</span>${o.badge ? `<span class="opt-note">${esc(o.badge)}</span>` : ''}</div></div>`,
    )
    .join('')}</div></div>`
      : ''
  }
</div></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 05 · Prochaines étapes
// ─────────────────────────────────────────────────────────────────────────────

function cEtapes(c: AuditContent, m: MesuresAudit, f: Feuillets, n: string): string {
  const p = c.page6;
  /*
   * `demo` commande le contenu ET le calage, pour la même raison que sur la
   * demi-page tarifs : le bloc « allez voir votre site démo » occupe cent
   * quinze pixels, exactement le trou qu'il laisse en son absence. Calé en haut
   * sans lui, le document se termine sur une bande de crème qui se lit comme
   * une page coupée. La plaquette n'a jamais de démo à montrer — elle part avant
   * qu'on en construise un — et un audit sans site préparé non plus.
   */
  const demo = c.page1.demo_url;

  return `<div class="half" id="audit-h6" data-screen-label="A4-3 · 05 Prochaines étapes">
<div class="panel-head">${z('div', 'panel-eyebrow', { field: 'page6.section_label' })}${esc(p.section_label ?? '')}</div></div>
${z('div', 'panel-title', { field: 'page6.section_heading' })}${esc(p.section_title ?? '')} ${esc(p.section_title_line2 ?? '')} <em>${esc(p.section_title_em ?? '')}</em></div>
<div class="panel-body" style="justify-content:${demo ? 'flex-start' : 'center'};padding-top:${demo ? '14px' : '0'};gap:11px">
  <div class="steps-grid">${p.next_steps
    .map(
      (s, i) =>
        `<div class="step-card" data-field="page6.next_steps.${i}"><div class="step-num">${i + 1}</div><div class="step-title">${esc(s.title)}</div><div class="step-desc">${esc(s.desc)}</div></div>`,
    )
    .join('')}</div>
  ${
    demo
      ? `<a class="demo-push" href="${esc(demo)}" target="_blank" rel="noopener">
    ${m.captureUrl ? `<div class="demo-push-shot"><img src="${esc(m.captureUrl)}" alt=""></div>` : ''}
    <div class="demo-push-txt"><div class="demo-push-label">Avant l’appel</div><div class="demo-push-title">Allez voir votre site démo</div><div class="demo-push-url">${esc(domainOf(demo))}</div></div>
    <div class="demo-push-btn">Ouvrir le site démo →</div></a>`
      : ''
  }
  ${z('div', 'cta-block', { field: 'page6.cta' })}<div><div class="cta-title">${esc(p.cta_title)}</div><div class="cta-sub">${esc(p.cta_sub)}</div>${p.contact_website ? `<div class="cta-contact-web">${esc(p.contact_website)}</div>` : ''}</div>
    <div class="cta-contact">${p.contact_phone ? `<a class="cta-btn cta-btn-tel" href="tel:${esc(p.contact_phone.replace(/\s/g, ''))}"><span>Appeler</span><b>${esc(p.contact_phone)}</b></a>` : ''}${p.contact_email ? `<a class="cta-btn cta-btn-mail" href="mailto:${esc(p.contact_email)}"><span>Écrire</span><b>${esc(p.contact_email)}</b></a>` : ''}</div>
  </div>
  <div class="sign">${logoSvg(18, C.azur)}<div class="sign-text">SAMA · Agence digitale indépendante<br>${esc(f.signature)}</div></div>
</div>
${sheetFoot(f, n)}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Le corps du document — trois feuilles, six demi-pages. */
export function corpsCompact(c: AuditContent, m: MesuresAudit): string {
  const f = feuilletsAudit(c);
  return `<div class="sheet no-mark">${cCouverture(c, m)}${cReleve(c, m)}</div>
<div class="sheet">${cConstats(c, m)}${cRecu(c, f, '02')}</div>
<div class="sheet">${cInvestissement(c)}${cEtapes(c, m, f, '03')}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// La plaquette
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La couverture de la plaquette : ce qu'on vend, et à qui.
 *
 * `cCouverture` ne convient pas — elle est bâtie autour du destinataire (nom,
 * secteur, ville) et de la capture de son site démo. Un prospect sans site n'a
 * ni l'un ni l'autre, et la case « Préparé pour » se remplirait de « Entreprise
 * cliente », ce qui signale à l'ouverture que le document n'est pas pour lui.
 *
 * Le titre, le chapô et la date viennent quand même de `page1` : le contenu
 * reste la source unique des mots, comme pour l'audit. Ce sont les DEUX BLOCS DU
 * BAS qui changent de nature — à la place du destinataire et de son démo, la
 * cible et le prix. Le prix se lit sur la couverture parce que la plaquette part
 * à froid : un document qu'on ouvre sans nous connaître doit répondre « combien »
 * avant qu'on le referme, et il est relu de `page5`, jamais recopié.
 */
function cCouverturePlaquette(c: AuditContent): string {
  const p = c.page1;
  const tarif = teaserTarif(c.page5);

  return `<div class="half half-cover" id="plaquette-h1" data-screen-label="A4-1 couverture">
<div class="cover-sky"></div>${grainLayer(c.global_style?.grain_opacity)}
<div class="cover-in">
  <div class="cover-top"><div class="logo-block">${logoSvg(22, C.brume)}<span class="logo-wm">SAMA</span></div><span class="cover-date">${esc(p.date)}</span></div>
  <div class="cover-main">
    <div class="cover-eyebrow">${esc(p.eyebrow)}</div>
    <div class="cover-title">${esc(p.title_line1)}<br>${esc(p.title_line2)} <em>${esc(p.title_line3)}</em></div>
    <div class="cover-subtitle">${esc(p.subtitle)}</div>
  </div>
  <div class="cover-foot"><div class="pq-duo">
    <div class="cover-client"><div class="cover-client-label">Pour qui</div><div class="cover-client-name">Artisans du bâtiment</div><div class="cover-client-meta">Couvreurs, menuisiers, plombiers, électriciens, maçons.</div></div>
    ${tarif ? `<div class="cover-client"><div class="cover-client-label">Nos tarifs</div><div class="cover-client-name">${esc(tarif.montant)}</div><div class="cover-client-meta">${esc(tarif.detail)}</div></div>` : ''}
  </div></div>
</div></div>`;
}

/**
 * Le prix de couverture, relu de la page tarifs — jamais écrit ici.
 *
 * `audits.content` fige les prix au moment où le document est créé : quatre
 * audits en base annoncent encore un tarif qu'on ne pratique plus. La plaquette
 * n'est justement pas stockée, elle est reconstruite à chaque ouverture depuis
 * la table `offres` ; recopier un montant dans ce fichier lui ferait perdre la
 * seule propriété qui la distingue.
 *
 * Rien à afficher si le catalogue ne rend rien : un bloc « Nos tarifs » vide sur
 * une couverture est pire que pas de bloc du tout.
 */
function teaserTarif(p: AuditPage5): { montant: string; detail: string } | null {
  const services = getServices(p).filter((s) => s.enabled);
  const ponctuel = services.find((s) => !s.is_mrr);
  if (!ponctuel) return null;

  const mensuel = services.find((s) => s.is_mrr);
  return {
    montant: `${ponctuel.from ? 'Dès ' : ''}${fmtEur(ponctuel.amount)} HT`,
    detail: mensuel
      ? `puis ${fmtEur(mensuel.amount)}/mois — hébergement, maintenance et modifications comprises.`
      : 'Prix HT. Devis définitif sur demande.',
  };
}

/**
 * Le verrou de la plaquette : un contenu qui ne PEUT pas nommer un destinataire.
 *
 * Les trois champs vidés sont les seuls par lesquels le prospect entre dans le
 * document — son nom, son secteur/ville, l'adresse du site démo préparé à son
 * intention. Ils sont retirés à l'ENTRÉE des rendus, pas seulement laissés vides
 * par le constructeur : un `demo_url` qui traînerait ferait sortir « Allez voir
 * VOTRE site démo » et sa capture sur un document envoyé à toute une cohorte,
 * et personne ne le verrait avant le prospect.
 */
export function contenuImpersonnel(c: AuditContent): AuditContent {
  return { ...c, page1: { ...c.page1, client_name: '', client_meta: '', demo_url: '' } };
}

/**
 * Le corps de la plaquette — DEUX feuilles, QUATRE demi-pages.
 *
 * PAIR, ET CE N'EST PAS UN CHOIX DE MISE EN PAGE. `.sheet` est une grille
 * `1fr 1fr` en `overflow:hidden` (compactCss.ts) : une feuille tient exactement
 * deux demi-pages, et une cinquième disparaîtrait sans le moindre signal — on ne
 * s'en apercevrait que devant le prospect. Tout ajout ici se fait par paire.
 *
 * Les trois demi-pages reprises de l'audit sont celles qui ne lisent rien du
 * prospect : ce qu'il reçoit, ce que ça coûte, comment on démarre. Elles ne sont
 * pas recopiées — c'est le même code, donc une correction de la grille tarifaire
 * ou du bloc de contact vaut pour les deux documents le même jour.
 *
 * LE CONTENU EST NEUTRALISÉ À L'ENTRÉE, et pas seulement construit neutre par
 * `construirePlaquette`. La plaquette part à trois cents personnes : elle ne doit
 * pas POUVOIR nommer quelqu'un, quel que soit le contenu qu'on lui passe.
 */
export function corpsPlaquette(c: AuditContent): string {
  const impersonnel = contenuImpersonnel(c);
  const f = FEUILLETS_PLAQUETTE;
  const m = mesuresVides();

  return `<div class="sheet no-mark">${cCouverturePlaquette(impersonnel)}${cRecu(impersonnel, f, '01')}</div>
<div class="sheet">${cInvestissement(impersonnel)}${cEtapes(impersonnel, m, f, '02')}</div>`;
}

/**
 * Ce que la plaquette nominative sait de son destinataire. Rien d'autre n'entre.
 *
 * Quatre champs, et pas un de plus : c'est ce qui rend le verrou vérifiable.
 * `contenuImpersonnel` protège le document collectif en vidant les champs du
 * contenu ; ici la protection est inverse et vaut mieux — le prospect n'arrive
 * pas par le contenu, il arrive par un paramètre qu'il faut fournir exprès.
 */
export interface ProspectPlaquette {
  /** Le nom de l'entreprise, tel qu'il s'écrit sur la couverture. */
  nom: string;
  /** La ligne du dessous : « Secteur · Ville ». Vide si on ne sait pas. */
  meta: string;
  /** L'adresse de sa démo. Sans elle, il n'y a rien de nominatif à montrer. */
  demoUrl: string;
  /** La capture de cette démo (`sites.og_shot_url`), ou null : le squelette suffit. */
  captureDemo: string | null;
}

/**
 * La couverture nominative : son nom, sa démo, sa capture.
 *
 * ELLE NE PASSE PAS PAR `contenuImpersonnel`, ET C'EST TOUT L'INTÉRÊT. Le verrou
 * du dépliant collectif interdit qu'un `demo_url` sorte sur un document envoyé à
 * trois cents personnes — un accident que personne ne verrait avant le prospect.
 * Ce document-ci ne part pas à trois cents personnes : son URL porte un jeton
 * qui désigne UNE entreprise, et le prospect est passé en paramètre plutôt que
 * lu dans le contenu, si bien qu'on ne peut pas en produire un par distraction.
 * Le verrou n'est pas levé, il est déplacé là où il se vérifie.
 *
 * `blocDemo` est celui de l'audit, pas une copie : le cadre de navigateur, le
 * squelette sous l'image et l'appel à l'action doivent rester les mêmes dans les
 * deux documents, sans quoi ils divergeront à la première retouche.
 */
function cCouverturePlaquetteNominative(c: AuditContent, pr: ProspectPlaquette): string {
  const p = c.page1;

  return `<div class="half half-cover" id="plaquette-h1" data-screen-label="A4-1 couverture">
<div class="cover-sky"></div>${grainLayer(c.global_style?.grain_opacity)}
<div class="cover-in">
  <div class="cover-top"><div class="logo-block">${logoSvg(22, C.brume)}<span class="logo-wm">SAMA</span></div><span class="cover-date">${esc(p.date)}</span></div>
  <div class="cover-main">
    <div class="cover-eyebrow">${esc(p.eyebrow)}</div>
    <div class="cover-title">${esc(p.title_line1)}<br>${esc(p.title_line2)} <em>${esc(p.title_line3)}</em></div>
    <div class="cover-subtitle">${esc(p.subtitle)}</div>
  </div>
  <div class="cover-foot">
    <div class="cover-client"><div class="cover-client-label">Préparé pour</div><div class="cover-client-name">${texte(pr.nom, 'Votre entreprise')}</div><div class="cover-client-meta">${esc(pr.meta)}</div></div>
    ${blocDemo(pr.demoUrl, pr.captureDemo)}
  </div>
</div></div>`;
}

/**
 * Le corps de la plaquette NOMINATIVE — deux feuilles, quatre demi-pages.
 *
 * MÊME PAGINATION QUE LE DÉPLIANT COLLECTIF, et c'est délibéré : la couverture
 * est remplacée, elle n'est pas ajoutée. `.sheet` est une grille `1fr 1fr` en
 * `overflow:hidden`, une cinquième demi-page disparaîtrait sans le moindre
 * signal — c'est la règle posée sur `corpsPlaquette`, et elle vaut ici mot pour
 * mot. La capture de la démo entre donc DANS la couverture, à la place exacte
 * qu'elle occupe sur l'audit.
 *
 * Les trois demi-pages du bas restent dépersonnalisées : ce qu'on livre, ce que
 * ça coûte, comment on démarre ne dépendent de personne. Elles passent par
 * `contenuImpersonnel` comme dans le dépliant — un `demo_url` n'a rien à faire
 * dans la grille tarifaire, quel que soit le document.
 */
export function corpsPlaquetteNominative(c: AuditContent, pr: ProspectPlaquette): string {
  const impersonnel = contenuImpersonnel(c);
  const f = FEUILLETS_PLAQUETTE;
  const m = mesuresVides();

  return `<div class="sheet no-mark">${cCouverturePlaquetteNominative(c, pr)}${cRecu(impersonnel, f, '01')}</div>
<div class="sheet">${cInvestissement(impersonnel)}${cEtapes(impersonnel, m, f, '02')}</div>`;
}
