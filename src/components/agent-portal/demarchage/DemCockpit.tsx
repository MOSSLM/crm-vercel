"use client";

import { Icon } from "./DemIcon";
import { urlRechercheGoogle, requeteGoogle } from "./recherche";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { lienNonMesure } from "@/lib/analytics/trafic-interne";
import { normaliserUrlSite, ETAT_SITE_LABEL, type EtatSite } from "@/lib/agent-portal/etat-site";
import type { CompanySite } from "./types";

/**
 * LE COCKPIT DE L'APPEL — ce qu'on a sous les yeux pendant que ça sonne.
 *
 * LE GRIEF
 * Un appel se mène avec trois pages ouvertes : la démo qu'on a faite pour lui,
 * le site qu'il a aujourd'hui, et la recherche Google de son nom. Elles étaient
 * atteignables, mais dispersées — la démo derrière une case à cocher du
 * composeur de message (donc invisible sur une carte d'appel), le site et
 * Google dans l'en-tête, à deux blocs de scroll du bouton « Appeler ». On
 * cherche ses onglets pendant que l'artisan décroche.
 *
 * CE N'EST PAS UN DOUBLON DE LA LIGNE « SITE » DE L'EN-TÊTE
 * Elle POSE un constat : un champ, un enregistrement, une case « aucun site »
 * qui écrit dans `constats_presence`. Celui-ci n'écrit rien, il OUVRE. Les deux
 * gestes se font au même moment et ne se remplacent pas : on regarde d'abord,
 * on tranche ensuite. Ils partagent la même requête Google (`recherche.ts`)
 * pour ne pas pouvoir rendre deux pages différentes.
 *
 * AUCUNE TUILE MORTE, ET C'EST LA RÈGLE DU FICHIER
 * Une tuile n'apparaît que si elle mène quelque part — sauf le site, qui
 * s'affiche même absent parce que « il n'a rien en ligne » est précisément ce
 * qu'on veut savoir avant de parler, et que le silence se lirait comme un
 * oubli. Sur un appel à froid sans démo, le cockpit se réduit donc à deux
 * tuiles, et c'est la bonne taille.
 *
 * UN BROUILLON SE REGARDE, IL NE S'ENVOIE PAS
 * La case « joindre la démo » du composeur ne s'arme que sur une démo publiée —
 * la règle est juste, on n'envoie pas un chantier. Ici l'adresse d'aperçu
 * (`{siteId}.{SITE_DOMAIN}`, ce que rend `demoShareUrl`) est ouverte quand
 * même : savoir où en est sa démo au moment de l'appeler change ce qu'on lui
 * promet. La tuile dit « brouillon » pour qu'on ne lise pas l'un pour l'autre.
 *
 * ⚠️ OUVRIR NE DOIT RIEN MESURER — C'EST LA RÈGLE QUI A COÛTÉ DEUX TUILES.
 * Tout ce que le CRM ouvre chez nous passe par `lienNonMesure()` : sans lui,
 * GA4 compte la visite de l'AGENT comme celle du prospect, `scoreIntent` y voit
 * un retour, et la fiche remonte « 🔥 à rappeler aujourd'hui » — au moment
 * précis où l'agent l'a au téléphone, donc là où l'erreur est invisible. La
 * tuile « Sa démo » l'emploie.
 *
 * Deux tuiles ont donc été RETIRÉES plutôt que corrigées : l'audit et la
 * plaquette. Leurs compteurs (`rapport_public_vu`, `plaquette_vue`) sont
 * incrémentés CÔTÉ SERVEUR à l'ouverture de la page, sans pixel — et
 * `lienNonMesure` ne pose qu'un paramètre d'URL que ces routes ne lisent pas.
 * Aucune façon de les ouvrir sans écrire. Or ce sont exactement ces compteurs
 * que lit la condition `plaquette_vue` de S2, celle qui décide qu'un prospect
 * est chaud : un agent qui relit la plaquette pendant l'appel fabriquerait le
 * signal qu'il est en train de vérifier. Elles se rouvrent depuis la fiche,
 * hors de la carte d'appel, où le geste est délibéré.
 */

/** Une tuile du cockpit, sous sa forme donnée — le rendu n'en décide rien. */
type Oeil = {
  key: string;
  ic: string;
  /** Ce qu'on va voir. */
  lb: string;
  /** L'état de la chose, en deux mots — jamais l'URL, qui ne tient pas. */
  sub: string;
  /** `null` = rien à ouvrir : la tuile s'affiche éteinte, avec sa raison. */
  href: string | null;
  title: string;
};

export function DemCockpit({
  nom,
  ville,
  /** L'adresse du site DU PROSPECT, telle qu'elle est en base. */
  siteUrl,
  etatSite,
  /** La démo qu'on lui a fabriquée, publiée ou non. */
  site,
}: {
  nom: string | null;
  ville: string | null;
  siteUrl: string | null;
  etatSite: EtatSite;
  site: CompanySite;
}) {
  const yeux: Oeil[] = [];

  // ── SA DÉMO ── en premier : c'est l'objet de l'appel.
  if (site) {
    const url = demoShareUrl(site);
    const enLigne = site.is_published === true;
    yeux.push({
      key: "demo",
      ic: "sparkles",
      lb: "Sa démo",
      sub: enLigne ? "en ligne" : "brouillon",
      // `lienNonMesure` : notre visite ne doit pas devenir la sienne.
      href: lienNonMesure(url),
      title: enLigne
        ? `Ouvrir la démo publiée — ${url}`
        : `Ouvrir l'aperçu du brouillon — ${url}. À regarder, pas à envoyer.`,
    });
  }

  // ── SON SITE ── la seule tuile qui reste quand elle est vide : « il n'a rien »
  // est une information d'appel, pas une absence d'information.
  const lienSite = normaliserUrlSite(siteUrl);
  yeux.push({
    key: "site",
    ic: "globe",
    lb: "Son site",
    sub: lienSite ? hoteLisible(lienSite) : ETAT_SITE_LABEL[etatSite],
    href: lienSite,
    title: lienSite
      ? `Ouvrir le site du prospect — ${lienSite}`
      : "Aucune adresse ouvrable en base. La ligne « Site » de l'en-tête sert à en poser une.",
  });

  // ── GOOGLE ── nom + ville, la recherche qu'un humain fait en composant.
  const google = urlRechercheGoogle(nom, ville);
  if (google) {
    yeux.push({
      key: "google",
      ic: "eye",
      lb: "Google",
      sub: ville?.trim() ? "nom + ville" : "nom seul",
      href: google,
      title: `Chercher « ${requeteGoogle(nom, ville)} » sur Google (nouvel onglet)`,
    });
  }

  return (
    <div className="dm-eyes" role="group" aria-label="À ouvrir pendant l'appel">
      {yeux.map((o) =>
        o.href ? (
          <a
            key={o.key}
            className="dm-eye"
            href={o.href}
            target="_blank"
            rel="noopener noreferrer"
            title={o.title}
          >
            <span className="ic">
              <Icon name={o.ic} className="ico-sm" />
            </span>
            <span className="tx">
              <b>{o.lb}</b>
              <i>{o.sub}</i>
            </span>
            <Icon name="ext" className="ico-xs op" />
          </a>
        ) : (
          <span key={o.key} className="dm-eye" data-off="1" title={o.title}>
            <span className="ic">
              <Icon name={o.ic} className="ico-sm" />
            </span>
            <span className="tx">
              <b>{o.lb}</b>
              <i>{o.sub}</i>
            </span>
          </span>
        ),
      )}
    </div>
  );
}

/**
 * L'hôte sans `www.`, pour tenir sur une tuile.
 *
 * L'URL complète déborde et se fait couper au milieu du domaine — donc au seul
 * endroit qu'on lit. `URL` ne jette pas ici : l'adresse vient d'être validée
 * par `normaliserUrlSite`, mais le `try` reste, parce qu'une tuile ne doit
 * jamais faire tomber la carte d'appel.
 */
function hoteLisible(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
