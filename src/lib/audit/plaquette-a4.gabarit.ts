/**
 * Le gabarit a4 de la plaquette — maquette portée telle quelle.
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
 * Les marqueurs `{{...}}` sont remplacés par `plaquette-rendu.ts`, jamais ici.
 */

export const CSS_PLAQUETTE_A4 = String.raw`
/* Plaquette commerciale — 2 feuilles A4 (794 × 1123 px), 4 demi-pages de 794 × 561,5 px.
   Palette stricte : nuit #0A1B33 · azur #2F7AE0 · brume #B5D0F0 · crème #F7FAFD · blanc cassé #E8F3FF.
   Tout le reste est ces cinq couleurs en transparence. Aucune autre teinte, aucun arrondi (hormis
   les pastilles et le bouton rond, volontairement circulaires).
   Marqueurs à brancher : NOM_ENTREPRISE SECTEUR_VILLE CAPTURE_DEMO DEMO_URL
   PRIX_SITE DATE
   CAPTURE_DEMO se branche dans le style en ligne de .capt (background-image). Laissé vide,
   le squelette dessiné en CSS reste visible et la mise en page ne bouge pas. */
:root{--nuit:#0A1B33;--azur:#2F7AE0;--brume:#B5D0F0;--creme:#F7FAFD;--casse:#E8F3FF;--ink:#0A1B33;--soft:rgba(10,27,51,.68);--faint:rgba(10,27,51,.44);--line:rgba(10,27,51,.12);--line2:rgba(10,27,51,.22);--lineaz:rgba(47,122,224,.22);--pad:54px;--grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E")}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--brume);color:var(--ink);font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;-webkit-font-smoothing:antialiased}
#doc{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px 0}
a{color:inherit;text-decoration:none}
a.lnk{color:var(--azur);border-bottom:1px solid var(--lineaz)}
a.lnk:hover{border-bottom-color:var(--azur)}
.num{font-variant-numeric:tabular-nums}
.sheet{width:794px;height:1123px;flex:none;background:var(--creme);position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 5px rgba(10,27,51,.28);print-color-adjust:exact;-webkit-print-color-adjust:exact}
.half{height:561.5px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.half.b{border-top:1px dotted rgba(10,27,51,.34)}
.cut{position:absolute;left:50%;top:0;transform:translate(-50%,-50%);z-index:6;width:80px;height:60px;display:flex;align-items:center;justify-content:center}
.cut svg{width:52px;height:52px;color:#7FAEEA}
.half.b .body{padding-top:30px}
/* ── bandeau, pied, têtes de section ───────────────── */
.band{flex:none;background:var(--nuit);color:var(--casse);display:flex;align-items:center;justify-content:space-between;gap:20px;height:46px;padding:0 var(--pad)}
.brand{display:flex;align-items:center;gap:10px}
.brand svg{width:19px;height:19px;color:var(--brume);flex:none}
.brand span{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:17px;letter-spacing:.34em;padding-left:.34em;text-transform:lowercase}
.band .r{font-size:9px;letter-spacing:.19em;text-transform:uppercase;color:rgba(181,208,240,.74);text-align:right;white-space:nowrap}
.band .r b{font-weight:400;color:var(--casse)}
.body{flex:1;display:flex;flex-direction:column;padding:18px var(--pad) 0;min-height:0}
.foot{flex:none;display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin:0 var(--pad);padding:8px 0 12px;border-top:1px solid var(--line);font-size:8px;letter-spacing:.17em;text-transform:uppercase;color:var(--faint)}
.lbl{font-size:9px;font-weight:500;letter-spacing:.21em;text-transform:uppercase;color:var(--faint)}
.h{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:27px;line-height:1.1;letter-spacing:-.01em;margin-top:5px;color:var(--nuit);max-width:34ch}
.h em{font-style:italic;color:var(--azur)}
.intro{font-size:10.5px;line-height:1.5;color:var(--soft);max-width:76ch;margin-top:7px;text-wrap:pretty}
.hl{font-weight:400;color:var(--nuit);background:rgba(47,122,224,.15);box-shadow:0 0 0 2px rgba(47,122,224,.15)}
.sb{font-weight:500;color:var(--azur)}
.ic{flex:none;width:22px;height:22px;color:var(--azur)}
/* grain partagé — couverture et carte tarif */
.tex::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:var(--grain);mix-blend-mode:soft-light}
/* PAS DE GRAIN A L'IMPRESSION, ET C'EST 81 % DU FICHIER.
   Ce bruit est un feTurbulence SVG pose en pleine page avec un mode de fusion :
   le navigateur ne sait pas l'exprimer en vectoriel dans un PDF, il rasterise
   donc les zones couvertes en SANS-PERTE et en haute definition. Mesure le
   24/08/2026 sur la plaquette d'un prospect : 4,66 Mo avec, 0,88 Mo sans - cinq
   fois plus leger pour un calque a 0,5 d'opacite que personne ne distingue sur
   un telephone. Depuis que la plaquette part en piece jointe WhatsApp, ce poids
   se paie en donnees mobiles chez l'artisan, et un document qui met dix secondes
   a arriver ne s'ouvre pas.
   MEME DECISION QUE LE DOCUMENT D'AUDIT, qui l'avait deja prise pour la meme
   raison - voir l'option forPdf de generateCSS, dans htmlShared.ts. La lecon
   n'avait simplement pas traverse jusqu'ici.
   La regle est en media print et non dans le script de fabrication : elle
   couvre AUSSI l'Enregistrer en PDF fait a la main depuis ?a4&imprimer. */
@media print{.tex::after{display:none}}
/* ── bouton rond « visiter le site » ───────────────── */
.rbtn{position:relative;flex:none;width:88px;height:88px;border-radius:50%;background:var(--nuit);box-shadow:0 5px 16px rgba(10,27,51,.34);display:block}
.rbtn svg{position:absolute;inset:0;width:100%;height:100%}
.rbtn text{font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:6.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;fill:var(--brume);text-anchor:middle}
.rbtn .core{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--azur);color:var(--casse);display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;padding-bottom:2px}
.rbtn.sm{width:76px;height:76px}
.rbtn.sm .core{width:38px;height:38px;margin:-19px 0 0 -19px;font-size:16px}
/* ── couverture ────────────────────────────────────── */
.cover{background:radial-gradient(120% 90% at 22% 8%,rgba(47,122,224,.34),rgba(47,122,224,0) 58%),linear-gradient(168deg,rgba(47,122,224,.26) 0%,rgba(47,122,224,0) 46%,rgba(10,27,51,.62) 100%),var(--nuit);color:var(--casse)}
.cover .band{background:none;height:56px;position:relative;z-index:2}
.cover .band .brand svg{width:24px;height:24px}
.cover .band .brand span{font-size:20px}
.cvhead{position:relative;z-index:2;padding:12px var(--pad) 0}
.cvhead .lbl{color:rgba(181,208,240,.72)}
.cvhead .nom{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:33px;line-height:1.04;letter-spacing:-.012em;margin-top:7px;color:var(--casse)}
.cvhead .meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:7px;font-size:10.5px;color:rgba(181,208,240,.9)}
.cvhead .meta .sep{color:rgba(181,208,240,.45)}
.cvhead .meta b{font-weight:400;color:var(--casse)}
.prob{position:relative;z-index:2;margin:13px var(--pad) 0;padding-left:15px;border-left:2px solid var(--azur)}
.prob p{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:18px;line-height:1.3;color:var(--casse);max-width:52ch}
.prob p em{font-style:italic;color:var(--brume)}
.prob .s{margin-top:5px;font-size:9.5px;letter-spacing:.02em;color:rgba(181,208,240,.8)}
.cvfoot{position:relative;z-index:2;flex:1;display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 var(--pad);border-top:1px solid rgba(181,208,240,.24);font-size:9.5px;color:rgba(181,208,240,.82)}
.cvfoot .r{font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.6);white-space:nowrap}
.cvfoot .fb{display:none}
/* zone annotée : repère fixe de 686 × 286 px, le tracé SVG partage ses coordonnées */
.cvzone{position:relative;z-index:2;flex:none;width:686px;height:286px;margin:12px var(--pad) 0}
.filets{position:absolute;left:0;top:0;width:686px;height:286px;overflow:visible}
.win{position:absolute;left:0;top:8px;width:404px;height:266px;background:var(--casse);border:1px solid rgba(181,208,240,.34);box-shadow:0 12px 34px rgba(7,20,39,.5)}
.wbar{height:22px;display:flex;align-items:center;gap:12px;padding:0 9px;background:rgba(181,208,240,.55);border-bottom:1px solid rgba(10,27,51,.1)}
.wdots{display:flex;gap:4px;flex:none}
.wdots i{width:5px;height:5px;border-radius:50%;background:rgba(10,27,51,.22)}
.wurl{flex:1;height:12px;background:var(--creme);border:1px solid rgba(10,27,51,.1);display:flex;align-items:center;padding:0 6px;font-size:6.5px;letter-spacing:.06em;color:var(--soft);overflow:hidden;white-space:nowrap}
.shot{position:relative;height:244px;overflow:hidden;background:var(--creme)}
.capt{position:absolute;inset:0;z-index:1;background-repeat:no-repeat;background-position:top center;background-size:cover}
.cvzone .rbtn{position:absolute;left:14px;bottom:4px;z-index:4}
/* squelette de secours, dessiné en CSS — visible quand CAPTURE_DEMO est vide */
.skel{position:absolute;inset:0;z-index:0;display:flex;flex-direction:column;background:var(--creme)}
.skel .kh{flex:none;height:26px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--nuit)}
.skel .kh .kl{width:34px;height:7px;background:rgba(232,243,255,.9)}
.skel .kh .kn{flex:1;display:flex;gap:7px}
.skel .kh .kn i{width:26px;height:3px;background:rgba(181,208,240,.6)}
.skel .kh .kb{flex:none;height:11px;padding:0 7px;background:var(--azur);display:flex;align-items:center;font-size:5.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--casse)}
.stripe{background-image:repeating-linear-gradient(135deg,rgba(10,27,51,.055) 0 3px,rgba(10,27,51,0) 3px 7px);background-color:rgba(181,208,240,.32);display:flex;align-items:center;justify-content:center}
.stripe span{font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:6px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.skel .khero{flex:none;height:78px;display:grid;grid-template-columns:1fr 1.15fr;gap:10px;padding:9px 10px}
.skel .khero .tx{display:flex;flex-direction:column;justify-content:center;gap:5px}
.skel .khero .tx i{height:8px;background:rgba(10,27,51,.14)}
.skel .khero .tx i.s{width:62%;height:4px;background:rgba(10,27,51,.09)}
.skel .khero .tx .p{width:52px;height:11px;background:var(--azur);margin-top:3px}
.skel .krow{flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 10px}
.skel .krow>div{height:36px}
.skel .kzone{flex:1;display:grid;grid-template-columns:1fr 1.05fr;gap:10px;padding:9px 10px;min-height:0}
.skel .kzone .lst{display:flex;flex-direction:column;justify-content:center;gap:4px}
.skel .kzone .lst i{height:5px;background:rgba(10,27,51,.1)}
.skel .kzone .lst i:nth-child(2n){width:78%}
.skel .kzone .com{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:5px;gap:4px 8px;align-content:center}
.skel .kzone .com i{background:rgba(47,122,224,.24)}
.skel .kform{flex:none;height:32px;margin:0 10px 9px;border:1px solid rgba(47,122,224,.3);background:rgba(47,122,224,.05);display:flex;align-items:center;gap:7px;padding:0 7px}
.skel .kform i{flex:1;height:8px;background:rgba(10,27,51,.09)}
.skel .kform .b{flex:none;width:58px;height:13px;background:var(--azur)}
.skel .kfoot{flex:none;height:12px;background:var(--nuit)}
/* pastilles numérotées, posées sur la capture */
/* PLUS DE PASTILLE SUR LA CAPTURE, et il ne faut pas la remettre. La maquette
   posait 1-2-3 sur l'image, à des coordonnées fixes : elles tombaient donc au
   hasard du site de chaque prospect, sur un bouton chez l'un, sur le ciel d'une
   photo de chantier chez l'autre. Un repère qui ne désigne pas ce qu'il annonce
   dit au lecteur que le document n'a pas été fait pour lui. Les trois légendes
   restent à droite, et les filets partent du BORD du cadre — jamais de son
   intérieur. */
/* paragraphes reliés */
.note{position:absolute;left:470px;width:216px;z-index:3}
.note .t{display:flex;align-items:baseline;gap:7px;font-size:11px;font-weight:500;letter-spacing:.13em;text-transform:uppercase;color:var(--casse)}
.note .t s{text-decoration:none;font-size:9px;font-weight:400;letter-spacing:.1em;color:var(--brume)}
.note p{margin-top:6px;font-size:9.5px;line-height:1.52;color:rgba(232,243,255,.72);text-wrap:pretty}
.note p b{font-weight:400;color:var(--casse)}
/* couverture sans capture */
.cvsans{position:relative;z-index:2;flex:1;display:none;flex-direction:column;justify-content:center;padding:0 var(--pad)}
.cvsans .st{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:32px;line-height:1.18;letter-spacing:-.01em;max-width:28ch;color:var(--casse)}
.cvsans .st em{font-style:italic;color:var(--brume)}
.cvsans .tri{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:30px;padding-top:16px;border-top:1px solid rgba(181,208,240,.24)}
.cvsans .tri .n{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:28px;line-height:1;color:var(--brume)}
.cvsans .tri .k{margin-top:7px;font-size:10.5px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--casse)}
.cvsans .tri p{margin-top:5px;font-size:9.5px;line-height:1.5;color:rgba(232,243,255,.72)}
.cvsans .att{display:flex;align-items:center;gap:18px;margin-top:26px}
.cvsans .att p{font-size:10px;line-height:1.5;color:rgba(181,208,240,.86);max-width:52ch}
/* ── demi-page 2 : les trois piliers ──────────────── */
.piliers{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px;flex:1;min-height:0}
.pil{display:flex;flex-direction:column;background:var(--casse);border:1px solid var(--line);border-top:2px solid var(--nuit);padding:13px 14px 14px}
.pil .top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.pil .top b{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:34px;line-height:.82;color:var(--azur)}
.pil .k{margin-top:9px;font-size:8.5px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:var(--faint)}
.pil h3{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:21px;line-height:1.14;margin-top:5px;color:var(--nuit)}
.pil h3 em{font-style:italic;color:var(--azur)}
.pil p{font-size:10.5px;line-height:1.55;color:var(--soft);margin-top:8px;text-wrap:pretty}
.pil ul{list-style:none;margin-top:auto;padding-top:11px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:4px}
.pil li{position:relative;padding-left:12px;font-size:9.5px;line-height:1.4;color:var(--ink)}
.pil li::before{content:'';position:absolute;left:0;top:6px;width:6px;height:1px;background:var(--azur)}
.rassure{flex:none;display:flex;align-items:center;gap:12px;margin-top:14px;padding:9px 12px;background:var(--casse);border:1px solid var(--lineaz);font-size:9.5px;line-height:1.45;color:var(--soft)}
.rassure b{flex:none;font-size:8.5px;font-weight:500;letter-spacing:.17em;text-transform:uppercase;color:var(--azur)}
/* ── demi-page 3 : le prix ─────────────────────────── */
.pcard{position:relative;overflow:hidden;margin-top:16px;background:radial-gradient(110% 130% at 88% 4%,rgba(47,122,224,.32),rgba(47,122,224,0) 62%),linear-gradient(160deg,rgba(47,122,224,.2) 0%,rgba(47,122,224,0) 52%,rgba(10,27,51,.55) 100%),var(--nuit);color:var(--casse);display:grid;grid-template-columns:1fr auto;gap:26px;padding:20px 24px 21px}
.pcard>*{position:relative;z-index:2}
.pcard .tag{display:inline-block;font-size:8.5px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--nuit);background:var(--brume);padding:4px 9px}
.pcard h3{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.08;margin-top:11px}
.pcard h3 em{font-style:italic;color:var(--brume)}
.pcard .d{font-size:10px;line-height:1.5;color:rgba(181,208,240,.88);margin-top:7px;max-width:54ch}
.pcard ul{list-style:none;margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 20px}
.pcard li{position:relative;padding-left:12px;font-size:9.5px;line-height:1.42;color:rgba(232,243,255,.9)}
.pcard li::before{content:'';position:absolute;left:0;top:6px;width:6px;height:1px;background:var(--brume)}
.pcard .v{border-left:1px solid rgba(181,208,240,.28);padding-left:24px;display:flex;flex-direction:column;justify-content:flex-end;text-align:right;min-width:168px}
.pcard .v .k{font-size:8.5px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.7)}
.pcard .v .a{font-size:38px;font-weight:400;letter-spacing:-.02em;line-height:1;margin-top:9px;white-space:nowrap}
.pcard .v .s{font-size:9px;line-height:1.45;color:rgba(181,208,240,.8);margin-top:9px}
.plus{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-top:18px;padding-bottom:7px;border-bottom:1px solid var(--line2)}
.plus .s{font-size:9px;color:var(--faint)}
.svcs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:12px}
.svc{display:flex;flex-direction:column;background:var(--casse);border:1px solid var(--line);padding:12px 13px 11px}
.svc .top{display:flex;align-items:center;gap:9px}
.svc .n{font-size:11.5px;font-weight:500;line-height:1.2;color:var(--nuit)}
.svc p{font-size:9.5px;line-height:1.48;color:var(--soft);margin-top:8px;text-wrap:pretty}
.svc .w{margin-top:auto;padding-top:9px;font-size:8px;font-weight:500;letter-spacing:.17em;text-transform:uppercase;color:var(--azur)}
/* ── demi-page 4 : pour démarrer ───────────────────── */
.etapes{margin-top:14px;border-top:1.5px solid var(--nuit)}
.etape{display:grid;grid-template-columns:38px 1fr 236px;gap:20px;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--line)}
.etape .n{font-family:'Cormorant Garamond','Times New Roman',serif;font-weight:300;font-size:28px;line-height:.9;color:var(--azur)}
.etape h3{font-size:13px;font-weight:500;line-height:1.35;color:var(--nuit)}
.etape p{font-size:10px;line-height:1.5;color:var(--soft)}
.demoblk{display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center;margin-top:14px;padding:12px 16px;background:var(--casse);border:1px solid var(--lineaz)}
.demoblk .k{display:block;font-size:8.5px;font-weight:500;letter-spacing:.19em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.demoblk .u{display:block;font-size:15px;font-weight:500;color:var(--azur);line-height:1.2}
.demoblk .s{font-size:9.5px;line-height:1.45;color:var(--soft);text-align:right;max-width:34ch}
.endstrip{flex:none;background:var(--nuit);color:var(--casse);padding:14px var(--pad) 13px;display:grid;grid-template-columns:1fr auto;gap:11px 26px;align-items:end}
.endstrip .t{font-family:'Cormorant Garamond','Times New Roman',serif;font-size:18px;line-height:1.24;max-width:36ch}
.endstrip .c{text-align:right}
.endstrip .c .k{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:rgba(181,208,240,.62);margin-bottom:4px}
.endstrip .c .v{font-size:19px;font-weight:500;white-space:nowrap;line-height:1}
.endstrip .m{grid-column:1/-1;border-top:1px solid rgba(181,208,240,.2);padding-top:8px;display:flex;flex-wrap:wrap;gap:6px 20px;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(181,208,240,.72)}
.endstrip .m b{font-weight:400;color:var(--casse)}
/* ── couverture sans capture : #doc.sc ── */
#doc.sc .cvzone,#doc.sc .prob{display:none}
#doc.sc .cvsans{display:flex}
#doc.sc .cvdemo{display:none}
#doc.sc .cvfoot .fa{display:none}
#doc.sc .cvfoot .fb{display:inline}
/* ── impression ────────────────────────────────────── */
@page{size:211mm 298mm;margin:0}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  #doc{gap:0!important;padding:0!important}
  .sheet{margin:0!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}
  .sheet+.sheet{break-before:page;page-break-before:always}
}
html,body,*,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;

export const CORPS_PLAQUETTE_A4 = String.raw`
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><mask id="sama-sun"><path d="M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z" fill="white"></path><circle cx="50" cy="50" r="15" fill="black"></circle></mask><path id="ring-a" d="M44,44 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0"></path><path id="ring-b" d="M38,38 m-28,0 a28,28 0 1,1 56,0 a28,28 0 1,1 -56,0"></path></defs></svg>
<div id="doc">

<!-- ═════ FEUILLE 1 ═════════════════════════════════════════════════════ -->
<section class="sheet">

  <!-- demi-page 1 — couverture -->
  <div class="half cover tex" data-screen-label="01 — couverture">
    <div class="band">
      <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg><span>sama</span></div>
      <div class="r"><b>Plaquette</b> · {{DATE}}</div>
    </div>
    <div class="cvhead">
      <div class="lbl">Préparé pour</div>
      <h1 class="nom">{{NOM_ENTREPRISE}}</h1>
      <div class="meta"><span>{{SECTEUR_VILLE}}</span><span class="cvdemo"><span class="sep">·</span> votre aperçu : <b>{{DEMO_URL}}</b></span></div>
    </div>
    <div class="prob">
      <p>Faites ce que vous faites le mieux, on s'occupe de vous <em>faire rayonner sur internet</em>.</p>
      <div class="s">Voici le site que nous vous préparons. Trois repères, faites-en le tour.</div>
    </div>

    <!-- zone annotée 686 × 286 : capture, trois filets, trois légendes -->
    <div class="cvzone">
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
      <svg class="filets" viewBox="0 0 686 286" width="686" height="286" aria-hidden="true">
        <g fill="none" stroke="#B5D0F0" stroke-opacity=".55" stroke-width="1">
          <polyline points="410,90 430,90 430,17 462,17"></polyline>
          <polyline points="410,196 444,196 444,127 462,127"></polyline>
          <polyline points="410,240 452,240 452,231 462,231"></polyline>
        </g>
        <g fill="#B5D0F0" fill-opacity=".8"><circle cx="410" cy="90" r="2"></circle><circle cx="410" cy="196" r="2"></circle><circle cx="410" cy="240" r="2"></circle><circle cx="462" cy="17" r="2"></circle><circle cx="462" cy="127" r="2"></circle><circle cx="462" cy="231" r="2"></circle></g>
      </svg>
      <div class="note" style="top:8px"><div class="t">Crédibilité <s>on vous croit</s></div><p><b>Vos chantiers en photo</b>, vos avis et vos certifications dès l'accueil.</p></div>
      <div class="note" style="top:118px"><div class="t">Référencement <s>on vous trouve</s></div><p><b>Une page par métier</b> ou service que vous proposez.</p></div>
      <div class="note" style="top:222px"><div class="t">Conversion <s>on vous appelle</s></div><p>« Appeler » sur chaque écran, <b>formulaire intelligent</b>.</p></div>
      <a class="rbtn" href="https://{{DEMO_URL}}">
        <svg viewBox="0 0 88 88" aria-hidden="true"><text><textPath href="#ring-a" startOffset="25%">Cliquez pour visiter</textPath></text></svg>
        <span class="core">→</span>
      </a>
    </div>

    <!-- variante : couverture sans capture -->
    <div class="cvsans">
      <div class="st">Le site que nous préparons pour vous tient sur <em>trois idées</em>.</div>
      <div class="tri">
        <div><div class="n">1</div><div class="k">Crédibilité</div><p>Vos chantiers, vos avis et vos certifications dès l'accueil.</p></div>
        <div><div class="n">2</div><div class="k">Référencement</div><p>Une page par métier ou service que vous proposez.</p></div>
        <div><div class="n">3</div><div class="k">Conversion</div><p>« Appeler » sur chaque écran, formulaire intelligent.</p></div>
      </div>
      <div class="att">
        <span class="rbtn sm"><svg viewBox="0 0 76 76" aria-hidden="true"><text><textPath href="#ring-b" startOffset="25%">Votre aperçu arrive</textPath></text></svg><span class="core">→</span></span>
        <p>Votre aperçu est en préparation. Vous le recevrez en ligne, à votre nom, avec vos photos et vos métiers — vous n'aurez rien à installer.</p>
      </div>
    </div>

    <div class="cvfoot">
      
      <span class="fb">Les trois piliers sont détaillés sur les pages qui suivent.</span>
      <span class="r">sama digital studio</span>
    </div>
  </div>

  <!-- demi-page 2 — les trois piliers -->
  <div class="half b" data-screen-label="02 — les trois piliers">
    <span class="cut"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg></span>
    <div class="body">
      <div>
        <div class="lbl">Les trois piliers</div>
        <h2 class="h">Les trois piliers qui <em>transforment une visite en client</em></h2>
        <p class="intro">Un visiteur qui hésite fait trois choses : il regarde si vous êtes sérieux, il vérifie que vous travaillez chez lui, puis il cherche comment vous joindre. Votre site répond dans cet ordre.</p>
      </div>
      <div class="piliers">
        <div class="pil">
          <div class="top"><b>1</b><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="13"></rect><rect x="5" y="12" width="4" height="3" fill="currentColor" stroke="none"></rect><rect x="10.5" y="9.5" width="4" height="5.5" fill="currentColor" stroke="none"></rect><rect x="16" y="7" width="4" height="8" fill="currentColor" stroke="none"></rect><rect x="7" y="20" width="10" height="1.4" fill="currentColor" stroke="none"></rect></svg></div>
          <div class="k">Crédibilité</div>
          <h3>Mettez votre travail en avant avec un site <em>à votre image</em></h3>
          <p>Vos chantiers en photo, vos avis clients et vos certifications sont visibles <b class="hl">dès l'accueil</b>. Pas au fond d'un menu.</p>
          <ul><li>Vos chantiers, avant et après</li><li>Les avis de vos clients</li><li>Certifications et assurances</li></ul>
        </div>
        <div class="pil">
          <div class="top"><b>2</b><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="3.4"></circle><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"></circle><path d="M12 0.8v3M12 20.2v3M0.8 12h3M20.2 12h3"></path></svg></div>
          <div class="k">Référencement</div>
          <h3>Apparaissez <em>devant vos concurrents</em> sur le web</h3>
          <p><b class="hl">Une page par métier ou service</b> que vous proposez. Vos textes et vos images sont décrits pour que Google comprenne ce que vous faites, et où.</p>
          <ul><li>Une page par métier</li><li>Fiche d'entreprise complétée</li></ul>
        </div>
        <div class="pil">
          <div class="top"><b>3</b><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19"></rect><rect x="9.5" y="5.5" width="5" height="1.3" fill="currentColor" stroke="none"></rect><circle cx="12" cy="18.4" r="1.3" fill="currentColor" stroke="none"></circle><path d="M12 9.5v5M9.6 12.3l2.4 2.4 2.4-2.4"></path></svg></div>
          <div class="k">Conversion</div>
          <h3>Un site qui <em>facilite la prise de contact</em></h3>
          <p>Un bouton « Appeler » reste visible sur chaque écran. Le devis passe par un <b class="hl">formulaire intelligent</b>. Chaque demande arrive aussitôt sur votre téléphone.</p>
          <ul><li>« Appeler » toujours visible</li><li>Formulaire intelligent</li><li>Alerte mail et téléphone</li></ul>
        </div>
      </div>
      <div class="rassure"><b>Et sans y penser</b><span>Vous n'avez rien à installer ni à configurer. Le site est mis en ligne à votre nom, prêt à recevoir vos demandes dès le premier jour.</span></div>
    </div>
    <div class="foot"><span>Ce que votre site fait · sama digital studio · samadigitalstudio.fr</span><span>Feuille 1 / 2 — bas</span></div>
  </div>
</section>

<!-- ═════ FEUILLE 2 ═════════════════════════════════════════════════════ -->
<section class="sheet">

  <!-- demi-page 3 — le prix -->
  <div class="half" data-screen-label="03 — le prix">
    <div class="band">
      <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg><span>sama</span></div>
      <div class="r"><b>Le prix</b> · feuille 2 / 2</div>
    </div>
    <div class="body">
      <div>
        <div class="lbl">Le prix</div>
        <h2 class="h">Un seul montant, <em>sans surprise</em></h2>
        <p class="intro">Le site est livré fini : pages écrites, photos en place, mise en ligne à votre nom. Vous payez une fois.</p>
      </div>
      <div class="pcard tex">
        <div>
          <span class="tag">Une fois</span>
          <h3>Le site, <em>clé en main</em></h3>
          <div class="d">Vous relisez, nous mettons en ligne. Ensuite, vous nous appelez pour chaque modification.</div>
          <ul><li>Une page par métier</li><li>Écriture de tous les textes</li><li>Mise en place de vos photos</li><li>Formulaire intelligent</li><li>Mise en ligne à votre nom</li></ul>
        </div>
        <div class="v">
          <div class="k">Montant total</div>
          <div class="a num">{{PRIX_SITE}}</div>
          <div class="s">Réglé à la commande.<br>Le devis reprend le détail, ligne par ligne.</div>
        </div>
      </div>
      <div class="plus"><span class="lbl">Pour aller plus loin</span><span class="s">Nos services complémentaires, chacun sur devis. Le site n'en dépend pas.</span></div>
      <div class="svcs">
        <div class="svc">
          <div class="top"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="14" width="4" height="7" fill="currentColor" stroke="none"></rect><rect x="10" y="9" width="4" height="12" fill="currentColor" stroke="none"></rect><rect x="17" y="4" width="4" height="17" fill="currentColor" stroke="none"></rect></svg><span class="n">Suivi du référencement</span></div>
          <p>Nous ajoutons vos nouveaux métiers et vos nouvelles pages, et nous surveillons ce que Google affiche de vous.</p>
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
    <div class="foot"><span>Montant valable pour le site présenté le {{DATE}}</span><span>Feuille 2 / 2 — haut</span></div>
  </div>

  <!-- demi-page 4 — pour démarrer -->
  <div class="half b" data-screen-label="04 — pour démarrer">
    <span class="cut"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="currentColor" mask="url(#sama-sun)"></rect></svg></span>
    <div class="body">
      <div>
        <div class="lbl">Pour démarrer</div>
        <h2 class="h">Trois étapes, <em>puis il est en ligne</em></h2>
        <p class="intro">Vous n'avez rien à préparer d'autre que vos photos. Le reste, nous le faisons.</p>
      </div>
      <div class="etapes">
        <div class="etape"><span class="n">1</span><h3>Vous nous dites ce que vous gardez et ce que vous changez</h3><p>Sur l'aperçu que vous venez de voir. Un appel de quinze minutes suffit.</p></div>
        <div class="etape"><span class="n">2</span><h3>Vous nous envoyez vos photos complémentaires (optionnel)</h3><p>Par mail ou par message, comme vous préférez. Nous écrivons les textes.</p></div>
        <div class="etape"><span class="n">3</span><h3>Vous relisez, nous mettons en ligne à votre nom</h3><p>Rien n'est publié avant votre accord.</p></div>
      </div>
      <div class="demoblk">
        <a class="rbtn sm" href="https://{{DEMO_URL}}"><svg viewBox="0 0 76 76" aria-hidden="true"><text><textPath href="#ring-b" startOffset="25%">Visitez votre démo</textPath></text></svg><span class="core">→</span></a>
        <span><span class="k">Votre aperçu, en ligne</span><span class="u">{{DEMO_URL}}</span></span>
        <span class="s">Ouvrez-le sur votre téléphone. Rien à installer, rien à signer : il est déjà à votre nom.</span>
      </div>
    </div>
    <div class="endstrip">
      <div class="t">Vous validez l'aperçu, nous mettons votre site en ligne.</div>
      <div class="c"><div class="k">Appeler</div><div class="v num">06 46 04 28 76</div></div>
      <div class="m"><span><b>matteos@samadigitalstudio.fr</b></span><span>samadigitalstudio.fr</span><span>Plaquette établie le <b>{{DATE}}</b></span><span>Feuille 2 / 2 — bas</span></div>
    </div>
  </div>
</section>
</div>
<template id="__bundler_thumbnail"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#0A1B33"/><rect x="18" y="28" width="60" height="40" fill="#E8F3FF"/><rect x="18" y="28" width="60" height="6" fill="#B5D0F0"/><circle cx="66" cy="48" r="6" fill="#2F7AE0"/><rect x="86" y="44" width="18" height="2" fill="#B5D0F0"/><circle cx="30" cy="88" r="12" fill="#2F7AE0"/><rect x="50" y="86" width="52" height="4" fill="#B5D0F0"/></svg></template>
`;
