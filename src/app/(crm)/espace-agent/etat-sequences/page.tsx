import { EtatSequences } from "@/components/prospection/EtatSequences";

/**
 * Le pendant agent : même écran, périmètre restreint aux inscriptions qu'il a
 * lancées (cf. `/api/agent/sequences/etat`). `requireRole` exige un rôle exact,
 * d'où la route jumelle plutôt qu'un paramètre.
 */
export default function Page() {
  return <EtatSequences endpoint="/api/agent/sequences/etat" />;
}
