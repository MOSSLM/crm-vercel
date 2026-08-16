import { getAppUrl } from "@/lib/app-url";

/**
 * Le lien de la plaquette, et le diagnostic qui va avec.
 *
 * POURQUOI CES TROIS CHOSES VIVENT À PART DE `plaquette.ts`. Elles sont les
 * seules dont l'ÉCRAN ait besoin : la barre de sélection du board annonce une
 * migration manquante, la fiche de démarchage colle le lien collectif. Or ces
 * deux surfaces sont des composants `"use client"`, et `plaquette.ts` importe le
 * moteur de rendu de l'audit (`htmlMobile`, `htmlShared`, le catalogue d'offres)
 * — l'y appeler depuis le navigateur embarquerait tout le document dans le
 * bundle pour construire une chaîne de caractères.
 *
 * Ce fichier est donc une FEUILLE, et doit le rester : rien d'autre que
 * `getAppUrl`. `plaquette.ts` réexporte tout ce qu'il y a ici, pour que le côté
 * serveur continue de n'avoir qu'un seul endroit où regarder.
 */

/** Le format que la base produit : 16 octets en hexadécimal. */
export const FORME_JETON = /^[a-f0-9]{16,64}$/i;

/**
 * L'URL publique d'une plaquette. Sans jeton, le lien collectif — celui qu'on
 * colle dans un WhatsApp quand la sélection n'a pas été préparée.
 *
 * Sur l'hôte du CRM et non sur `rapport.{SITE_DOMAIN}` : ce sous-domaine sert le
 * groupe `/rapport`, et l'y héberger demanderait une entrée dans
 * `PUBLIC_SUBDOMAINS` — c'est-à-dire un label de plus interdit aux sites
 * clients, pour une page qui n'a rien de confidentiel à cacher.
 *
 * Personne ne recompose ce chemin à la main. Il est parti par WhatsApp chez des
 * prospects : le jour où il bouge, il doit bouger partout d'un seul geste.
 */
export function urlPlaquette(jeton?: string | null): string {
  return `${getAppUrl()}/plaquette${jeton ? `/${jeton}` : ""}`;
}

/**
 * La migration `sql/20260816_plaquettes_par_prospect.sql` manque-t-elle ?
 *
 * Une migration non jouée se corrige en jouant un fichier, une panne se
 * débogue : les deux ne méritent pas le même message. « Could not find the
 * function assurer_jetons_plaquette » envoie chercher un bug dans le code.
 */
export const fonctionPlaquetteAbsente = (
  erreur: { code?: string; message?: string } | null,
): boolean => {
  if (!erreur) return false;
  // PGRST202 = fonction absente du cache PostgREST ; 42883 = undefined_function
  // quand l'appel passe par SQL direct.
  return (
    erreur.code === "PGRST202" ||
    erreur.code === "42883" ||
    /could not find the function|does not exist/i.test(erreur.message ?? "")
  );
};

/** Le message qui dit quoi faire, plutôt que ce qui a cassé. */
export const MESSAGE_MIGRATION_PLAQUETTE =
  "sql/20260816_plaquettes_par_prospect.sql n'est pas appliquée";
