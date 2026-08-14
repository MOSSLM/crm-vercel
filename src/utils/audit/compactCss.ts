import { C } from '@/components/audit/AuditShared';

/**
 * La feuille de style du document d'audit compact.
 *
 * Portée telle quelle depuis la maquette : trois feuilles A4 de 794 × 1123 px,
 * chacune coupée en deux demi-pages. Les cinq couleurs sont les tokens de marque
 * déjà en production (`AuditShared.tsx`), et les chiffres sont en `tabular-nums`
 * partout où ils s'alignent.
 *
 * DEUX POINTS QUI NE SONT PAS DES DÉTAILS.
 *
 * `overflow: hidden` sur `.sheet` fait disparaître SANS RIEN DIRE tout bloc qui
 * déborde. C'est le pire mode de défaillance d'un document qu'on envoie : on ne
 * s'en aperçoit que devant le prospect. Il est conservé pour le rendu final —
 * une page qui déborde serait pire — mais `AUDIT_DEBUG_DEBORDEMENT` le neutralise
 * en développement, et le rendu plafonne le nombre de blocs en amont.
 *
 * Les polices restent chargées depuis Google. Sur écran, elles arrivent ; c'est
 * dans une capture headless qu'elles manquent une fois sur trois. Le document
 * n'étant plus destiné à l'impression, la dette est assumée et localisée ici :
 * self-héberger les woff2 reste la correction, le jour où un rendu serveur
 * reviendra au programme.
 */

export const LIEN_POLICES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">';

/** Neutralise la troncature silencieuse, pour voir les débordements en recette. */
export const CSS_DEBUG_DEBORDEMENT = `.sheet{overflow:visible!important;outline:1px dashed rgba(220,38,38,.5)}`;

/**
 * Les couleurs viennent de `C`, jamais de cette feuille.
 *
 * Elles y étaient écrites en dur, recopiées de la maquette. La charte Sama en a
 * changé trois — nuit, azur et crème — et le document se serait mis à sortir
 * hors charte sans que rien ne le signale : le seul symptôme aurait été un bleu
 * légèrement différent du reste du CRM, sur un document qu'on regarde à l'écran
 * une fois avant de l'envoyer. Un test échoue désormais si un hexadécimal de
 * marque réapparaît ici.
 *
 * Les teintes transparentes dérivent du même endroit, par `tinte()` : une
 * `rgba()` recopiée porte le triplet de l'ancienne couleur et redevient un
 * point de divergence.
 */
const rgb = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/** `tinte(C.azur, .12)` rend une teinte transparente de l'azur courant. */
const tinte = (hex: string, alpha: number | string): string => `rgba(${rgb(hex)},${alpha})`;

const NUIT = rgb(C.nuit);
const AZUR = rgb(C.azur);
const BRUME = rgb(C.brume);

/**
 * LE CADRAGE DE L'APERÇU, qui n'est pas un détail esthétique.
 *
 * La capture occupe toute la largeur et se coupe en HAUT (`object-position:top`)
 * sur 136 px : on voit la barre de navigation et le début de la première
 * section, pas la section entière. C'est ce qu'un aperçu doit montrer — la
 * promesse d'un site à ouvrir, pas le site en réduction où plus rien n'est
 * lisible. Le squelette d'attente occupe la même hauteur, pour que l'absence de
 * capture ne redessine pas la page.
 */
export const CSS_COMPACT = String.raw`
:root{--nuit:${C.nuit};--azur:${C.azur};--brume:${C.brume};--creme:${C.creme};--blanc:${C.blanc};--page-w:794px;--page-h:1123px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#1a1a1e;font-family:'DM Sans',sans-serif;color:var(--nuit);-webkit-font-smoothing:antialiased}
a{color:var(--azur);text-decoration:none}a:hover{color:#2C63AE}
.sheet{width:var(--page-w);height:var(--page-h);margin:0 auto;background:var(--creme);position:relative;overflow:hidden;display:grid;grid-template-rows:1fr 1fr}
.sheet+.sheet{margin-top:24px}.sheet:first-of-type{margin-top:32px}.sheet:last-of-type{margin-bottom:32px}
.sheet::after{content:'';position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;background:var(--azur);transform:rotate(45deg);box-shadow:0 0 0 5px var(--creme);z-index:5}
.sheet.no-mark::after{display:none}
.half{padding:36px 54px 30px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.half+.half{border-top:1px dashed rgba(${NUIT},.18)}
/* ── Demi-page couverture ─────────────────────────────────────────── */
.half-cover{background:var(--nuit);padding:38px 54px 32px}
.cover-sky{position:absolute;inset:0;background:url("03c48928-62b2-4c0f-a34a-696eb6283602") 0 0/100% 100% no-repeat}
.grain{position:absolute;inset:0;pointer-events:none;z-index:3;background-image:url("86d242e9-a9e5-43dd-8c0c-55b1e9b16ea6");background-repeat:repeat;background-size:200px 200px}
.cover-in{position:relative;z-index:4;display:flex;flex-direction:column;height:100%}
.cover-top{display:flex;align-items:center;justify-content:space-between}
.logo-block{display:flex;align-items:center;gap:11px}
.logo-wm{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:17px;letter-spacing:.45em;color:var(--blanc);text-transform:uppercase;padding-left:.45em}
.cover-date{font-size:9px;letter-spacing:.2em;color:rgba(${BRUME},.45);font-weight:500;text-transform:uppercase}
.cover-main{flex:1;display:flex;flex-direction:column;justify-content:center;padding:14px 0}
.cover-eyebrow{font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:14px}
.cover-title{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:var(--f-cover,36px);line-height:1.08;color:var(--blanc);letter-spacing:-.01em}
.cover-title em{font-style:italic;color:var(--brume)}
.cover-subtitle{font-size:11.5px;line-height:1.75;color:rgba(${BRUME},.62);max-width:360px;font-weight:300;margin-top:16px}
.cover-foot{display:flex;flex-direction:column;gap:12px}
.cover-client{padding:16px 20px;border:1px solid rgba(${BRUME},.16);border-radius:4px;background:rgba(${AZUR},.07)}
.cover-client-label{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:rgba(${BRUME},.45);font-weight:500;margin-bottom:7px}
.cover-client-name{font-family:'Cormorant Garamond',serif;font-size:19px;font-weight:300;color:var(--blanc);letter-spacing:.03em}
.cover-client-meta{font-size:10px;color:rgba(${BRUME},.5);margin-top:3px}
.demo-cta{display:block;width:100%;padding:11px 12px 10px;border:1px solid rgba(${AZUR},.4);border-radius:6px;background:rgba(${AZUR},.12)}
.demo-cta-label{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--brume);font-weight:500;margin-bottom:7px}
.mockup{background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden;border:1px solid rgba(${BRUME},.12)}
.mockup-chrome{background:rgba(255,255,255,.08);padding:4px 6px;display:flex;align-items:center;gap:5px}
.mockup-dots{display:flex;gap:3px}
.mockup-dots i{width:4px;height:4px;border-radius:50%;display:block}
.mockup-url{flex:1;height:11px;background:rgba(255,255,255,.07);border-radius:2px;display:flex;align-items:center;gap:3px;padding-left:4px;font-size:6px;color:rgba(${BRUME},.5);overflow:hidden;white-space:nowrap}
.mockup-url img{width:7px;height:7px}
.mockup-screen{position:relative;height:136px;background:rgba(${NUIT},.6);overflow:hidden}
.mockup-screen img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.mockup-skeleton{position:absolute;inset:0;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.sk-hero{height:12px;width:68%;background:rgba(${AZUR},.2);border-radius:2px}
.sk-line{height:4px;background:rgba(255,255,255,.06);border-radius:2px}
.sk-btn{height:15px;width:48px;background:rgba(${AZUR},.32);border-radius:3px;margin-top:3px}
.demo-cta-link{margin-top:8px;font-size:10px;color:var(--brume);font-weight:500;display:flex;align-items:center;justify-content:space-between}
.demo-cta-link b{font-weight:500;color:#8FC0FF}
/* ── En-tête de demi-page ─────────────────────────────────────────── */
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.panel-eyebrow{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:var(--azur);font-weight:500}
.panel-mark{display:flex;align-items:center;gap:7px;font-size:8px;letter-spacing:.28em;text-transform:uppercase;color:rgba(${NUIT},.28);font-weight:500}
.panel-title{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:var(--f-title,30px);line-height:1.1;color:var(--nuit);margin-top:11px}
.panel-title em{font-style:italic;color:var(--azur)}
.panel-intro{font-size:var(--f-intro,11.5px);line-height:1.75;color:rgba(${NUIT},.6);max-width:530px;margin-top:9px;font-weight:300}
.panel-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:18px 0 4px}
/* ── 01 Contexte ──────────────────────────────────────────────────── */
.problem-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.problem-card{padding:13px 15px;border:1px solid rgba(${AZUR},.16);border-radius:4px;background:rgba(${NUIT},.022);display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start}
.alert-icon{width:22px;height:22px;background:rgba(${AZUR},.1);border:1px solid rgba(${AZUR},.2);border-radius:4px;display:flex;align-items:center;justify-content:center}
.problem-title{font-size:11px;font-weight:500;color:var(--nuit);line-height:1.35}
.problem-desc{font-size:9.5px;line-height:1.6;color:rgba(${NUIT},.55);margin-top:5px}
.quote-strip{padding:15px 20px;border-left:2px solid var(--azur);background:rgba(${AZUR},.045);border-radius:0 4px 4px 0}
.quote-strip p{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:300;font-style:italic;line-height:1.5;color:var(--nuit)}
.quote-src{font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:rgba(${NUIT},.38);font-weight:500;margin-top:8px}
/* ── 02 Solution ──────────────────────────────────────────────────── */
.solution-list{display:flex;flex-direction:column}
.solution-item{display:grid;grid-template-columns:26px 1fr auto;align-items:start;gap:14px;padding:11px 0;border-bottom:1px solid rgba(${NUIT},.07)}
.solution-item:last-child{border-bottom:none}
.solution-num{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:rgba(${AZUR},.28);line-height:1}
.solution-name{font-size:12px;font-weight:500;color:var(--nuit);margin-bottom:3px}
.solution-desc{font-size:10px;line-height:1.6;color:rgba(${NUIT},.55)}
.solution-tag{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--azur);background:rgba(${AZUR},.08);padding:4px 7px;border-radius:2px;white-space:nowrap;font-weight:500}
/* ── 03 Ce que vous recevez ───────────────────────────────────────── */
.recu-table{background:#fff;border:1px solid rgba(${AZUR},.16);border-radius:5px;overflow:hidden}
.recu-th{display:grid;grid-template-columns:118px 1fr 118px;gap:22px;padding:9px 20px;background:rgba(${AZUR},.055);border-bottom:1px solid rgba(${AZUR},.16);font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500}
.recu-th>div:last-child{text-align:center}
.recu-row{display:grid;grid-template-columns:118px 1fr 118px;gap:22px;align-items:center;padding:19px 20px;border-bottom:1px solid rgba(${AZUR},.11)}
.recu-row:last-child{border-bottom:none}
.recu-label{font-family:'Cormorant Garamond',serif;font-size:23px;font-weight:300;font-style:italic;color:var(--nuit);line-height:1.1}
.recu-text{font-size:11px;line-height:1.75;color:rgba(${NUIT},.62);font-weight:300;text-wrap:pretty}
.recu-fix{font-size:8.5px;line-height:1.55;letter-spacing:.03em;color:var(--azur);background:rgba(${AZUR},.07);border:1px solid rgba(${AZUR},.17);border-radius:2px;padding:6px 10px;text-align:center;justify-self:center;width:fit-content}
/* ── 04 Investissement ────────────────────────────────────────────── */
.invest-subtitle{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;font-style:italic;color:var(--nuit);margin:10px 0 10px}
.invest-block{background:var(--nuit);border-radius:6px;padding:22px 26px;position:relative;overflow:hidden}
.invest-gradient{position:absolute;inset:0;background:url("be8c6080-e086-434a-b9a4-1a964b9483f5") 0 0/100% 100% no-repeat;opacity:.65}
.invest-inner{position:relative;z-index:4}
.invest-row{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:22px;padding:10px 0}
/* Le filet entre deux lignes de prix. Il vivait en style inline, dans une chaîne
   à guillemets simples où l'interpolation ne s'évalue pas : le document sortait
   avec un « rgba(dollar-accolade…) » littéral, donc sans aucun filet. */
.invest-row+.invest-row{border-top:1px solid rgba(${BRUME},.1)}
.invest-label{font-size:11px;color:rgba(${BRUME},.75)}
.invest-sublabel{font-size:9px;color:rgba(${BRUME},.38);margin-top:3px;line-height:1.5;max-width:330px}
.invest-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:19px;color:var(--blanc);white-space:nowrap}
.invest-row-total{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:22px;border-top:1px solid rgba(${BRUME},.2);margin-top:6px;padding-top:14px}
.invest-total-label{font-size:12px;font-weight:500;color:var(--blanc)}
.invest-total-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:30px;color:var(--blanc)}
.invest-note{margin-top:14px;font-size:8.5px;color:rgba(${BRUME},.42);line-height:1.65;border-top:1px solid rgba(${BRUME},.09);padding-top:11px}
.secondary-card{margin-top:11px;background:#fff;border:1px solid rgba(${AZUR},.18);border-radius:6px;padding:15px 20px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}
.secondary-sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:5px}
.secondary-title{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;font-style:italic;color:var(--nuit)}
.secondary-desc{font-size:9.5px;color:rgba(${NUIT},.55);margin-top:4px;line-height:1.55;max-width:340px}
.secondary-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:24px;color:var(--nuit);white-space:nowrap}
.secondary-from{font-size:9px;color:rgba(${NUIT},.45);text-align:right}
.opt-wrap{margin-top:12px}
.opt-label{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:8px}
.opt-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.opt-card{background:#fff;border:1px solid rgba(${AZUR},.16);border-radius:5px;padding:14px 16px;display:flex;flex-direction:column}
.opt-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;font-style:italic;color:var(--nuit);line-height:1.2}
.opt-desc{font-size:10px;line-height:1.65;color:rgba(${NUIT},.55);margin-top:7px;font-weight:300}
.opt-note{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--azur);font-weight:500}
.opt-foot{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:auto;padding-top:9px;border-top:1px solid rgba(${AZUR},.14)}
.opt-amount{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:300;color:var(--nuit);white-space:nowrap}
.opt-amount i{font-family:'DM Sans',sans-serif;font-style:normal;font-size:9px;color:rgba(${NUIT},.45)}
.addl-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
.addl-card{padding:11px 13px;background:#fff;border:1px solid rgba(${AZUR},.12);border-radius:4px;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.addl-label{font-size:10.5px;font-weight:500;color:var(--nuit)}
.addl-amount{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:300;color:var(--nuit);white-space:nowrap}
/* ── 05 Prochaines étapes ─────────────────────────────────────────── */
.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
.step-card{padding:14px 16px;border:1px solid rgba(${NUIT},.09);border-radius:4px}
.step-num{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:300;color:rgba(${AZUR},.18);line-height:1;margin-bottom:6px}
.step-title{font-size:11px;font-weight:500;color:var(--nuit);margin-bottom:4px}
.step-desc{font-size:9.5px;color:rgba(${NUIT},.5);line-height:1.55}
.cta-block{background:rgba(${AZUR},.055);border:1px solid rgba(${AZUR},.16);border-radius:4px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.cta-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;color:var(--nuit);margin-bottom:3px}
.cta-sub{font-size:10px;color:rgba(${NUIT},.5)}
.cta-contact{display:flex;align-items:stretch;gap:9px;flex-shrink:0}
.cta-btn{display:flex;flex-direction:column;justify-content:center;gap:3px;padding:11px 18px;border-radius:3px;white-space:nowrap;text-decoration:none}
.cta-btn span{font-size:8px;letter-spacing:.2em;text-transform:uppercase;font-weight:500}
.cta-btn b{font-size:14px;font-weight:500;letter-spacing:.01em}
.cta-btn-tel{background:var(--azur);color:#fff}
.cta-btn-tel span{color:rgba(255,255,255,.72)}
.cta-btn-mail{background:#fff;border:1px solid rgba(${AZUR},.35);color:var(--azur)}
.cta-btn-mail span{color:rgba(${NUIT},.4)}
.cta-btn-mail b{font-size:12.5px}
.cta-contact-web{font-size:9px;color:rgba(${NUIT},.4);margin-top:5px}
.demo-push{display:flex;align-items:center;gap:16px;padding:11px 16px;border:1px solid rgba(${AZUR},.28);border-radius:4px;background:linear-gradient(90deg,rgba(${AZUR},.09),rgba(${AZUR},.02))}
.demo-push-txt{flex:1;min-width:0}
.demo-push-shot{width:124px;height:74px;flex-shrink:0;border:1px solid rgba(${AZUR},.25);border-radius:3px;overflow:hidden;background:rgba(${AZUR},.06);position:relative}
.demo-push-shot image-slot{position:absolute;inset:0;font-size:8px;color:rgba(${NUIT},.4)}
.demo-push-label{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:4px}
.demo-push-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;font-style:italic;color:var(--nuit)}
.demo-push-url{font-size:9.5px;color:rgba(${NUIT},.45);margin-top:3px}
.demo-push-btn{font-size:10px;font-weight:500;letter-spacing:.06em;color:#fff;background:var(--azur);padding:9px 14px;border-radius:3px;white-space:nowrap}
.sign{display:flex;align-items:center;gap:13px;padding-top:14px;border-top:1px solid rgba(${NUIT},.07)}
.sign-text{font-size:9px;color:rgba(${NUIT},.35);line-height:1.65}
/* ── Pied de page A4 ──────────────────────────────────────────────── */
.sheet-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:auto;padding-top:11px;border-top:1px solid rgba(${NUIT},.08)}
.sheet-foot span{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:rgba(${NUIT},.3)}
.sheet-foot b{font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:0;text-transform:none;color:rgba(${NUIT},.28);font-weight:400}

/* ── L'impression ─────────────────────────────────────────────────────
   TROIS FEUILLES, TROIS PAGES. Rien d'autre ne doit sortir de l'imprimante.

   Ce bloc a passé sa vie neutralisé par une faute de frappe : la ligne de
   commentaire qui le précédait avait perdu son ouverture, et le parseur CSS, qui
   avale alors tout jusqu'à la prochaine accolade, emportait la règle @page avec
   elle. Symptômes, tous les trois signalés par l'opérateur et tous les trois
   retrouvés dans le PDF : format US Letter au lieu de l'A4, marges blanches à
   gauche et à droite (celles que le navigateur applique faute de consigne), et
   une page sur deux quasi vide portant la fin de la précédente. Une règle CSS
   morte ne se plaint pas : d'où le test qui échoue désormais si un commentaire
   se referme sans avoir été ouvert, et celui qui vérifie que la feuille déclare
   toujours un A4 sans marge.

   LA HAUTEUR EST SOUS L'A4, ET C'EST VOLONTAIRE. Une feuille de 297 mm exactement
   dans une page de 297 mm déborde d'un sous-pixel dès que le navigateur arrondit,
   et ce sous-pixel devient la page blanche suivante — l'ancien 298 mm tentait de
   corriger cela par le haut, ce qui ne pouvait que l'aggraver. 296,6 mm laisse
   1,5 px de jeu ; le dessin perd 0,13 % de sa hauteur, soit rien de visible, et
   la page blanche ne peut plus se produire.

   Les fonds, aplats et lueurs sont conservés : sans print-color-adjust, le
   navigateur retire les aplats sombres et le document sort en blanc. */
@page{size:A4;margin:0}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important;width:210mm}
  .sheet,.sheet+.sheet,.sheet:first-of-type,.sheet:last-of-type{margin:0!important;box-shadow:none!important}
  .sheet{width:210mm;height:296.6mm;break-inside:avoid;page-break-inside:avoid}
  .sheet+.sheet{break-before:page;page-break-before:always}
  .sheet:last-of-type{break-after:avoid;page-break-after:avoid}
}
html,body,*,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* Ajouts au compact A4 : couverture à grand aperçu, demi-page « relevé » (note + six axes
   en blanc cassé), et les constats → réponses en cartes. Chargé APRÈS audit-compact.css. */
:root{--ivoire:#FCFAF6}
/* ── Couverture à grand aperçu ─────────────────────────────────────── */
.cover-big{padding:34px 54px 28px}
.cover-big .cover-main{flex:1;padding:4px 0;justify-content:center}
.cover-big .cover-title{font-size:33px}
.cover-big .cover-subtitle{font-size:11px;line-height:1.7;max-width:430px;margin-top:12px}
.cover-big .cover-eyebrow{margin-bottom:11px}
.cover-row{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;margin-bottom:12px}
.cover-big .cover-client{padding:13px 18px}
.shot-cta{display:block;text-align:right}
.shot-cta-label{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:6px}
.shot-cta-url{font-size:11px;color:var(--brume);font-weight:500;display:flex;align-items:center;gap:8px;justify-content:flex-end}
.shot-cta-url b{font-weight:500;color:#8FC0FF}
.shot-frame{border:1px solid rgba(${BRUME},.22);border-radius:5px 5px 0 0;overflow:hidden;background:rgba(255,255,255,.05);border-bottom:none}
.shot-frame .mockup-chrome{padding:6px 9px}
.shot-frame .mockup-url{height:14px;font-size:7.5px;padding-left:6px}
.shot-screen{position:relative;height:178px;background:rgba(${NUIT},.5)}
.shot-screen image-slot{position:absolute;inset:0;color:rgba(${BRUME},.6)}
/* ── 01 · Le relevé ────────────────────────────────────────────────── */
.half-score .panel-title{margin-top:6px}
.half-score .panel-intro{max-width:none;margin-top:7px}
.half-score .panel-body{padding:12px 0 0;gap:10px}
.half-score .sheet-foot{padding-top:9px}
.score-hero{display:grid;grid-template-columns:176px 1fr;background:var(--ivoire);border:1px solid rgba(${NUIT},.11);border-radius:5px;overflow:hidden}
.score-num{padding:11px 16px;border-right:1px solid rgba(${NUIT},.09);background:rgba(${NUIT},.018);display:flex;flex-direction:column;justify-content:center}
.score-lbl{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:rgba(${NUIT},.42);font-weight:500}
.score-val{display:flex;align-items:baseline;gap:6px;margin-top:5px}
.score-val b{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:44px;line-height:.86;color:var(--nuit);letter-spacing:-.01em}
.score-val s{text-decoration:none;font-size:11.5px;color:rgba(${NUIT},.4)}
.score-calc{margin-top:6px;font-size:8px;line-height:1.5;color:rgba(${NUIT},.55)}
.score-calc b{font-weight:600;color:rgba(${NUIT},.8)}
.score-calc span{display:block;margin-top:2px;font-size:7.5px;color:rgba(${NUIT},.45)}
.score-sub{font-size:8.5px;line-height:1.5;color:rgba(${NUIT},.38);margin-top:6px}
.score-rail{padding:9px 18px 8px}
.rail{position:relative;display:flex;gap:2px;height:17px}
.rail i{flex:1;display:block}
.mk{position:absolute;top:-3px;bottom:-3px;width:1.5px;background:currentColor}
.mk::before{content:'';position:absolute;left:50%;top:-6px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:currentColor}
.mk-p{color:var(--nuit)}.mk-m{color:rgba(${NUIT},.4)}.mk-s{color:var(--azur)}
.rail-axis{display:flex;justify-content:space-between;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(${NUIT},.3);font-weight:500;margin-top:7px}
.rail-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:7px;padding-top:9px;border-top:1px solid rgba(${NUIT},.08)}
.lg{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:start}
.lg i{width:6px;height:6px;border-radius:50%;background:currentColor;margin-top:3px}
.lg-p{color:var(--nuit)}.lg-m{color:rgba(${NUIT},.4)}.lg-s{color:var(--azur)}
.lg b{font-size:9.5px;font-weight:500;color:var(--nuit);display:block}
.lg b em{font-style:normal;color:currentColor}
.lg small{font-size:8px;color:rgba(${NUIT},.4);display:block;margin-top:2px;line-height:1.4}
.ax-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
/* Quatre axes dans une grille de trois laissent un orphelin sur une ligne vide.
   Deux colonnes les rangent en carré ; trois, cinq et six retombent sur trois. */
.ax-grid.ax-n4{grid-template-columns:repeat(2,1fr)}
.ax-card{background:var(--ivoire);border:1px solid rgba(${NUIT},.1);border-radius:4px;padding:8px 12px}
.ax-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.ax-nm{font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:rgba(${NUIT},.45);font-weight:500}
/* La provenance de la mesure, en pastille sur sa propre ligne.
   Elle était rendue en <u> collé au nom de l'axe : « RAPIDITÉMESURÉ PAR GOOGLE »
   souligné, qui passait à la ligne et déformait la carte. Ce que cette mention
   doit dire — c'est Google qui l'a relevé, pas nous — mérite d'être lisible. */
.ax-src{display:block;margin-top:3px;font-size:7px;letter-spacing:.1em;color:var(--azur);font-weight:500}
/* Le NIVEAU remplace la note par axe. Un seul nombre vit sur cette page, et
   c'est la note globale : six chiffres sur 100 autour d'un septième invitaient
   à une addition qui ne retombait pas dessus.
   Les quatre teintes sont fermées et lisibles à l'impression comme à l'écran ;
   elles ne réutilisent pas l'azur de marque, qui signale l'action et non l'état. */
.ax-niv{font-size:8.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  padding:3px 9px;border-radius:20px;white-space:nowrap;border:1px solid}
.niv-bon{background:#E8F3EC;color:#1F6B45;border-color:#BBDCC8}
.niv-correct{background:#FBF3DC;color:#7A5B10;border-color:#EBDBAE}
.niv-mediocre{background:#FBEBDD;color:#8A4A15;border-color:#EDCBAB}
.niv-mauvais{background:#FAE6E2;color:#8C2E1C;border-color:#EDC0B7}
.ax-v{font-size:10.5px;font-weight:500;color:var(--nuit);line-height:1.35;margin-top:7px}
.ax-e{font-size:8.8px;line-height:1.45;color:rgba(${NUIT},.5);margin-top:4px}
.verdict-strip{padding:9px 17px;border-left:2px solid var(--azur);background:rgba(${AZUR},.045);border-radius:0 4px 4px 0}
.verdict-strip p{font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:300;font-style:italic;line-height:1.4;color:var(--nuit)}
.verdict-strip span{display:block;font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:rgba(${NUIT},.38);font-weight:500;margin-top:6px}
/* ── 02 · Constat → réponse ────────────────────────────────────────── */
.ba-heads{display:grid;grid-template-columns:1fr 1fr;gap:0}
.ba-h{font-size:8px;letter-spacing:.18em;text-transform:uppercase;font-weight:500;color:rgba(${NUIT},.35);padding-left:18px}
.ba-h-a{color:var(--azur);padding-left:20px}
.ba-stack{display:flex;flex-direction:column;gap:9px}
.ba-row{position:relative;display:grid;grid-template-columns:1fr 1fr;background:#fff;border:1px solid rgba(${NUIT},.12);border-radius:4px;overflow:hidden}
.ba-side{padding:14px 18px 15px;display:flex;flex-direction:column;justify-content:center;min-height:66px}
.ba-after{background:rgba(${AZUR},.055);border-left:1px dashed rgba(${AZUR},.45);padding-left:20px}
.ba-v{font-family:'Cormorant Garamond',serif;font-size:25px;font-weight:300;line-height:1.06;color:var(--nuit)}
.ba-after .ba-v{color:var(--azur)}
.ba-d{font-size:9.5px;line-height:1.5;color:rgba(${NUIT},.48);margin-top:6px;max-width:290px}
.ba-arrow{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:19px;height:19px;border-radius:50%;background:#fff;border:1px solid rgba(${AZUR},.35);color:var(--azur);font-size:9px;line-height:17px;text-align:center}
.plus-strip{display:grid;grid-template-columns:auto 1fr auto;gap:15px;align-items:center;padding:11px 17px;border:1px dashed rgba(${NUIT},.2);border-radius:4px;background:rgba(${NUIT},.016)}
.plus-n{font-family:'Cormorant Garamond',serif;font-size:25px;font-weight:300;line-height:1;color:var(--azur)}
.plus-t{font-size:10.5px;font-weight:500;color:var(--nuit)}
.plus-l{font-size:9px;color:rgba(${NUIT},.45);margin-top:4px;line-height:1.55}
.plus-c{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:rgba(${NUIT},.33);font-weight:500;text-align:right;white-space:nowrap}
/* ── Densité : ce qui fait tenir chaque demi-page dans sa boîte ──────
   La propriété overflow:hidden coupe en silence — la feuille le dit plus haut —
   et trois demi-pages sur six débordaient : couverture −7 px, relevé −86,
   constats −27. Mesuré, pas supposé : scripts/audit/mesurer-debordement.ts rejoue le pire
   cas réaliste (six axes, trois lignes avant/après) dans un vrai moteur et
   compare, demi-page par demi-page, la hauteur du contenu à celle de sa boîte.
   Les valeurs ci-dessous sont le résultat de cette boucle. Les toucher sans
   relancer la mesure, c'est réintroduire une coupe qu'on ne verra que sur le
   PDF, devant le prospect. */
.half-score .panel-body{gap:8px;padding:8px 0 0}
.score-num{padding:9px 14px}
.score-val b{font-size:38px}
.score-rail{padding:7px 14px 6px}
.rail-legend{margin-top:5px;padding-top:6px;gap:10px}
.lg small{line-height:1.3;margin-top:1px}
.ax-grid{gap:8px}
.ax-card{padding:7px 10px}
.verdict-strip{padding:7px 14px}
.verdict-strip p{font-size:13px;line-height:1.35}
.verdict-strip span{margin-top:4px}
.ba-stack{gap:7px}
.ba-side{min-height:58px;padding:11px 16px 12px}
.cover-big{padding:30px 54px 24px}
.shot-screen{height:168px}
.half-cover{padding:32px 54px 26px}
.mockup-screen{height:122px}
.half-score .panel-title{font-size:26px;margin-top:8px}
.half-score .panel-intro{font-size:10.5px;line-height:1.6;margin-top:6px}
.score-val b{font-size:34px}
.rail{height:14px}
.ba-side{min-height:52px}
.ax-grid.ax-n7{grid-template-columns:repeat(4,1fr)}
.ax-grid.ax-n7 .ax-nm{font-size:7.5px}
.ax-grid.ax-n7 .ax-niv{font-size:8px;padding:2px 7px}
.recu-row{padding:14px 20px}
.recu-label{font-size:21px}
.half-score .sheet-foot{padding-top:7px}
.lg small{font-size:7.5px}
.ax-v{font-size:10px;margin-top:6px}
.verdict-strip p{font-size:12.5px}
.plus-strip{padding:9px 15px}
.ba-d{margin-top:5px}`;

/**
 * Ce que l'APERÇU ajoute au document, et que l'export n'emporte jamais.
 *
 * Le survol et le liseré du champ sélectionné n'existent que dans l'éditeur.
 * Ils passent par une classe plutôt que par `element.style.outline` : écrire
 * dans le style inline d'un nœud qu'on vient de recréer par `innerHTML` marche
 * une fois sur deux, et écrase silencieusement un style que le rendu aurait posé.
 */
export const CSS_APERCU = `
[data-field]{cursor:pointer;border-radius:2px}
[data-field]:hover{outline:2px solid ${tinte(C.azur, 0.45)};outline-offset:2px}
[data-field].champ-actif{outline:2px solid var(--azur);outline-offset:2px}
`;

/**
 * Le document complet, prêt à être écrit dans une fenêtre ou une iframe.
 *
 * Un seul endroit construit l'enveloppe — `<head>`, polices, feuille de style —
 * pour que l'aperçu de l'éditeur et le fichier exporté ne puissent pas diverger.
 * `corps` est injecté tel quel : il vient de nos fonctions de rendu, qui
 * échappent tout ce qui vient du contenu ou de la base.
 */
export function documentAudit(
  titre: string,
  corps: string,
  opts: { apercu?: boolean; debordement?: boolean; impressionAuto?: boolean } = {},
): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=794">
<title>${titre.replace(/[<>&"]/g, '')}</title>
${LIEN_POLICES}
<style>${CSS_COMPACT}${opts.debordement ? CSS_DEBUG_DEBORDEMENT : ''}${opts.apercu ? CSS_APERCU : ''}</style>
</head>
<body>
<div id="doc">${corps}</div>
${opts.impressionAuto ? SCRIPT_IMPRESSION : ''}
</body>
</html>`;
}

/**
 * L'impression n'est déclenchée qu'une fois les polices arrivées.
 *
 * Le déclenchement se faisait sur un `setTimeout` d'une seconde. Une seconde
 * suffit d'habitude et pas toujours : quand elle ne suffit pas, le PDF part en
 * Times New Roman, ce que personne ne voit avant le prospect. `document.fonts.ready`
 * attend ce qu'il faut attendre, et le délai de garde évite qu'une police
 * injoignable — Google est un tiers — laisse la fenêtre ouverte sans rien faire.
 */
const SCRIPT_IMPRESSION = `<script>
(function(){
  var fait=false;
  function go(){ if(fait) return; fait=true; window.focus(); window.print(); }
  var attente = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  attente.then(function(){ setTimeout(go, 120); });
  setTimeout(go, 4000);
})();
</script>`;
