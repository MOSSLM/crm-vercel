import type { AuditContent } from '@/types';
import type { MesuresAudit } from '@/lib/audit/mesures';
import { LIBELLE_DEMO, LIBELLE_NIVEAU, detailNote, niveauDeNote, sousTitreNote } from '@/lib/audit/mesures';
import { esc, logoSvg, makeGrainSvgUrl, getServices, calcTotal, fmtEur } from './htmlShared';
import { C } from '@/components/audit/AuditShared';

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

function sheetFoot(nom: string, n: string): string {
  return `<div class="sheet-foot"><span>Confidentiel · préparé pour ${esc(nom)}</span><b>${n} / 3</b></div>`;
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
 * UN SEUL NOMBRE SUR LA PAGE, ET C'EST LA NOTE GLOBALE. Les axes portaient
 * chacun leur note sur 100 : six chiffres autour d'un septième, qui invitaient
 * à une addition ne retombant jamais sur le grand nombre. Le prospect fait cette
 * addition — c'est même la première chose qu'il fait — et à ce moment-là il
 * cesse de croire le relevé entier.
 *
 * Les axes disent donc désormais OÙ ça coince, pas de combien : un niveau coloré
 * et la mesure qui le décide. Et la règle est structurelle — soit tous les axes
 * portent un chiffre, soit aucun. Le retirer des seuls axes flatteurs ferait du
 * document un argumentaire, ce qui se voit à la première question posée.
 *
 * La barre de dix segments disparaît avec : elle ne faisait que redessiner le
 * chiffre qu'on vient d'enlever, et elle coûtait seize pixels par carte sur une
 * demi-page qui débordait déjà de quatre-vingt-six.
 *
 * La mention « mesuré par Google » reste : c'est la seule chose qui distingue un
 * relevé opposable d'une opinion d'agence.
 */
function cartesAxes(m: MesuresAudit): string {
  const cartes = m.axes
    .map((a) => {
      const niveau = niveauDeNote(a.note);
      return `<div class="ax-card">
<div class="ax-top"><div class="ax-nm">${esc(a.nom)}${a.mesureGoogle ? '<span class="ax-src">mesuré par Google</span>' : ''}</div><span class="ax-niv niv-${niveau}">${esc(LIBELLE_NIVEAU[niveau])}</span></div>
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
${sheetFoot(c.page1.client_name || 'Entreprise cliente', '01')}</div>`;
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

function cRecu(c: AuditContent): string {
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
${sheetFoot(c.page1.client_name || 'Entreprise cliente', '02')}</div>`;
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

  return `<div class="half" id="audit-h5" data-screen-label="A4-3 · 04 Investissement">
<div class="panel-head">${z('div', 'panel-eyebrow', { field: 'page5.section_label' })}${esc(p.section_label ?? '')}</div></div>
<div class="panel-body" style="justify-content:flex-start;padding-top:6px">
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

function cEtapes(c: AuditContent, m: MesuresAudit): string {
  const p = c.page6;
  const demo = c.page1.demo_url;

  return `<div class="half" id="audit-h6" data-screen-label="A4-3 · 05 Prochaines étapes">
<div class="panel-head">${z('div', 'panel-eyebrow', { field: 'page6.section_label' })}${esc(p.section_label ?? '')}</div></div>
${z('div', 'panel-title', { field: 'page6.section_heading' })}${esc(p.section_title ?? '')} ${esc(p.section_title_line2 ?? '')} <em>${esc(p.section_title_em ?? '')}</em></div>
<div class="panel-body" style="justify-content:flex-start;padding-top:14px;gap:11px">
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
  <div class="sign">${logoSvg(18, C.azur)}<div class="sign-text">SAMA · Agence digitale indépendante<br>Document confidentiel préparé exclusivement pour ${texte(c.page1.client_name, 'Entreprise cliente')}</div></div>
</div>
${sheetFoot(c.page1.client_name || 'Entreprise cliente', '03')}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Le corps du document — trois feuilles, six demi-pages. */
export function corpsCompact(c: AuditContent, m: MesuresAudit): string {
  return `<div class="sheet no-mark">${cCouverture(c, m)}${cReleve(c, m)}</div>
<div class="sheet">${cConstats(c, m)}${cRecu(c)}</div>
<div class="sheet">${cInvestissement(c)}${cEtapes(c, m)}</div>`;
}
