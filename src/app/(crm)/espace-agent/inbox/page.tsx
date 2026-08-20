"use client";

import { Conversations } from "@/components/prospection/Conversations";

/**
 * L'inbox de l'agent — le MÊME écran que celui de l'admin, filtré.
 *
 * `perimetre="agent"` ne change qu'une chose : la route lue. Le mur est posé
 * côté serveur (`entreprises.owner_id`), jamais ici — un filtre d'écran n'est
 * pas une sécurité, c'est une commodité d'affichage.
 *
 * Et c'est ici que se règle le grief « je ne vois pas les notes de Bilal », vu
 * depuis l'autre bout : le fil porte TOUS les auteurs, le filtre porte sur
 * l'entreprise. Un coéquipier qui note « rappeler en septembre » sur une de mes
 * fiches, je le lis.
 */
export default function AgentInboxPage() {
  return <Conversations perimetre="agent" />;
}
