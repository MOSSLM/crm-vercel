/**
 * Le DNS du client pointe-t-il vraiment chez nous ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA ÉVITE
 * ─────────────────────────────────────────────────────────────────────────────
 * La bascule d'un domaine est le seul moment de la vie d'un site où l'échec est
 * SILENCIEUX des deux côtés : le CRM annonce le domaine comme rattaché, le
 * navigateur de l'opérateur affiche encore l'ancien site depuis son cache, et
 * personne ne voit que l'enregistrement A n'a jamais été modifié. On perd une
 * demi-journée à chercher côté application ce qui se joue chez le registrar.
 *
 * Une lecture DNS depuis le serveur tranche en deux secondes : ce que le monde
 * voit, pas ce que la machine de l'opérateur a mis en cache.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DNS-over-HTTPS, PAS LE MODULE `dns` DE NODE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raisonnement que `src/lib/email/verify/dns.ts`, et la même paire de
 * résolveurs : une requête HTTPS marche depuis une fonction Vercel sans socket
 * exotique, et la réponse ne dépend pas du résolveur de la machine hôte — donc
 * le verdict est reproductible d'un environnement à l'autre.
 *
 * Dans le doute (aucun résolveur ne répond), on ne conclut PAS. Déclarer un DNS
 * fautif à tort enverrait l'opérateur toucher une zone qui était bonne.
 */
import { CNAME_HEBERGEUR, IP_APEX_HEBERGEUR } from "@/lib/site-builder/domaine-client";

const NOERROR = 0;
const NXDOMAIN = 3;
const TYPE_A = 1;
const TYPE_CNAME = 5;

const RESOLVEURS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"] as const;
const TIMEOUT_MS = 4000;

interface ReponseDoh {
  Status?: number;
  Answer?: Array<{ name?: string; type?: number; data?: string }>;
}

async function interroger(nom: string, type: "A" | "CNAME"): Promise<ReponseDoh | null> {
  for (const resolveur of RESOLVEURS) {
    const url = `${resolveur}?name=${encodeURIComponent(nom)}&type=${type}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: controller.signal });
      if (!res.ok) continue;
      return (await res.json()) as ReponseDoh;
    } catch {
      // Résolveur muet ou trop lent : au suivant.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export interface ConstatDns {
  nom: string;
  /** Ce que le DNS répond réellement, pour l'afficher tel quel. */
  valeurs: string[];
  /** Vrai quand la valeur attendue est là. */
  conforme: boolean;
  /** Aucun résolveur n'a répondu : on ne conclut pas. */
  indetermine: boolean;
  /** Le nom n'existe pas du tout (NXDOMAIN). */
  absent: boolean;
}

export interface VerdictDns {
  domaine: string;
  apex: ConstatDns;
  /**
   * `null` quand le domaine rattaché est déjà un SOUS-domaine du client
   * (`pro.exemple.fr`) : `www.pro.exemple.fr` n'a aucune raison d'exister, et
   * l'exiger rendrait le verdict rouge pour toujours.
   */
  www: ConstatDns | null;
  /** Les noms attendus arrivent chez nous — la seule condition qui compte. */
  pret: boolean;
}

function vide(nom: string): ConstatDns {
  return { nom, valeurs: [], conforme: false, indetermine: true, absent: false };
}

async function constater(nom: string, attendus: string[]): Promise<ConstatDns> {
  // A ET CNAME : selon le registrar, `www` est l'un ou l'autre, et certains
  // aplatissent le CNAME de l'apex en A. Lire les deux évite de déclarer
  // fautive une zone parfaitement valable.
  const [a, cname] = await Promise.all([interroger(nom, "A"), interroger(nom, "CNAME")]);
  if (!a && !cname) return vide(nom);

  const nxdomain = (a?.Status === NXDOMAIN || a === null) && (cname?.Status === NXDOMAIN || cname === null);
  const statutLu = a?.Status === NOERROR || cname?.Status === NOERROR || a?.Status === NXDOMAIN || cname?.Status === NXDOMAIN;

  const valeurs = [...(a?.Answer ?? []), ...(cname?.Answer ?? [])]
    .filter((r) => r.type === TYPE_A || r.type === TYPE_CNAME)
    .map((r) => (r.data ?? "").trim().replace(/\.$/, "").toLowerCase())
    .filter(Boolean);

  const conforme = valeurs.some((v) => attendus.some((attendu) => v === attendu || v.endsWith(`.${attendu}`)));
  return {
    nom,
    valeurs: [...new Set(valeurs)],
    conforme,
    indetermine: !statutLu,
    absent: nxdomain && statutLu,
  };
}

/**
 * Lit l'apex et le `www` du domaine et dit si les deux arrivent chez nous.
 *
 * `www` est vérifié même quand on compte le rediriger : la redirection se fait
 * chez l'hébergeur, donc il faut que le nom lui parvienne. C'est l'oubli le
 * plus fréquent de la bascule — le domaine nu marche, `www.` rend une erreur de
 * certificat, et c'est l'adresse que la moitié des gens tape.
 */
export async function verifierDnsDomaine(domaine: string): Promise<VerdictDns> {
  const hote = domaine.replace(/^www\./, "");
  const attendus = [IP_APEX_HEBERGEUR, CNAME_HEBERGEUR];
  // Même distinction que `enregistrementsDns` : un sous-domaine du client n'a
  // qu'un seul nom à vérifier.
  const estSousDomaine = hote.split(".").length > 2;

  const [apex, www] = await Promise.all([
    constater(hote, attendus),
    estSousDomaine ? Promise.resolve(null) : constater(`www.${hote}`, attendus),
  ]);
  return { domaine: hote, apex, www, pret: apex.conforme && (www === null || www.conforme) };
}
