// probe.ts — la porte laissée ouverte pour la sonde SMTP.
//
// Le contrôle qu'on aimerait tous faire : ouvrir une session SMTP avec le
// serveur du prospect, annoncer `RCPT TO:<jean@garage-dupont.fr>`, lire sa
// réponse, raccrocher sans jamais envoyer de message. Un `550` dirait « cette
// boîte n'existe pas », un `250` dirait le contraire.
//
// Pourquoi ce n'est PAS branché par défaut — trois obstacles, tous réels :
//
//   1. le port 25 sortant est bloqué chez Vercel, et selon toute vraisemblance
//      chez Supabase aussi (AWS le ferme par défaut). Sans lui, rien à faire ;
//   2. une IP de cloud sans enregistrement PTR se fait rejeter ou mettre en
//      quarantaine (greylisting) par la plupart des serveurs sérieux — la
//      réponse obtenue ne parlerait alors pas de la boîte, mais de nous ;
//   3. et surtout : chez les mutualisés français (OVH, Ionos, o2switch), le
//      serveur répond `250` à TOUTES les adresses. La sonde ne prouverait rien
//      là où on en aurait le plus besoin.
//
// C'est exactement pour cette raison que les librairies de validation « avec
// vérification SMTP » se trompent si souvent : elles transforment un `250`
// automatique en « adresse valide ».
//
// L'interface existe donc, l'implémentation non. Le jour où une sonde est
// disponible (Edge Function Deno, machine avec port 25 ouvert), il suffit de
// l'enregistrer ici — le reste de la chaîne ne bouge pas.
//
// Règle intangible si une sonde est branchée un jour : le `MAIL FROM` doit
// utiliser un DOMAINE JETABLE DÉDIÉ, jamais le domaine d'envoi réel. Une sonde
// qui se présente sous notre nom fait remonter des refus à notre réputation,
// c'est-à-dire exactement l'inverse de ce qu'on cherche.

/**
 * Ce qu'une sonde peut honnêtement rendre.
 *
 * `unknown` n'est pas un échec : c'est la réponse correcte sur un serveur
 * catch-all ou en quarantaine. Une sonde qui ne rend jamais `unknown` ment.
 */
export type ProbeVerdict = 'accepted' | 'rejected' | 'unknown'

export interface MailboxProbe {
  /** Nom affiché dans les réglages et les journaux. */
  readonly name: string
  /**
   * @param email   adresse normalisée à tester
   * @param mxHosts serveurs mail du domaine, par préférence croissante
   */
  probe(email: string, mxHosts: readonly string[]): Promise<ProbeVerdict>
}

let active: MailboxProbe | null = null

/** Branche une sonde. Appelé au démarrage, jamais en cours de route. */
export function registerProbe(probe: MailboxProbe | null): void {
  active = probe
}

export const activeProbe = (): MailboxProbe | null => active

/**
 * Interroge la sonde si elle existe. Sans sonde — le cas par défaut — rend
 * `unknown`, et la chaîne de vérification continue exactement comme si de rien
 * n'était : aucune décision ne repose sur ce contrôle.
 */
export async function probeMailbox(email: string, mxHosts: readonly string[]): Promise<ProbeVerdict> {
  if (!active || mxHosts.length === 0) return 'unknown'
  try {
    return await active.probe(email, mxHosts)
  } catch {
    // Une sonde qui échoue ne condamne personne.
    return 'unknown'
  }
}
