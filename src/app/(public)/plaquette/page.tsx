import React from "react";
import type { Metadata, Viewport } from "next";
import {
  estA4,
  metadonneesPlaquette,
  RenduPlaquette,
  veutImprimer,
  viewportPlaquette,
  type SearchParamsPlaquette,
} from "./rendu";

/**
 * La plaquette collective : `/plaquette`, sans jeton, en accès libre.
 *
 * ELLE RESTE, ET CE N'EST PAS UNE COMPATIBILITÉ ASCENDANTE. C'est le lien qu'un
 * commercial colle dans une conversation WhatsApp qu'il n'avait pas préparée :
 * un prospect rappelle, il faut lui envoyer quelque chose maintenant, personne
 * ne va ouvrir le CRM pour fabriquer un jeton d'abord. La version à jeton
 * (`/plaquette/{jeton}`) est celle des envois préparés en lot, et elle rend
 * exactement le même document — cf. `rendu.tsx`.
 *
 * Ce qu'on perd sur cette URL-ci, et qu'il faut savoir en la collant : une
 * ouverture n'est rattachée à personne. Elle n'alimente donc pas l'étage
 * « document ouvert » de l'entonnoir de campagne.
 *
 * ELLE VIT DANS LE GROUPE `(public)`, et pas seulement pour hériter d'une page
 * sans le chrome du CRM : le layout du groupe monte `<PublicAnalytics/>`, donc
 * GA4 enregistre chaque ouverture. Sortir de ce groupe rendrait la cohorte B
 * non mesurable, sans autre symptôme qu'un entonnoir plat.
 *
 * `force-dynamic` : les prix sont relus du catalogue à chaque ouverture. Une
 * page mise en cache annoncerait le tarif du jour où elle a été rendue, ce qui
 * est exactement le défaut que la plaquette existe pour éviter.
 */

interface PlaquetteProps {
  searchParams?: Promise<SearchParamsPlaquette>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return metadonneesPlaquette();
}

export async function generateViewport({ searchParams }: PlaquetteProps): Promise<Viewport> {
  return viewportPlaquette(await searchParams);
}

export default async function PlaquettePubliquePage({ searchParams }: PlaquetteProps) {
  const sp = await searchParams;
  // `prospect={null}` ÉCRIT PLUTÔT QU'OMIS, et c'est le verrou : sans jeton on ne
  // sait pas à qui on parle, donc le document ne peut pas nommer quelqu'un. Le
  // dire explicitement rend les deux routes littéralement comparables — c'est ce
  // que vérifie `page-jeton.test.tsx`, et un défaut implicite lui échapperait.
  return <RenduPlaquette a4={estA4(sp)} imprimer={veutImprimer(sp)} prospect={null} />;
}
