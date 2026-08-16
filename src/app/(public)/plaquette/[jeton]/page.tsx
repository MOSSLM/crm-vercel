import React from "react";
import type { Metadata, Viewport } from "next";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { marquerPlaquetteVue } from "@/lib/audit/plaquette";
import {
  estA4,
  metadonneesPlaquette,
  RenduPlaquette,
  viewportPlaquette,
  type SearchParamsPlaquette,
} from "../rendu";

/**
 * La plaquette d'un prospect : `/plaquette/{jeton}`.
 *
 * MÊME DOCUMENT, MOT POUR MOT. Le jeton ne personnalise rien et ne doit rien
 * personnaliser : la plaquette est le dépliant de la cohorte sans site, et le
 * jour où elle nommerait son lecteur, il faudrait vérifier trois cents fois
 * qu'elle le nomme bien. Il sert à une seule chose : savoir QUI a ouvert.
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
  return viewportPlaquette(await searchParams);
}

export default async function PlaquetteJetonPage({ params, searchParams }: PlaquetteJetonProps) {
  const { jeton } = await params;

  // Best-effort et non attendu, comme sur le rapport : le compteur est un signal
  // commercial — « il l'a ouverte trois fois » vaut une relance — jamais une
  // raison de retarder l'affichage du document.
  //
  // Le `try` couvre ce que `marquerPlaquetteVue` ne peut pas couvrir : il avale
  // déjà toute panne de la base, mais `getServiceClient()` lève, lui, quand la
  // configuration manque. Un prospect qui a cliqué doit voir la plaquette,
  // jamais une page d'erreur produite par le compteur d'ouvertures.
  try {
    void marquerPlaquetteVue(getServiceClient(), jeton);
  } catch {
    /* mesure perdue, document servi */
  }

  return <RenduPlaquette a4={estA4(await searchParams)} />;
}
