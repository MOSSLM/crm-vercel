"use client";

import { TachesTableau } from "@/components/prospection/TachesTableau";

/**
 * Le tableau des tâches de l'agent, avec ses vues enregistrées.
 *
 * `vues_taches.agent_id` existait depuis le 19/08 sans écran pour l'écrire :
 * c'est ici que « Mes appels du jour » devient un objet qui lui appartient. Les
 * vues d'équipe (agent_id nul) restent visibles — un actif partagé ne se
 * cloisonne pas — mais ne se modifient pas.
 *
 * Il n'a pas le geste « changer d'agent » : la réattribution est le filet de
 * sécurité de l'admin.
 */
export default function AgentTachesPage() {
  return <TachesTableau perimetre="agent" />;
}
