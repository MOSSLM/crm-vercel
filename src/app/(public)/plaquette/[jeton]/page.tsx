import React from "react";
import type { Metadata, Viewport } from "next";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { chargerProspectPlaquette, marquerPlaquetteVue } from "@/lib/audit/plaquette";
import {
  estA4,
  metadonneesPlaquette,
  RenduPlaquette,
  veutImprimer,
  viewportPlaquette,
  type SearchParamsPlaquette,
} from "../rendu";

/**
 * La plaquette d'un prospect : `/plaquette/{jeton}`.
 *
 * LE JETON NOMME, DÉSORMAIS — ET DANS LES DEUX FORMATS. Il a d'abord servi à une
 * seule chose, savoir QUI a ouvert. Mais il désigne UNE entreprise et une seule,
 * ce qui est exactement la garantie qui manquait pour montrer à quelqu'un la
 * capture de SA démo sans risquer de l'envoyer à la cohorte entière.
 *
 * LE MOBILE A CESSÉ D'ÊTRE NEUTRE, ET C'EST UNE DÉCISION. Il l'était parce
 * qu'un message WhatsApp se transfère, et qu'un document nominatif transféré
 * devient un document nominatif chez un tiers. Deux choses ont changé : la
 * maquette porte la capture de sa démo dans les deux formats — c'est ce qui met
 * notre travail en avant, et c'est la demande — et ce qui part n'est plus un
 * lien mais un PDF, que l'agent joint lui-même. Ce qu'on accepte en échange :
 * un prospect qui transfère la plaquette transfère son nom et son aperçu. Rien
 * d'autre n'y figure — ni note, ni relevé, ni donnée client.
 *
 * ET LE PDF SE PREND DANS LES DEUX FORMATS. `?a4&imprimer` rend la feuille,
 * `?imprimer` seul rend les huit pages du gabarit mobile — celui qui a été
 * dessiné pour WhatsApp, où un A4 arrive en vignette. Le corollaire est plus bas,
 * au compteur : aucune des deux demandes d'impression ne compte une ouverture.
 *
 * DEUX REPLIS VERS LE DOCUMENT COLLECTIF, jamais vers une erreur : jeton inconnu
 * et base injoignable. L'entreprise SANS démo montrable n'en est plus un — le
 * gabarit a une couverture pour elle (« votre aperçu est en préparation »), et
 * la nommer vaut mieux que lui servir un dépliant anonyme.
 *
 * UN JETON MORT, RÉVOQUÉ OU INCONNU REND LE DOCUMENT QUAND MÊME, et c'est une
 * décision, pas un oubli :
 *
 *   · il n'y a rien à protéger. Le rapport d'audit nomme une entreprise et lui
 *     attribue une note — d'où son `actif`, sa page « ce rapport n'est plus
 *     accessible », et les 35 jetons coupés sur 42 en base. La plaquette ne
 *     contient aucune donnée client : la refuser ne préserverait rien ;
 *   · le prospect a cliqué. Le seul cas où il voit une erreur est celui où on
 *     s'est trompé — lien tronqué par la messagerie, jeton recopié à la main.
 *     Lui répondre « ce document n'existe pas » quand le document existe et
 *     qu'il est public est le pire des deux résultats possibles ;
 *   · aucune branche à maintenir. La page ne DEMANDE jamais si le jeton est
 *     valide : elle le tend au compteur, qui ne trouve rien et n'écrit rien.
 *     Ce qui est perdu est une ouverture non attribuée, pas une visite.
 */

interface PlaquetteJetonProps {
  params: Promise<{ jeton: string }>;
  searchParams?: Promise<SearchParamsPlaquette>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return metadonneesPlaquette();
}

export async function generateViewport({ searchParams }: PlaquetteJetonProps): Promise<Viewport> {
  return viewportPlaquette(await searchParams, true);
}

export default async function PlaquetteJetonPage({ params, searchParams }: PlaquetteJetonProps) {
  const { jeton } = await params;

  const sp = await searchParams;
  const a4 = estA4(sp);
  const imprimer = veutImprimer(sp);

  // Best-effort et non attendu, comme sur le rapport : le compteur est un signal
  // commercial — « il l'a ouverte trois fois » vaut une relance — jamais une
  // raison de retarder l'affichage du document.
  //
  // Le `try` couvre ce que `marquerPlaquetteVue` ne peut pas couvrir : il avale
  // déjà toute panne de la base, mais `getServiceClient()` lève, lui, quand la
  // configuration manque. Un prospect qui a cliqué doit voir la plaquette,
  // jamais une page d'erreur produite par le compteur d'ouvertures.
  //
  // L'A4 NE COMPTE PAS, ET C'EST DEVENU CRITIQUE. Cette feuille est la NÔTRE :
  // on l'ouvre pour relire le document, et depuis que la plaquette part en PDF,
  // l'agent l'ouvre à CHAQUE envoi pour l'enregistrer. La compter attribuerait
  // au prospect une ouverture faite par nous — et `vueQ`, dans S2, aiguille sur
  // « a vu la plaquette » : chaque envoi aurait basculé le prospect vers l'appel
  // chaud sans qu'il ait rien lu.
  //
  // `?imprimer` NON PLUS, ET C'EST LE MÊME RAISONNEMENT PORTÉ AU MOBILE. Depuis
  // qu'on peut enregistrer le PDF au format téléphone, la demande d'impression
  // arrive sur une URL sans `?a4` : la tester seule aurait compté une ouverture
  // à chaque PDF mobile fabriqué, c'est-à-dire exactement le geste que l'A4 a
  // été exclu pour ne pas compter. Ce qui reste compté est ce qu'on n'a jamais
  // demandé nous-mêmes : le mobile nu, celui que le prospect ouvre.
  if (!a4 && !imprimer) {
    try {
      void marquerPlaquetteVue(getServiceClient(), jeton);
    } catch {
      /* mesure perdue, document servi */
    }
  }

  // Lue pour les DEUX formats depuis que le mobile est nominatif lui aussi. Les
  // deux requêtes qu'elle coûte sont le prix du nom et de la capture — c'est
  // tout l'intérêt du document.
  const prospect = await chargerProspectPlaquette(getServiceClient(), jeton);

  return <RenduPlaquette a4={a4} imprimer={imprimer} prospect={prospect} />;
}
