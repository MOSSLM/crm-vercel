/**
 * Le gabarit mobile de la plaquette — maquette portée telle quelle.
 *
 * D'OÙ IL VIENT. Livré par Claude Design contre le brief de la charte (les cinq
 * couleurs, Cormorant Garamond + DM Sans, la pagination du document d'audit),
 * puis amendé sur deux points seulement, tous deux commerciaux et non
 * graphiques : l'hébergement ne figure plus nulle part — il est parfois offert,
 * et le nommer en ferait un frein — et « tout compris » est devenu « sans
 * surprise », parce qu'un abonnement qui arrive après la signature ferait
 * mentir la première formule.
 *
 * POURQUOI LE MARKUP EST ICI ET PAS DANS UN `.html`. Garder le fichier de
 * maquette à côté du module obligerait à décider, à chaque retouche, lequel des
 * deux fait foi. Le markup vit donc dans le code, comme celui de l'audit
 * (`htmlCompact.ts`), et le fichier de maquette reste une archive.
 *
 * LA BASCULE SANS CAPTURE N'EST PLUS UNE CASE À COCHER. La maquette montrait
 * les deux couvertures avec un interrupteur de relecture (`#alt:checked`). En
 * production c'est la présence d'une capture qui décide, et elle se dit par une
 * classe sur le conteneur : `#doc.sc` porte la variante « démo pas encore
 * faite ». Cf. `plaquette-rendu.ts`.
 *
 * LE COMPOSANT WEB EXTERNE A ÉTÉ REMPLACÉ PAR `#doc`. La maquette s'appuyait
 * sur un composant chargé en `<script src>` pour dimensionner ses sept écrans.
 * Un script externe ne se résout pas dans un rendu serveur : la page serait
 * sortie sans dimensions, sept blocs empilés à la taille de leur contenu. Le
 * dimensionnement est donc écrit en CSS, et `@page` est posé pour que
 * l'impression rende UN écran PAR page — c'est ce qui fera le PDF WhatsApp.
 *
 * Les marqueurs `{{...}}` sont remplacés par `plaquette-rendu.ts`, jamais ici.
 */

export const CSS_PLAQUETTE_MOBILE = String.raw`
/* Plaquette commerciale — version mobile paginée : 7 pages au format téléphone (430 × 932 px).
   Une idée par page, interlignes serrés, boutons d'action à droite (pouce de la main droite).
   Mêmes contenus, mêmes textes que la plaquette A4.
   Palette stricte : nuit #0A1B33 · azur #2F7AE0 · brume #B5D0F0 · crème #F7FAFD · blanc cassé #E8F3FF.
   Marqueurs : NOM_ENTREPRISE SECTEUR_VILLE CAPTURE_DEMO DEMO_URL PRIX_SITE DATE */
:root{--nuit:#0A1B33;--azur:#2F7AE0;--brume:#B5D0F0;--creme:#F7FAFD;--casse:#E8F3FF;--ink:#0A1B33;--soft:rgba(10,27,51,.72);--faint:rgba(10,27,51,.46);--line:rgba(10,27,51,.12);--line2:rgba(10,27,51,.22);--lineaz:rgba(47,122,224,.22);--pad:24px;--grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E")}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{color:var(--ink);font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:17px;line-height:1.38;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
/* ── mise en page des sept écrans, écrite ici plutôt que par un composant ── */
#doc{display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 0}
.page{width:430px;height:932px;flex:none;box-shadow:0 1px 5px rgba(10,27,51,.28)}
@page{size:430px 932px;margin:0}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  #doc{gap:0!important;padding:0!important}
  .page{margin:0!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}
  .page+.page{break-before:page;page-break-before:always}
}
html,body,*,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit;text-decoration:none}
.num{font-variant-numeric:tabular-nums}
.tex::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:var(--grain);mix-blend-mode:soft-light}
/* ── gabarit de page ──────────────────────────────── */
.page{background:var(--creme);display:flex;flex-direction:column;overflow:hidden}
.page.dark{position:relative;background:radial-gradient(120% 60% at 20% 4%,rgba(47,122,224,.32),rgba(47,122,224,0) 58%),linear-gradient(168deg,rgba(47,122,224,.24) 0%,rgba(47,122,224,0) 46%,rgba(10,27,51,.6) 100%),var(--nuit);color:var(--casse)}
.page>*{position:relative;z-index:2}
.pbody{flex:1;display:flex;flex-direction:column;padding:26px var(--pad) 0;min-height:0}
.pgfoot{flex:none;display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin:0 var(--pad);padding:13px 0 20px;border-top:1px solid var(--line);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.dark .pgfoot{border-top-color:rgba(181,208,240,.24);color:rgba(181,208,240,.62)}
.lbl{font-size:11px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--faint)}
.dark .lbl{color:rgba(181,208,240,.72)}
.hd{flex:none}
.h{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:38px;line-height:1.04;letter-spacing:-.012em;margin-top:10px;color:var(--nuit)}
.h em{font-style:italic;color:var(--azur)}
.dark .h{color:var(--casse)}
.dark .h em{color:var(--brume)}
.intro{font-size:17.5px;line-height:1.42;color:var(--soft);margin-top:13px;text-wrap:pretty}
.dark .intro{color:rgba(181,208,240,.88)}
.hl{font-weight:400;color:var(--nuit);background:rgba(47,122,224,.15);box-shadow:0 0 0 2px rgba(47,122,224,.15)}
.ic{flex:none;width:28px;height:28px;color:var(--azur)}
.cut{display:flex;justify-content:center;padding-bottom:10px}
.cut svg{width:38px;height:38px;color:#7FAEEA}
/* ── bandeau ──────────────────────────────────────── */
.band{flex:none;background:var(--nuit);color:var(--casse);display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px var(--pad)}
.dark .band{background:none}
.brand{display:flex;align-items:center;gap:10px}
.brand svg{width:25px;height:25px;color:var(--brume);flex:none}
.brand span{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:23px;letter-spacing:.34em;padding-left:.34em;text-transform:lowercase}
.band .r{font-size:10px;line-height:1.35;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.74);text-align:right}
.band .r b{font-weight:400;color:var(--casse)}
/* ── page 1 : couverture ──────────────────────────── */
.cvhead .nom{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;overflow-wrap:anywhere;font-size:41px;line-height:1;letter-spacing:-.014em;margin-top:9px;color:var(--casse)}
.cvhead .meta{display:flex;flex-direction:column;gap:3px;margin-top:12px;font-size:16px;color:rgba(181,208,240,.9)}
.cvhead .meta b{font-weight:400;color:var(--casse)}
.prob{margin-top:22px;padding-left:17px;border-left:2px solid var(--azur)}
.prob p{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:28px;line-height:1.14;color:var(--casse)}
.prob p em{font-style:italic;color:var(--brume)}
.prob .s{margin-top:10px;font-size:15px;line-height:1.38;color:rgba(181,208,240,.82)}
.win{margin-top:22px;background:var(--casse);border:1px solid rgba(181,208,240,.34);box-shadow:0 14px 38px rgba(7,20,39,.5)}
.wbar{height:27px;display:flex;align-items:center;gap:10px;padding:0 10px;background:rgba(181,208,240,.55);border-bottom:1px solid rgba(10,27,51,.1)}
.wdots{display:flex;gap:5px;flex:none}
.wdots i{width:6px;height:6px;border-radius:50%;background:rgba(10,27,51,.22)}
.wurl{flex:1;height:15px;background:var(--creme);border:1px solid rgba(10,27,51,.1);display:flex;align-items:center;padding:0 7px;font-size:9px;letter-spacing:.05em;color:var(--soft);overflow:hidden;white-space:nowrap}
.shot{position:relative;height:250px;overflow:hidden;background:var(--creme)}
.capt{position:absolute;inset:0;z-index:1;background-repeat:no-repeat;background-position:top center;background-size:cover}
/* squelette de secours dessiné en CSS — visible si CAPTURE_DEMO est vide */
.skel{position:absolute;inset:0;z-index:0;display:flex;flex-direction:column;background:var(--creme)}
.skel .kh{flex:none;height:29px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--nuit)}
.skel .kh .kl{width:36px;height:8px;background:rgba(232,243,255,.9)}
.skel .kh .kn{flex:1;display:flex;gap:7px}
.skel .kh .kn i{width:28px;height:3px;background:rgba(181,208,240,.6)}
.skel .kh .kb{flex:none;height:12px;padding:0 7px;background:var(--azur);display:flex;align-items:center;font-size:6px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--casse)}
.stripe{background-image:repeating-linear-gradient(135deg,rgba(10,27,51,.055) 0 3px,rgba(10,27,51,0) 3px 7px);background-color:rgba(181,208,240,.32);display:flex;align-items:center;justify-content:center}
.stripe span{font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.skel .khero{flex:none;height:80px;display:grid;grid-template-columns:1fr 1.15fr;gap:10px;padding:10px}
.skel .khero .tx{display:flex;flex-direction:column;justify-content:center;gap:6px}
.skel .khero .tx i{height:9px;background:rgba(10,27,51,.14)}
.skel .khero .tx i.s{width:62%;height:5px;background:rgba(10,27,51,.09)}
.skel .khero .tx .p{width:56px;height:12px;background:var(--azur);margin-top:4px}
.skel .krow{flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 10px}
.skel .krow>div{height:38px}
.skel .kzone{flex:1;display:grid;grid-template-columns:1fr 1.05fr;gap:10px;padding:10px;min-height:0}
.skel .kzone .lst{display:flex;flex-direction:column;justify-content:center;gap:5px}
.skel .kzone .lst i{height:5px;background:rgba(10,27,51,.1)}
.skel .kzone .lst i:nth-child(2n){width:78%}
.skel .kzone .com{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:5px;gap:5px 8px;align-content:center}
.skel .kzone .com i{background:rgba(47,122,224,.24)}
.skel .kform{flex:none;height:33px;margin:0 10px 10px;border:1px solid rgba(47,122,224,.3);background:rgba(47,122,224,.05);display:flex;align-items:center;gap:7px;padding:0 8px}
.skel .kform i{flex:1;height:9px;background:rgba(10,27,51,.09)}
.skel .kform .b{flex:none;width:60px;height:14px;background:var(--azur)}
.skel .kfoot{flex:none;height:14px;background:var(--nuit)}
/* bouton rond — toujours posé à droite, à portée du pouce */
.rbtn{position:relative;flex:none;width:100px;height:100px;border-radius:50%;background:var(--nuit);box-shadow:0 5px 16px rgba(10,27,51,.34);display:block}
.rbtn svg{position:absolute;inset:0;width:100%;height:100%}
.rbtn text{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:7px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;fill:var(--brume);text-anchor:middle}
.rbtn .core{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:var(--azur);color:var(--casse);display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;padding-bottom:2px}
.cvcta{display:flex;flex-direction:row-reverse;align-items:center;gap:18px;margin-top:auto;padding:22px 0 6px;border-top:1px solid rgba(181,208,240,.2)}
.cvcta p{font-size:15.5px;line-height:1.38;color:rgba(181,208,240,.88)}
.cvcta p b{font-weight:400;color:var(--casse)}
/* ── page 2 : les trois repères ───────────────────── */
.reps{flex:1;display:flex;flex-direction:column;margin-top:20px;border-top:1px solid rgba(181,208,240,.24);min-height:0}
.rep{flex:1;display:flex;flex-direction:column;justify-content:center;padding:18px 0;border-bottom:1px solid rgba(181,208,240,.18)}
.rep .n{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:52px;line-height:.8;color:var(--azur)}
.rep .t{display:flex;flex-wrap:wrap;align-items:baseline;gap:9px;margin-top:12px;font-size:14.5px;line-height:1.3;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--casse)}
.rep .t s{text-decoration:none;font-size:13px;font-weight:400;letter-spacing:.06em;color:var(--brume);text-transform:none}
.rep p{margin-top:8px;font-size:18px;line-height:1.32;color:rgba(232,243,255,.8);text-wrap:pretty}
.rep p b{font-weight:400;color:var(--casse)}
.cvend{flex:none;padding:20px 0 6px;font-size:19px;line-height:1.24;font-family:'Cormorant Garamond','Times New Roman',serif;color:rgba(232,243,255,.88)}
.cvend .fb{display:none}
/* variante : couverture sans capture */
.cvsans{display:none}
.cvsans .st{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:32px;line-height:1.1;letter-spacing:-.01em;margin-top:22px;color:var(--casse)}
.cvsans .st em{font-style:italic;color:var(--brume)}
.cvsans .att{display:flex;flex-direction:row-reverse;align-items:center;gap:18px;margin-top:24px;padding-top:22px;border-top:1px solid rgba(181,208,240,.24)}
.cvsans .att p{font-size:16px;line-height:1.38;color:rgba(181,208,240,.88)}
/* ── page 3 : les trois piliers, sur une seule page ── */
.piliers{flex:1;display:flex;flex-direction:column;gap:9px;margin-top:11px;min-height:0}
.pil{flex:1;display:grid;grid-template-columns:26px 1fr;column-gap:11px;align-content:center;padding:11px 13px;background:var(--casse);border:1px solid var(--line);border-top:2px solid var(--nuit)}
.pil .n{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:30px;line-height:.8;color:var(--azur)}
.pil .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.pil .k{font-size:10px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:var(--faint)}
.pil h3{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:20px;line-height:1.02;margin-top:3px;color:var(--nuit)}
.pil h3 em{font-style:italic;color:var(--azur)}
.pil p{grid-column:2;font-size:14.5px;line-height:1.22;color:var(--soft);margin-top:6px;text-wrap:pretty}
.pil ul{grid-column:2;list-style:none;display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.pil li{font-size:12px;line-height:1.2;letter-spacing:.01em;color:var(--nuit);background:rgba(47,122,224,.09);border:1px solid var(--lineaz);padding:3px 7px}
.piliers .ic{width:22px;height:22px}
.pilpage .h{font-size:28px}
.pilpage .intro{font-size:14.5px;line-height:1.26;margin-top:9px}
/* ── page 4 : le prix ─────────────────────────────── */
.pcard{flex:1;position:relative;overflow:hidden;display:flex;flex-direction:column;margin-top:16px;background:radial-gradient(110% 80% at 88% 3%,rgba(47,122,224,.32),rgba(47,122,224,0) 62%),linear-gradient(160deg,rgba(47,122,224,.2) 0%,rgba(47,122,224,0) 52%,rgba(10,27,51,.55) 100%),var(--nuit);color:var(--casse);padding:22px;min-height:0}
.pcard>*{position:relative;z-index:2}
.pcard .tag{align-self:flex-start;font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--nuit);background:var(--brume);padding:6px 11px}
.pcard h3{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:34px;line-height:1;margin-top:14px}
.pcard h3 em{font-style:italic;color:var(--brume)}
.pcard .d{font-size:16px;line-height:1.36;color:rgba(181,208,240,.9);margin-top:11px}
.pcard .v{margin-top:16px;padding-top:15px;border-top:1px solid rgba(181,208,240,.28)}
.pcard .v .k{font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.7)}
.pcard .v .a{font-size:50px;font-weight:400;letter-spacing:-.02em;line-height:1;margin-top:10px}
.pcard .v .s{font-size:15px;line-height:1.34;color:rgba(181,208,240,.84);margin-top:10px}
.pcard ul{list-style:none;display:flex;flex-direction:column;gap:7px}
.pcard .uk{margin-top:auto;padding-top:16px;border-top:1px solid rgba(181,208,240,.28);font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.7)}
.pcard .uk+ul{margin-top:12px}
.pcard li{position:relative;padding-left:17px;font-size:16px;line-height:1.24;color:rgba(232,243,255,.94)}
.pcard li::before{content:'';position:absolute;left:0;top:10px;width:9px;height:1px;background:var(--brume)}
/* ── page 5 : pour aller plus loin ────────────────── */
.svcs{flex:1;display:flex;flex-direction:column;gap:14px;margin-top:20px;min-height:0}
.svc{flex:1;display:flex;flex-direction:column;background:var(--casse);border:1px solid var(--line);padding:18px}
.svc .top{display:flex;align-items:center;gap:12px}
.svc .n{font-size:18.5px;font-weight:500;line-height:1.15;color:var(--nuit)}
.svc p{font-size:17px;line-height:1.36;color:var(--soft);margin-top:10px;text-wrap:pretty}
.svc .w{margin-top:auto;padding-top:12px;font-size:10.5px;font-weight:500;letter-spacing:.17em;text-transform:uppercase;color:var(--azur)}
/* ── page 6 : pour démarrer ───────────────────────── */
.etapes{flex:1;display:flex;flex-direction:column;margin-top:20px;border-top:1.5px solid var(--nuit);min-height:0}
.etape{flex:1;display:grid;grid-template-columns:38px 1fr;gap:16px;align-content:center;padding:18px 0;border-bottom:1px solid var(--line)}
.etape .n{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:40px;line-height:.78;color:var(--azur)}
.etape h3{font-size:19px;font-weight:500;line-height:1.2;color:var(--nuit)}
.etape p{grid-column:2;font-size:17px;line-height:1.34;color:var(--soft);margin-top:8px}
/* ── page 7 : aperçu et contact ───────────────────── */
.demoblk{flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px;margin-top:20px;padding:26px 20px;background:rgba(232,243,255,.07);border:1px solid rgba(181,208,240,.28)}
.demoblk .row{display:flex;flex-direction:row-reverse;align-items:center;gap:18px}
.demoblk .row>span{flex:1}
.demoblk .k{display:block;font-size:11px;font-weight:500;letter-spacing:.19em;text-transform:uppercase;color:rgba(181,208,240,.7);margin-bottom:7px}
.demoblk .u{display:block;font-size:21px;font-weight:500;color:var(--brume);line-height:1.14;word-break:break-word}
.demoblk .s{font-size:16px;line-height:1.36;color:rgba(181,208,240,.88)}
.endblk{flex:1;display:flex;flex-direction:column;justify-content:center;padding:26px 0 6px;min-height:0}
.endblk .t{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:35px;line-height:1.08;color:var(--casse)}
.endblk .c{margin-top:26px;padding-top:20px;border-top:1px solid rgba(181,208,240,.24)}
.endblk .c .k{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.62);margin-bottom:8px}
.endblk .c .v{font-size:37px;font-weight:500;line-height:1;white-space:nowrap;color:var(--casse)}
.endblk .m{margin-top:24px;display:flex;flex-direction:column;gap:9px;font-size:11px;line-height:1.3;letter-spacing:.13em;text-transform:uppercase;color:rgba(181,208,240,.72)}
.endblk .m b{font-weight:400;color:var(--casse)}
/* ── couverture sans capture : #doc.sc ── */
#doc.sc .win,#doc.sc .prob{display:none}
#doc.sc .cvsans{display:flex;flex-direction:column;flex:1}
#doc.sc .cvdemo{display:none}
#doc.sc .cvend .fa{display:none}
#doc.sc .cvend .fb{display:block}
#doc.sc .cvsans .att{margin-top:auto}
html,body,*,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;

export const CORPS_PLAQUETTE_MOBILE = String.raw`
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><mask id="sama-sun"><path d="M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z" fill="white"></path><circle cx="50" cy="50" r="15" fill="black"></circle></mask><path id="ring-a" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"></path></defs></svg>
<div id="doc">

<!-- ═════ 1 — couverture ═══════════════════════════════════════════════ -->
<section class="page dark tex" data-screen-label="01 — couverture">
  <div class="band">
    <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg><span>sama</span></div>
    <div class="r"><b>Plaquette</b><br>{{DATE}}</div>
  </div>
  <div class="pbody">
    <div class="cvhead">
      <div class="lbl">Préparé pour</div>
      <h1 class="nom">{{NOM_ENTREPRISE}}</h1>
      <div class="meta"><span>{{SECTEUR_VILLE}}</span><span class="cvdemo">votre aperçu : <b>{{DEMO_URL}}</b></span></div>
    </div>
    <div class="prob">
      <p>Faites ce que vous faites le mieux, on s'occupe de vous <em>faire rayonner sur internet</em>.</p>
      <div class="s">Voici le site que nous vous préparons. Trois repères, faites-en le tour.</div>
    </div>
    <div class="win">
      <div class="wbar"><span class="wdots"><i></i><i></i><i></i></span><span class="wurl">{{DEMO_URL}}</span></div>
      <div class="shot">
        <div class="skel">
          <div class="kh"><span class="kl"></span><span class="kn"><i></i><i></i><i></i></span><span class="kb">Appeler</span></div>
          <div class="khero"><div class="tx"><i></i><i class="s"></i><span class="p"></span></div><div class="stripe"><span>photo de chantier</span></div></div>
          <div class="krow"><div class="stripe"><span>chantier</span></div><div class="stripe"><span>chantier</span></div><div class="stripe"><span>avis client</span></div></div>
          <div class="kzone"><div class="lst"><i></i><i></i><i></i><i></i><i></i></div><div class="com"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
          <div class="kform"><i></i><i></i><span class="b"></span></div>
          <div class="kfoot"></div>
        </div>
        <!-- {{CAPTURE_DEMO}} : coller l'adresse de l'image ci-dessous. Vide = squelette visible. -->
        <div class="capt" style="background-image:url('{{CAPTURE_DEMO}}')"></div>
      </div>
    </div>
    <div class="cvsans">
      <div class="st">Le site que nous préparons pour vous tient sur <em>trois idées</em>.</div>
      <div class="att">
        <span class="rbtn"><svg viewBox="0 0 100 100" aria-hidden="true"><text><textPath href="#ring-a" startOffset="25%">Votre aperçu arrive</textPath></text></svg><span class="core">→</span></span>
        <p>Votre aperçu est en préparation. Vous le recevrez en ligne, à votre nom, avec vos photos et vos communes — vous n'aurez rien à installer.</p>
      </div>
    </div>
    <div class="cvcta">
      <a class="rbtn" href="https://{{DEMO_URL}}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><text><textPath href="#ring-a" startOffset="25%">Cliquez pour visiter</textPath></text></svg>
        <span class="core">→</span>
      </a>
      <p>Ouvrez-le, il est déjà en ligne à votre nom : <b>{{DEMO_URL}}</b></p>
    </div>
  </div>
  <div class="pgfoot"><span>sama digital studio</span><span>1 / 7</span></div>
</section>

<!-- ═════ 2 — les trois repères ════════════════════════════════════════ -->
<section class="page dark tex" data-screen-label="02 — les trois repères">
  <div class="pbody">
    <div class="hd">
      <div class="lbl">Votre aperçu</div>
      <h2 class="h">Trois repères, <em>faites-en le tour</em></h2>
    </div>
    <div class="reps">
      <div class="rep"><div class="n">1</div><div class="t">Crédibilité <s>on vous croit</s></div><p><b>Vos chantiers en photo</b>, vos avis et vos certifications dès l'accueil.</p></div>
      <div class="rep"><div class="n">2</div><div class="t">Référencement <s>on vous trouve</s></div><p><b>Une page par métier</b> et par commune que vous couvrez.</p></div>
      <div class="rep"><div class="n">3</div><div class="t">Conversion <s>on vous appelle</s></div><p>« Appeler » sur chaque écran, <b>formulaire intelligent</b>.</p></div>
    </div>
    <div class="cvend">
      
      <span class="fb">Les trois piliers sont détaillés sur les pages qui suivent.</span>
    </div>
  </div>
  <div class="pgfoot"><span>Votre aperçu · sama digital studio</span><span>2 / 7</span></div>
</section>

<!-- ═════ 3 — les trois piliers ════════════════════════════════════════ -->
<section class="page pilpage" data-screen-label="03 — les trois piliers">
  <div class="pbody">
    <div class="hd">
      <div class="lbl">Les trois piliers</div>
      <h2 class="h">Les trois piliers qui <em>transforment une visite en client</em></h2>
      <p class="intro">Un visiteur qui hésite fait trois choses : il regarde si vous êtes sérieux, il vérifie que vous travaillez chez lui, puis il cherche comment vous joindre. Votre site répond dans cet ordre.</p>
    </div>
    <div class="piliers">
      <div class="pil">
        <span class="n">1</span>
        <div class="hdr">
          <div><div class="k">Crédibilité</div><h3>Mettez votre travail en avant avec un site <em>à votre image</em></h3></div>
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="13"></rect><rect x="5" y="12" width="4" height="3" fill="currentColor" stroke="none"></rect><rect x="10.5" y="9.5" width="4" height="5.5" fill="currentColor" stroke="none"></rect><rect x="16" y="7" width="4" height="8" fill="currentColor" stroke="none"></rect><rect x="7" y="20" width="10" height="1.4" fill="currentColor" stroke="none"></rect></svg>
        </div>
        <p>Vos chantiers en photo, vos avis clients et vos certifications sont visibles <b class="hl">dès l'accueil</b>. Pas au fond d'un menu.</p>
        <ul><li>Chantiers avant / après</li><li>Avis clients</li><li>Certifications</li></ul>
      </div>
      <div class="pil">
        <span class="n">2</span>
        <div class="hdr">
          <div><div class="k">Référencement</div><h3>Apparaissez <em>devant vos concurrents</em> sur le web</h3></div>
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="3.4"></circle><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"></circle><path d="M12 0.8v3M12 20.2v3M0.8 12h3M20.2 12h3"></path></svg>
        </div>
        <p><b class="hl">Une page par métier et par commune</b> que vous couvrez. Vos textes et vos images sont décrits pour que Google comprenne ce que vous faites, et où.</p>
        <ul><li>Une page par métier</li><li>Fiche Google</li></ul>
      </div>
      <div class="pil">
        <span class="n">3</span>
        <div class="hdr">
          <div><div class="k">Conversion</div><h3>Un site qui <em>facilite la prise de contact</em></h3></div>
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19"></rect><rect x="9.5" y="5.5" width="5" height="1.3" fill="currentColor" stroke="none"></rect><circle cx="12" cy="18.4" r="1.3" fill="currentColor" stroke="none"></circle><path d="M12 9.5v5M9.6 12.3l2.4 2.4 2.4-2.4"></path></svg>
        </div>
        <p>Un bouton « Appeler » reste visible sur chaque écran. Le devis passe par un <b class="hl">formulaire intelligent</b>. Chaque demande arrive aussitôt sur votre téléphone.</p>
        <ul><li>« Appeler » visible</li><li>Formulaire intelligent</li><li>Alerte mail + tél.</li></ul>
      </div>
    </div>
  </div>
  <div class="pgfoot"><span>Ce que votre site fait · samadigitalstudio.fr</span><span>3 / 7</span></div>
</section>

<!-- ═════ 4 — le prix ══════════════════════════════════════════════════ -->
<section class="page" data-screen-label="04 — le prix">
  <div class="band">
    <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg><span>sama</span></div>
    <div class="r"><b>Le prix</b></div>
  </div>
  <div class="pbody">
    <div class="hd">
      <div class="lbl">Le prix</div>
      <h2 class="h">Un seul montant, <em>sans surprise</em></h2>
      <p class="intro">Le site est livré fini : pages écrites, photos en place, mise en ligne à votre nom. Vous payez une fois.</p>
    </div>
    <div class="pcard tex">
      <span class="tag">Une fois</span>
      <h3>Le site, <em>clé en main</em></h3>
      <div class="d">Vous relisez, nous mettons en ligne. Ensuite, vous nous appelez pour chaque modification.</div>
      <div class="v">
        <div class="k">Montant total</div>
        <div class="a num">{{PRIX_SITE}}</div>
        <div class="s">Réglé à la commande.<br>Le devis reprend le détail, ligne par ligne.</div>
      </div>
      <div class="uk">Compris dans ce montant</div>
      <ul><li>Une page par métier</li><li>Écriture de tous les textes</li><li>Mise en place de vos photos</li><li>Formulaire intelligent</li><li>Mise en ligne à votre nom</li></ul>
    </div>
  </div>
  <div class="pgfoot"><span>Montant valable pour le site présenté le {{DATE}}</span><span>4 / 7</span></div>
</section>

<!-- ═════ 5 — pour aller plus loin ═════════════════════════════════════ -->
<section class="page" data-screen-label="05 — pour aller plus loin">
  <div class="pbody">
    <div class="hd">
      <div class="lbl">Pour aller plus loin</div>
      <h2 class="h">Trois services <em>séparés</em>, chacun sur devis</h2>
      <p class="intro">Le site n'en dépend pas.</p>
    </div>
    <div class="svcs">
      <div class="svc">
        <div class="top"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="14" width="4" height="7" fill="currentColor" stroke="none"></rect><rect x="10" y="9" width="4" height="12" fill="currentColor" stroke="none"></rect><rect x="17" y="4" width="4" height="17" fill="currentColor" stroke="none"></rect></svg><span class="n">Suivi du référencement</span></div>
        <p>Nous ajoutons vos nouvelles communes et vos nouveaux métiers, et nous surveillons ce que Google affiche de vous.</p>
        <div class="w">Sur devis</div>
      </div>
      <div class="svc">
        <div class="top"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="10"></circle></svg><span class="n">Publicité locale</span></div>
        <p>Des annonces payantes sur votre zone, pour être vu tout de suite pendant que le site s'installe.</p>
        <div class="w">Sur devis</div>
      </div>
      <div class="svc">
        <div class="top"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="17"></rect><rect x="2.5" y="3.5" width="19" height="4" fill="currentColor" stroke="none"></rect><circle cx="6.5" cy="12" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="6.5" cy="16.5" r="1.2" fill="currentColor" stroke="none"></circle><path d="M10 12h8M10 16.5h8"></path></svg><span class="n">Fiche Google complétée</span></div>
        <p>Photos, horaires, zones d'intervention et avis : votre fiche d'entreprise remplie et tenue à jour.</p>
        <div class="w">Sur devis</div>
      </div>
    </div>
  </div>
  <div class="pgfoot"><span>Chacun sur devis</span><span>5 / 7</span></div>
</section>

<!-- ═════ 6 — pour démarrer ════════════════════════════════════════════ -->
<section class="page" data-screen-label="06 — pour démarrer">
  <div class="pbody">
    <div class="hd">
      <span class="cut"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg></span>
      <div class="lbl">Pour démarrer</div>
      <h2 class="h">Trois étapes, <em>puis il est en ligne</em></h2>
      <p class="intro">Vous n'avez rien à préparer d'autre que vos photos. Le reste, nous le faisons.</p>
    </div>
    <div class="etapes">
      <div class="etape"><span class="n">1</span><h3>Vous nous dites ce que vous gardez et ce que vous changez</h3><p>Sur l'aperçu que vous venez de voir. Un appel de quinze minutes suffit.</p></div>
      <div class="etape"><span class="n">2</span><h3>Vous nous envoyez vos photos complémentaires (optionnel)</h3><p>Par mail ou par message, comme vous préférez. Nous écrivons les textes.</p></div>
      <div class="etape"><span class="n">3</span><h3>Vous relisez, nous mettons en ligne à votre nom</h3><p>Rien n'est publié avant votre accord.</p></div>
    </div>
  </div>
  <div class="pgfoot"><span>Pour démarrer</span><span>6 / 7</span></div>
</section>

<!-- ═════ 7 — votre aperçu et le contact ═══════════════════════════════ -->
<section class="page dark tex" data-screen-label="07 — contact">
  <div class="pbody">
    <div class="demoblk">
      <div class="row">
        <a class="rbtn" href="https://{{DEMO_URL}}"><svg viewBox="0 0 100 100" aria-hidden="true"><text><textPath href="#ring-a" startOffset="25%">Visitez votre démo</textPath></text></svg><span class="core">→</span></a>
        <span><span class="k">Votre aperçu, en ligne</span><span class="u">{{DEMO_URL}}</span></span>
      </div>
      <span class="s">Ouvrez-le sur votre téléphone. Rien à installer, rien à signer : il est déjà à votre nom.</span>
    </div>
    <div class="endblk">
      <div class="t">Vous validez l'aperçu, nous mettons votre site en ligne.</div>
      <div class="c"><div class="k">Appeler</div><div class="v num">06 46 04 28 76</div></div>
      <div class="m"><span><b>matteos@samadigitalstudio.fr</b></span><span>samadigitalstudio.fr</span><span>Plaquette établie le <b>{{DATE}}</b></span></div>
    </div>
  </div>
  <div class="pgfoot"><span>sama digital studio</span><span>7 / 7</span></div>
</section>
</div>

<template id="__bundler_thumbnail"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#0A1B33"/><rect x="24" y="22" width="32" height="76" fill="#E8F3FF"/><rect x="64" y="22" width="32" height="76" fill="#B5D0F0"/><circle cx="40" cy="60" r="8" fill="#2F7AE0"/><rect x="70" y="56" width="20" height="3" fill="#0A1B33"/></svg></template>
`;
