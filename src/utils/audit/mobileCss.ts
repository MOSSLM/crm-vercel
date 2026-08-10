/**
 * Feuille de style du rendu mobile de l'audit.
 *
 * Portage direct de `07 Audit/audit-mobile.css` du kit d'identité
 * `Sama_Visual_identity2`. Conservée telle quelle — mêmes noms de classes,
 * mêmes valeurs — pour deux raisons :
 *
 *   1. le kit reste la référence visuelle, et une divergence silencieuse entre
 *      la maquette et la production est exactement ce qu'on veut éviter ;
 *   2. le PDF A4 (`src/utils/audit/htmlPage1..6.ts`) et ce rendu web partagent
 *      la même palette : nuit #0A1B33, azur #2F7AE0, brume #B5D0F0, crème
 *      #F7FAFD — cf. `C` dans `AuditShared.tsx`.
 *
 * DEUX ÉCARTS ASSUMÉS avec le kit, tous deux dictés par le fait que ceci est
 * une vraie page web ouverte sur un vrai téléphone, et non une maquette :
 *
 *   - la largeur d'écran est `100%` plafonnée à 430 px au lieu d'un 390 px
 *     figé, et la hauteur est `min-height` plutôt que `height` : sur un
 *     téléphone réel, un écran figé à 844 px coupe le contenu dès que la police
 *     système est agrandie ;
 *   - les écrans s'enchaînent sans marge sur mobile (la maquette les sépare de
 *     18 px sur fond gris, ce qui n'a de sens que sur un plan de travail).
 */

export const AUDIT_MOBILE_CSS = `
:root{--nuit:#0A1B33;--azur:#2F7AE0;--brume:#B5D0F0;--creme:#F7FAFD;--blanc:#E8F3FF;--w:430px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--creme);font-family:'DM Sans',system-ui,-apple-system,sans-serif;color:var(--nuit);-webkit-font-smoothing:antialiased;text-wrap:pretty}
a{color:var(--azur);text-decoration:none}
.doc{max-width:var(--w);margin:0 auto}
.screen{width:100%;min-height:100svh;background:var(--creme);position:relative;overflow:hidden;display:flex}
.screen.auto{min-height:0}
.screen.dark{background:var(--nuit);color:var(--blanc)}
.m-sky{position:absolute;inset:0;background:radial-gradient(ellipse 300px 260px at 88% 10%,rgba(47,122,224,.4) 0%,transparent 62%),radial-gradient(ellipse 320px 300px at 6% 96%,rgba(47,122,224,.22) 0%,transparent 60%)}
.grain{position:absolute;inset:0;pointer-events:none;z-index:3;background-repeat:repeat;background-size:200px 200px}
.m-in{position:relative;z-index:4;width:100%;display:flex;flex-direction:column;padding:30px 26px 18px}
/* En-tête / typo */
.m-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.m-brand{display:flex;align-items:center;gap:9px}
.m-brand span{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:14px;letter-spacing:.42em;text-transform:uppercase;color:var(--blanc);padding-left:.42em}
.m-brand.ink span{color:var(--nuit)}
.m-date{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(181,208,240,.45);font-weight:500}
.m-eyebrow{font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--azur);font-weight:500}
.m-title{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:33px;line-height:1.1;letter-spacing:-.01em;margin-top:13px}
.m-title em{font-style:italic;color:var(--azur)}
.dark .m-title{color:var(--blanc)}.dark .m-title em{color:var(--brume)}
.m-intro{font-size:14px;line-height:1.72;color:rgba(10,27,51,.6);margin-top:12px;font-weight:300}
.dark .m-intro{color:rgba(181,208,240,.62)}
.m-body{flex:1;display:flex;flex-direction:column;gap:14px;padding:22px 0 0}
.m-count{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(10,27,51,.35);font-weight:500;margin-top:16px}
.m-client{border-top:1px solid rgba(181,208,240,.16);padding-top:18px}
.m-client-label{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(181,208,240,.45);font-weight:500}
.m-client-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:300;color:var(--blanc);margin-top:6px}
.m-client-meta{font-size:12px;color:rgba(181,208,240,.5);margin-top:4px}
.m-scroll{margin-top:auto;padding-top:24px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(181,208,240,.4);display:flex;align-items:center;gap:8px}
.m-scroll b{font-size:14px}
/* Pied d'écran */
.m-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding-top:13px;border-top:1px solid rgba(10,27,51,.08)}
.m-foot span{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(10,27,51,.32);font-weight:500}
.m-foot b{font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;color:rgba(10,27,51,.3);font-weight:400}
.dark .m-foot{border-color:rgba(181,208,240,.14)}
.dark .m-foot span,.dark .m-foot b{color:rgba(181,208,240,.4)}
/* Cartes */
.m-card{padding:18px 20px;border:1px solid rgba(47,122,224,.16);border-radius:6px;background:rgba(10,27,51,.022)}
.m-card-head{display:flex;align-items:flex-start;gap:11px}
.alert-icon{width:26px;height:26px;background:rgba(47,122,224,.1);border:1px solid rgba(47,122,224,.2);border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.m-card-title{font-size:14.5px;font-weight:500;line-height:1.4;color:var(--nuit)}
.m-card-desc{font-size:13px;line-height:1.7;color:rgba(10,27,51,.55);margin-top:9px}
.m-sol{display:flex;flex-direction:column;gap:0;padding:18px 20px;border:1px solid rgba(47,122,224,.16);border-radius:6px;background:#fff}
.m-sol-top{display:flex;align-items:baseline;gap:12px}
.m-sol-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:300;color:rgba(47,122,224,.3);line-height:1}
.m-sol-name{font-size:15px;font-weight:500;color:var(--nuit)}
.m-tag{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--azur);background:rgba(47,122,224,.08);padding:5px 9px;border-radius:3px;align-self:flex-start;margin-top:11px;font-weight:500}
.m-liv{padding:18px 20px;border-radius:6px;background:#fff;border:1px solid rgba(47,122,224,.13)}
.m-liv-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}
.m-liv-title{font-size:14px;font-weight:500;color:var(--nuit)}
.check-badge{width:20px;height:20px;border-radius:50%;background:rgba(47,122,224,.12);border:1px solid rgba(47,122,224,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.m-liv-items{display:flex;flex-direction:column;gap:6px}
.m-liv-item{font-size:12.5px;color:rgba(10,27,51,.55);line-height:1.55;padding-left:11px;position:relative}
.m-liv-item::before{content:'—';position:absolute;left:0;top:0;color:rgba(47,122,224,.45);font-size:9px}
/* Citation */
.m-quote{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-style:italic;font-size:29px;line-height:1.4;color:var(--blanc)}
.m-quote-src{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(181,208,240,.42);font-weight:500;margin-top:20px;line-height:1.6}
/* Mockup navigateur */
.m-shot{border-radius:8px;overflow:hidden;border:1px solid rgba(47,122,224,.22);background:var(--nuit);box-shadow:0 18px 40px -24px rgba(10,27,51,.5)}
.mockup-chrome{background:rgba(10,27,51,.9);padding:7px 9px;display:flex;align-items:center;gap:7px}
.mockup-dots{display:flex;gap:4px}
.mockup-dots i{width:5px;height:5px;border-radius:50%;display:block}
.mockup-url{flex:1;height:15px;background:rgba(255,255,255,.08);border-radius:3px;display:flex;align-items:center;gap:4px;padding-left:6px;font-size:7.5px;color:rgba(181,208,240,.55);overflow:hidden;white-space:nowrap}
.mockup-screen{position:relative;height:340px;background:rgba(10,27,51,.75);overflow:hidden}
.mockup-screen img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.mockup-skeleton{position:absolute;inset:0;padding:18px 16px;display:flex;flex-direction:column;gap:8px}
.sk-hero{height:26px;width:70%;background:rgba(47,122,224,.22);border-radius:3px}
.sk-line{height:7px;background:rgba(255,255,255,.06);border-radius:3px}
.sk-btn{height:26px;width:96px;background:rgba(47,122,224,.34);border-radius:4px;margin-top:6px}
/* Boutons */
.m-btn{display:flex;align-items:center;justify-content:center;gap:9px;min-height:52px;padding:0 20px;border-radius:6px;background:var(--azur);color:#fff;font-size:14px;font-weight:500;letter-spacing:.01em}
.m-btn-ghost{background:rgba(47,122,224,.1);border:1px solid rgba(181,208,240,.28);color:var(--blanc)}
.m-btn-line{background:transparent;border:1px solid rgba(47,122,224,.3);color:var(--azur)}
.m-actions{display:flex;flex-direction:column;gap:10px}
.m-note{font-size:11px;color:rgba(10,27,51,.42);line-height:1.6;text-align:center}
.dark .m-note{color:rgba(181,208,240,.4)}
/* Investissement */
.m-price-row{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:14px;padding:15px 0;border-bottom:1px solid rgba(181,208,240,.12)}
.m-price-row:last-of-type{border-bottom:none}
.m-price-label{font-size:13.5px;color:rgba(181,208,240,.85)}
.m-price-sub{font-size:11px;color:rgba(181,208,240,.4);margin-top:4px;line-height:1.55}
.m-price-amount{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:24px;color:var(--blanc);white-space:nowrap}
.m-price-amount small{font-size:12px;color:rgba(181,208,240,.55)}
.m-price-total{display:flex;align-items:baseline;justify-content:space-between;gap:14px;border-top:1px solid rgba(181,208,240,.2);margin-top:8px;padding-top:16px}
.m-price-total-label{font-size:13px;font-weight:500;color:var(--blanc)}
.m-price-total-amount{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:34px;color:var(--blanc)}
.m-price-note{font-size:10.5px;color:rgba(181,208,240,.42);line-height:1.65;border-top:1px solid rgba(181,208,240,.09);padding-top:14px;margin-top:14px}
.m-alt{padding:18px 20px;background:#fff;border:1px solid rgba(47,122,224,.18);border-radius:6px}
.m-alt-dark{margin-top:20px;padding:17px 19px;border:1px solid rgba(181,208,240,.18);border-radius:6px;background:rgba(47,122,224,.08)}
.m-alt-dark .m-alt-sub{color:var(--brume)}
.m-alt-dark .m-alt-title{color:var(--blanc)}
.m-alt-dark .m-alt-desc{color:rgba(181,208,240,.55)}
.m-alt-dark .m-alt-price{border-top-color:rgba(181,208,240,.14)}
.m-alt-dark .m-alt-from{color:rgba(181,208,240,.5)}
.m-alt-dark .m-alt-amount{color:var(--blanc)}
.m-alt-sub{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:7px}
.m-alt-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:300;font-style:italic;color:var(--nuit)}
.m-alt-desc{font-size:12.5px;color:rgba(10,27,51,.55);line-height:1.6;margin-top:7px}
.m-alt-price{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:14px;padding-top:13px;border-top:1px solid rgba(10,27,51,.08)}
.m-alt-from{font-size:11px;color:rgba(10,27,51,.45)}
.m-alt-amount{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:26px;color:var(--nuit)}
/* Étapes */
.m-step{display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:start;padding:16px 0;border-bottom:1px solid rgba(10,27,51,.07)}
.m-step:last-child{border-bottom:none}
.m-step-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:300;color:rgba(47,122,224,.35);line-height:1}
.m-step-title{font-size:14.5px;font-weight:500;color:var(--nuit)}
.m-step-desc{font-size:12.5px;color:rgba(10,27,51,.55);line-height:1.65;margin-top:5px}
.m-sign{margin-top:28px;display:flex;align-items:center;gap:11px;border-top:1px solid rgba(181,208,240,.14);padding-top:18px}
.m-sign-text{font-size:11px;color:rgba(181,208,240,.5);line-height:1.6}

/* ── Notes mesurées — propre au rapport web, absent du kit ──────────────
   Les anneaux existent parce qu'un chiffre nu ne se lit pas sur un
   téléphone tenu à bout de bras. La preuve sous chaque note, elle, existe
   parce qu'une note qu'on ne peut pas justifier ne se défend pas en
   rendez-vous — c'est la règle de tout ce lot. */
.m-ring{width:150px;height:150px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;position:relative}
.m-ring-in{width:126px;height:126px;border-radius:50%;background:var(--nuit);display:flex;flex-direction:column;align-items:center;justify-content:center}
.m-ring-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:46px;font-weight:300;line-height:1;color:var(--blanc)}
.m-ring-max{font-size:11px;color:rgba(181,208,240,.5);margin-top:2px}
.m-ring-label{text-align:center;margin-top:16px;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:24px;color:var(--brume)}
.m-axe{padding:16px 18px;border:1px solid rgba(47,122,224,.16);border-radius:6px;background:#fff}
.m-axe-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.m-axe-name{font-size:14px;font-weight:500;color:var(--nuit)}
.m-axe-note{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:300;line-height:1}
.m-axe-bar{height:5px;border-radius:3px;background:rgba(10,27,51,.08);margin-top:10px;overflow:hidden}
.m-axe-fill{height:100%;border-radius:3px}
.m-preuves{display:flex;flex-direction:column;gap:7px;margin-top:12px}
.m-preuve{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:12px;line-height:1.5}
.m-preuve-lib{color:rgba(10,27,51,.6);flex:1}
.m-preuve-val{color:var(--nuit);font-weight:500;white-space:nowrap}
.m-preuve-seuil{font-size:10.5px;color:rgba(10,27,51,.35);white-space:nowrap}
.m-preuve.ok .m-preuve-val{color:#1F8A5B}
.m-preuve.moyen .m-preuve-val{color:#C8881F}
.m-preuve.probleme .m-preuve-val{color:#B5322F}
/* Avant / après */
.m-vs{display:flex;flex-direction:column;gap:14px}
.m-vs-col{display:flex;flex-direction:column;gap:8px}
.m-vs-label{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.m-vs-name{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(10,27,51,.4);font-weight:500}
.dark .m-vs-name{color:rgba(181,208,240,.45)}
.m-vs-note{font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:300}
.m-vs-shot{border-radius:6px;overflow:hidden;border:1px solid rgba(47,122,224,.2);background:rgba(10,27,51,.75);height:190px;position:relative}
.m-vs-shot img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.m-vs-vide{display:flex;align-items:center;justify-content:center;height:100%;font-size:12px;color:rgba(181,208,240,.45);text-align:center;padding:0 16px}
/* Méthode */
.m-methode{font-size:11.5px;line-height:1.75;color:rgba(10,27,51,.5)}
.dark .m-methode{color:rgba(181,208,240,.5)}
.m-methode b{font-weight:500;color:rgba(10,27,51,.7)}
.dark .m-methode b{color:rgba(181,208,240,.75)}
@media(min-width:520px){.m-vs{flex-direction:row}.m-vs-col{flex:1}}
`;
