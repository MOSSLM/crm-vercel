import React from "react";
import type { Metadata, Viewport } from "next";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getAppUrl } from "@/lib/app-url";
import {
  chargerOffresPlaquette,
  construirePlaquette,
  rendrePlaquetteMobile,
  type ProspectPlaquette,
} from "@/lib/audit/plaquette";
import { corpsPlaquette, corpsPlaquetteNominative } from "@/utils/audit/htmlCompact";
import { CSS_COMPACT } from "@/utils/audit/compactCss";
import { AUDIT_MOBILE_CSS } from "@/utils/audit/mobileCss";

/**
 * Le document, partagé par les DEUX routes qui le servent : `/plaquette` et
 * `/plaquette/{jeton}`.
 *
 * POURQUOI CE FICHIER EXISTE. Le jeton ne change rien à ce que le prospect voit
 * — il dit qui a ouvert, pas à qui on parle. Deux pages qui rendraient chacune
 * « le même » document finiraient par ne plus le rendre pareil : une correction
 * de tarif, de police ou de viewport appliquée d'un seul côté, et la moitié de
 * la cohorte reçoit l'ancienne version sans que rien ne le signale. Il n'y a
 * donc qu'un rendu, et les pages ne décident que d'une chose : compter
 * l'ouverture ou non.
 */

export type SearchParamsPlaquette = Record<string, string | string[] | undefined>;

const POLICES =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";

/** `?a4` sert le document imprimable ; sans lui, le rendu mobile. */
export const estA4 = (sp: SearchParamsPlaquette | undefined): boolean => sp?.a4 !== undefined;

/**
 * `?a4&imprimer` ouvre la boîte d'impression du navigateur — d'où l'on choisit
 * « Enregistrer en PDF ».
 *
 * C'EST EXACTEMENT LA MÉCANIQUE DE L'AUDIT, et il faut savoir ce qu'elle est :
 * le CRM ne fabrique aucun fichier PDF. Le bouton « Exporter PDF » de l'éditeur
 * d'audit ouvre une fenêtre, y écrit le document et appelle `window.print()`
 * (`SCRIPT_IMPRESSION`, compactCss.ts). Aucune librairie de PDF n'est installée,
 * et Chromium ne tient pas dans une fonction Vercel — la seule autre voie serait
 * un service externe, qui n'est pas configuré en production.
 *
 * Séparé de `?a4` parce que les deux usages diffèrent : on relit une plaquette à
 * l'écran en A4 pour la vérifier avant de l'envoyer, et une boîte d'impression
 * qui s'ouvre toute seule à chaque relecture serait insupportable.
 */
export const veutImprimer = (sp: SearchParamsPlaquette | undefined): boolean =>
  estA4(sp) && sp?.imprimer !== undefined;

/**
 * On n'imprime pas avant que les polices soient arrivées.
 *
 * Le même garde que l'audit, pour la même raison : `window.print()` appelé trop
 * tôt fige la mise en page sur la police de repli, et le document sort avec des
 * césures et des débordements que personne n'a vus à l'écran. La rallonge de
 * quatre secondes couvre le cas où les polices Google ne répondent pas du tout —
 * mieux vaut un document en police de repli qu'une boîte qui ne s'ouvre jamais.
 */
const SCRIPT_IMPRESSION_PLAQUETTE = `(function(){var f=false;function go(){if(f)return;f=true;window.focus();window.print();}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(go,120)});}else{setTimeout(go,400);}
setTimeout(go,4000);})();`;

/**
 * Les mêmes métadonnées avec ou sans jeton — y compris le titre.
 *
 * Rien n'y nomme le destinataire, et surtout pas l'aperçu de partage : la
 * plaquette part par WhatsApp, où la carte d'aperçu est visible par quiconque
 * voit le message. Un « Préparé pour {nom} » y transformerait un dépliant
 * commercial en document nominatif transféré à des tiers.
 */
export async function metadonneesPlaquette(): Promise<Metadata> {
  const titre = "Un site qui vous amène des clients — nos offres et nos tarifs";
  const description =
    "Sites internet pour artisans et entreprises du bâtiment : ce que contient le site, ce qu'on installe sur Google, ce qu'on gère ensuite, et combien ça coûte.";

  return {
    // Noindex, pour la même raison qui rend cette page dynamique : elle annonce
    // les tarifs du jour. Une version gardée par Google en annoncerait d'autres,
    // et personne ne saurait lesquels le prospect a lus. Avec un jeton s'ajoute
    // une seconde raison : une URL indexée deviendrait l'URL de tout le monde et
    // fausserait la mesure d'ouverture qui justifie ce jeton.
    robots: { index: false, follow: false },
    metadataBase: new URL(getAppUrl()),
    title: titre,
    description,
    openGraph: { type: "website", title: titre, description },
    twitter: { card: "summary", title: titre, description },
  };
}

/**
 * Le A4 se lit à 794 px de large, la largeur d'une feuille dans ce moteur de
 * rendu. Sans cette consigne, le téléphone applique `width=device-width` et la
 * feuille sort du cadre par la droite au lieu d'être réduite.
 */
export const viewportPlaquette = (sp: SearchParamsPlaquette | undefined): Viewport =>
  estA4(sp) ? { width: 794 } : { width: "device-width", initialScale: 1 };

/**
 * Le rendu lui-même. Les prix sont relus du catalogue à CHAQUE ouverture — la
 * plaquette n'est stockée nulle part, c'est ce qui l'empêche d'annoncer un tarif
 * périmé comme le font quatre audits en base.
 */
export async function RenduPlaquette({
  a4,
  imprimer = false,
  prospect = null,
}: {
  a4: boolean;
  imprimer?: boolean;
  prospect?: ProspectPlaquette | null;
}) {
  const offres = await chargerOffresPlaquette(getServiceClient());
  const contenu = construirePlaquette(offres);

  // Le rendu mobile est le cas NORMAL : la plaquette s'ouvre au pouce, depuis un
  // lien WhatsApp. Le A4 est la version qu'on imprime ou qu'on joint à un mail,
  // et il se demande explicitement — comme `?complet` sur le rapport.
  //
  // LA VERSION NOMINATIVE N'EXISTE QU'EN A4. Elle porte la capture de la démo
  // dans un cadre de navigateur, dessiné pour une demi-page de 794 px ; le rendu
  // mobile n'a pas cet emplacement, et l'y bricoler ferait deux couvertures à
  // maintenir pour le même document. Le mobile reste donc le dépliant neutre,
  // celui qu'on colle dans un WhatsApp — et c'est aussi le plus prudent des
  // deux, puisqu'un message se transfère.
  const html = a4
    ? prospect
      ? corpsPlaquetteNominative(contenu, prospect)
      : corpsPlaquette(contenu)
    : rendrePlaquetteMobile(contenu);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={POLICES} />
      <style dangerouslySetInnerHTML={{ __html: a4 ? CSS_COMPACT : AUDIT_MOBILE_CSS }} />
      {/* Le rendu est produit serveur, à partir du catalogue d'offres et du
          contenu par défaut, et tout passe par `esc()` dans les rendus. */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {imprimer && <script dangerouslySetInnerHTML={{ __html: SCRIPT_IMPRESSION_PLAQUETTE }} />}
    </>
  );
}
