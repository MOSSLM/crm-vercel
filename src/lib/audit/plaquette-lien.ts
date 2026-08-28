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
 * Le format du PDF qu'on va enregistrer. Les deux existent depuis que le
 * document nominatif a sa maquette mobile paginée (`plaquette-mobile.gabarit`,
 * sept écrans de 430 × 932 px avec leur `@page`) : ce n'est plus l'A4 réduit
 * sur un téléphone, c'est un autre document.
 */
export type FormatImpressionPlaquette = "a4" | "mobile";

/**
 * La même plaquette avec la boîte d'impression qui s'ouvre — d'où l'on choisit
 * « Enregistrer en PDF ».
 *
 * DEUX FORMATS, ET LE CHOIX APPARTIENT À L'AGENT. L'A4 se joint à un mail et se
 * lit sur un écran d'ordinateur ; le mobile sort sept pages au format téléphone,
 * qui est ce qu'un prospect reçoit dans WhatsApp — un A4 y arrive en vignette
 * illisible qu'il faut pincer pour lire. Le défaut reste l'A4 : c'est le
 * document que les surfaces existantes envoient déjà, et le changer en silence
 * changerait ce que le démarchage joint à ses mails.
 *
 * POURQUOI CE N'EST PAS UN FICHIER QU'ON FABRIQUE. Le CRM ne produit aucun PDF :
 * aucune librairie n'est installée, et Chromium ne tient pas dans une fonction
 * Vercel (cf. l'en-tête de `src/app/(public)/plaquette/rendu.tsx`). Le bouton
 * « Exporter PDF » de l'éditeur d'audit fait exactement pareil depuis toujours —
 * une fenêtre, le document, `window.print()`. On reprend cette mécanique plutôt
 * que d'en inventer une seconde qui rendrait un autre document.
 *
 * CONSÉQUENCE À CONNAÎTRE : il reste UN clic à l'agent, « Enregistrer », dans la
 * boîte du navigateur. C'est le prix d'une plaquette dont les tarifs sont relus
 * à chaque ouverture plutôt que figés dans un fichier stocké.
 */
export function urlPlaquetteImprimable(
  url: string,
  format: FormatImpressionPlaquette = "a4",
): string {
  const sep = url.includes("?") ? "&" : "?";
  // `?a4` sert la feuille, son absence sert le mobile : le format ne se dit donc
  // que dans un sens, et `?imprimer` seul EST la demande d'un PDF mobile.
  return `${url}${sep}${format === "a4" ? "a4&imprimer" : "imprimer"}`;
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

/**
 * Le jeton de plaquette contenu dans un message, ou `null`.
 *
 * POURQUOI ON LE RELIT DU TEXTE PLUTÔT QUE DE LE PASSER EN CHAMP. Le message
 * d'une tâche est rendu par le moteur, qui y a déjà résolu
 * `{{company.plaquette_url}}` en une URL à jeton. La présence de ce lien dans
 * le corps EST le fait qu'une plaquette part — pas un drapeau à poser en plus,
 * qui pourrait dire le contraire du message qu'il accompagne. Une étape dont on
 * retire le lien cesse donc d'emporter le PDF, sans qu'on ait à y penser.
 *
 * Le lien COLLECTIF (`/plaquette` sans jeton) rend `null`, et c'est voulu : il
 * ne désigne personne, donc il n'y a pas de document nominatif à fabriquer.
 *
 * On accepte n'importe quel hôte. Le CRM a déjà changé de domaine une fois, et
 * de vieux messages en base portent l'ancien : n'accepter que l'hôte courant
 * ferait échouer la relecture sur exactement les tâches les plus anciennes.
 */
export function jetonDansLeTexte(texte: string | null | undefined): string | null {
  const m = /\/plaquette\/([a-f0-9]{16,64})\b/i.exec(texte ?? "");
  return m ? m[1].toLowerCase() : null;
}

/**
 * L'adresse du PDF de la plaquette d'un prospect.
 *
 * Relatif, jamais absolu : il est demandé depuis le CRM par un agent connecté,
 * et un lien absolu vers la production téléchargerait le document de PROD
 * pendant une recette. Le nom du fichier est décidé côté serveur — c'est lui
 * qui connaît le nom de l'entreprise.
 */
export const urlPdfPlaquette = (jeton: string): string =>
  `/api/agent/plaquette/${encodeURIComponent(jeton)}/pdf`;
