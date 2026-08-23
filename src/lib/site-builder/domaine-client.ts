/**
 * Rattacher le domaine du client au site — la validation, et rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE QUE CE MODULE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `published_domain` et `published_subdomain` ne sont PAS deux façons d'écrire
 * la même chose : le routage les lit par des chemins différents.
 * `deciderDestination` (src/lib/site-domain.ts) reconnaît d'abord un
 * sous-domaine de chez nous et rend le LABEL comme segment ; le résolveur
 * cherche alors dans `published_subdomain`. Un hôte extérieur, lui, passe
 * entier et se cherche dans `published_domain`.
 *
 * Conséquence : écrire « client.samadigitalstudio.fr » dans `published_domain`
 * produit une ligne que RIEN ne peut résoudre. Le site est annoncé en ligne
 * dans le CRM, l'hôte répond 404, et le journal serveur est vide — c'est la
 * même famille de panne que le doublon de domaine réglé par la migration
 * 20260812. La route de rattachement ne validait rien : elle passait la saisie
 * telle quelle à `publishSite`, qui normalise sans juger (et le documente).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON REFUSE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *   - un sous-domaine de SITE_DOMAIN            → irrésoluble (ci-dessus)
 *   - un hôte d'infrastructure (*.vercel.app…)  → sert l'app, pas un site
 *   - « localhost », une IP nue                 → jamais un domaine de client
 *   - tout ce qui n'a pas la forme d'un domaine → saisie libre
 *
 * On ACCEPTE en revanche un sous-domaine du client (« www2.exemple.fr »,
 * « pro.exemple.fr ») : c'est son domaine, il en fait ce qu'il veut.
 */
import { canonicalizeDomain } from "@/lib/url-canonical";
import { isPlausibleDomain } from "@/lib/archive/reasons";
import { SITE_DOMAIN, isInfrastructureHost, normalizeHost } from "@/lib/site-domain";

export type VerdictDomaine =
  | { ok: true; domaine: string }
  | { ok: false; erreur: string };

/**
 * Normalise et juge une saisie opérateur.
 *
 * La forme rendue est celle que la base compare à la lecture : minuscules,
 * sans protocole, sans `www.`, sans chemin, sans port — miroir exact de
 * `canonicalizeDomain`, qui est aussi ce que la migration a appliqué aux
 * valeurs déjà stockées.
 */
export function normaliserDomaineClient(saisie: string | null | undefined, siteDomain: string = SITE_DOMAIN): VerdictDomaine {
  const brut = (saisie ?? "").trim();
  if (!brut) return { ok: false, erreur: "Indique le domaine du client." };

  const domaine = canonicalizeDomain(brut);
  if (!domaine) return { ok: false, erreur: "Domaine illisible." };

  if (!isPlausibleDomain(domaine)) {
    return { ok: false, erreur: `« ${domaine} » n'a pas la forme d'un domaine (exemple : plomberie-dupont.fr).` };
  }

  const hote = normalizeHost(domaine);
  if (hote === siteDomain || hote.endsWith(`.${siteDomain}`)) {
    return {
      ok: false,
      erreur:
        `« ${hote} » est une adresse de chez nous, pas un domaine client. ` +
        `Un sous-domaine de ${siteDomain} se règle par le champ « sous-domaine » de la publication.`,
    };
  }

  if (isInfrastructureHost(hote)) {
    return { ok: false, erreur: `« ${hote} » est un hôte d'infrastructure : il sert l'application, pas un site client.` };
  }

  return { ok: true, domaine: hote };
}

/**
 * Les enregistrements DNS à donner au client.
 *
 * Valeurs par défaut = celles que Vercel affiche aujourd'hui dans
 * Settings → Domains. Elles sont surchargées par variable d'environnement
 * parce que ce sont les valeurs D'UN HÉBERGEUR, pas une constante du monde :
 * les recopier en dur ici, c'est signer pour un jour où elles changeront et où
 * plus personne ne saura d'où sortait le chiffre. L'écran de rattachement
 * affiche toujours, à côté, « vérifie dans Vercel ».
 */
export const IP_APEX_HEBERGEUR = process.env.NEXT_PUBLIC_DNS_APEX_IP ?? "76.76.21.21";
export const CNAME_HEBERGEUR = process.env.NEXT_PUBLIC_DNS_CNAME ?? "cname.vercel-dns.com";

export interface EnregistrementDns {
  type: "A" | "CNAME";
  nom: string;
  valeur: string;
  pourquoi: string;
}

/**
 * Ce que le client doit poser chez son registrar.
 *
 * DEUX CAS, ET LES CONFONDRE CASSE UNE ZONE. Un domaine nu
 * (`plomberie-dupont.fr`) demande un `A` sur `@` plus un `CNAME` sur `www`. Un
 * SOUS-domaine (`pro.exemple.fr` — accepté, c'est le domaine du client et il en
 * fait ce qu'il veut) ne demande qu'un `CNAME` sur son propre label. Servir la
 * consigne du domaine nu dans ce cas-là ferait pointer l'apex `exemple.fr` chez
 * nous, c'est-à-dire déplacer le site principal du client, et le `CNAME www`
 * enverrait `www.exemple.fr` sur un site qui n'est pas le sien. Deux pannes en
 * dehors du périmètre demandé, causées par un écran qui avait l'air sûr de lui.
 */
export function enregistrementsDns(domaine: string): EnregistrementDns[] {
  const hote = domaine.replace(/^www\./, "");
  const labels = hote.split(".");
  // Deux labels = un domaine nu. Trois ou plus = un sous-domaine du client.
  // Approximation assumée : `exemple.co.uk` sera traité comme un sous-domaine.
  // Elle penche du bon côté — un `CNAME` sur le label est servi correctement
  // par Vercel dans les deux cas, alors qu'un `A` sur `@` mal placé casse.
  const estSousDomaine = labels.length > 2;

  if (estSousDomaine) {
    return [
      {
        type: "CNAME",
        nom: labels[0],
        valeur: CNAME_HEBERGEUR,
        pourquoi: `Fait pointer ${hote} sur l'hébergement du site. Ne touche pas au reste de la zone ${labels.slice(1).join(".")} : le site principal du client continue de vivre sa vie.`,
      },
    ];
  }

  return [
    {
      type: "A",
      nom: "@",
      valeur: IP_APEX_HEBERGEUR,
      pourquoi: `Fait pointer ${hote} (le domaine nu) sur l'hébergement du site.`,
    },
    {
      type: "CNAME",
      nom: "www",
      valeur: CNAME_HEBERGEUR,
      pourquoi: `Fait pointer www.${hote}. À ajouter MÊME si on redirige www vers le domaine nu : la redirection se fait chez l'hébergeur, elle a besoin que le nom arrive jusqu'à lui.`,
    },
  ];
}
