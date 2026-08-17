#!/usr/bin/env node
/**
 * Le dossier web d'une entreprise, monté en local, avant toute décision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 17/08, le propriétaire ouvre la première opportunité venue — ITSI LIARD,
 * Saint-Sulpice-sur-Risle — tape « ITSI LIARD saint sulpice » dans un moteur, et
 * tombe en trois secondes sur itsi-liard-chauffage.fr. Le CRM, lui, la classait
 * « sans site ». Trois secondes de recherche valaient mieux que tout notre
 * enrichissement automatique.
 *
 * Le geste est court mais il ne passe pas à l'échelle : 579 fiches de cohorte,
 * c'est deux jours pleins de copier-coller. Ce script fait la partie mécanique —
 * chercher, ramasser, sonder, ranger — et s'arrête là. Il NE DÉCIDE RIEN et
 * N'ÉCRIT RIEN en base : il produit un dossier par entreprise, avec les preuves
 * en clair, pour qu'un humain (ou moi) tranche en dix secondes au lieu de dix
 * minutes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RAMASSE, ET POURQUOI PAS DEPUIS GOOGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * La demande était « le HTML de la première page Google ». Vérifié le 17/08 :
 * Google ne le rend plus. Une requête sans navigateur reçoit bien un HTTP 200 et
 * 92 ko de page — mais c'est une coquille JavaScript, zéro <h3>, zéro lien de
 * résultat. Passer outre demanderait un navigateur piloté, donc des CAPTCHA à
 * résoudre : hors de question, et de toute façon increvable à 579 fiches.
 *
 * La demande se décompose en deux, et chaque moitié a une meilleure source :
 *
 *   1. « prendre le site sur la fiche Google si elle y est »
 *      → l'API Places officielle. C'est LA source de la fiche Google Business :
 *        site déclaré, note, nombre d'avis, téléphone, adresse, statut d'activité.
 *        Pas de scraping, pas de blocage, et la clé est déjà dans .env.local.
 *        Sur ITSI LIARD elle répond exactement ce qui avait été observé à l'œil :
 *        fiche présente, OPERATIONAL, aucun `websiteUri`, aucun avis.
 *
 *   2. « les URL, titres et meta descriptions de la première page »
 *      → un moteur qui rend encore du HTML. DuckDuckGo par défaut (aucune clé,
 *        aucun quota, et il sort le bon site en 1ʳᵉ position sur le cas témoin).
 *        Si `GOOGLE_CSE_ID` est renseigné, on prend l'API Google Custom Search à
 *        la place : ce sont alors les vrais résultats Google, légalement, mais
 *        c'est facturé au-delà du quota gratuit.
 *
 *   3. Et une troisième chose que personne n'avait demandée mais qui tranche la
 *      question : la SONDE. Le titre et la meta description d'un résultat de
 *      moteur sont ceux que le moteur a mis en cache. On va donc chercher la
 *      page d'accueil de chaque candidat pour de vrai : code HTTP, URL finale
 *      après redirections, <title>, <meta description>, et si le nom de
 *      l'entreprise ou son téléphone apparaissent dans la page. C'est ce qui
 *      distingue « un domaine qui ressemble au nom » de « c'est bien eux ».
 *      C'est aussi ce qui rattrape nos notes à 0 : un 403 n'est pas un site mort.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT LE JOUER
 * ─────────────────────────────────────────────────────────────────────────────
 *   node scripts/prospection/dossier-web.mjs --cohorte B --limite 20
 *   node scripts/prospection/dossier-web.mjs --ids 1234,5678
 *   node scripts/prospection/dossier-web.mjs --cohorte A --refaire
 *   node scripts/prospection/dossier-web.mjs --recap        (recompose le récap)
 *
 * Il est REPRENABLE : une entreprise déjà traitée est sautée, sauf `--refaire`.
 * On peut donc l'arrêter au clavier et le relancer sans rien perdre.
 *
 * Sortie, dans `.prospection/dossiers` (ignoré par git — 579 fichiers n'ont rien
 * à faire dans l'historique) :
 *   <id>-<nom>.md   le dossier lisible, un par entreprise
 *   _index.jsonl    la même chose en machine, une ligne par entreprise
 *   _RECAP.md       le tableau de tête : ce qui est proposé, ce qui reste à voir
 *   _brut/          les HTML bruts, pour pouvoir revérifier sans relancer
 *
 * Rien n'est écrit en base. La décision — ajouter l'URL, enrichir, qualifier —
 * se prend après lecture, ailleurs.
 */

import { mkdir, readFile, writeFile, readdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const RACINE = process.cwd();

// ═════════════════════════════════════════════════════════════════════════════
// Configuration
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `.env.local` lu à la main plutôt qu'avec dotenv : ce script doit tourner sans
 * `npm install`, y compris depuis un dossier où les dépendances ne sont pas
 * installées. Le format est trivial, autant ne rien ajouter au projet.
 */
async function lireEnvLocal() {
  const env = { ...process.env };
  for (const nom of [".env.local", ".env"]) {
    const chemin = path.join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    const brut = await readFile(chemin, "utf8");
    for (const ligne of brut.split("\n")) {
      const m = ligne.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let valeur = m[2].trim();
      if (
        (valeur.startsWith('"') && valeur.endsWith('"')) ||
        (valeur.startsWith("'") && valeur.endsWith("'"))
      ) {
        valeur = valeur.slice(1, -1);
      }
      // Ce qui vient du shell l'emporte : `GOOGLE_CSE_ID=x node script.mjs`
      // doit gagner sur le fichier.
      if (env[m[1]] === undefined) env[m[1]] = valeur;
    }
  }
  return env;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function lireArgs(argv) {
  const a = {
    cohorte: null,
    ids: null,
    sansSite: false,
    limite: 0,
    depuis: 0,
    sortie: path.join(RACINE, ".prospection", "dossiers"),
    pause: 2500,
    candidats: 3,
    refaire: false,
    recap: false,
    sansGoogle: false,
    sansWeb: false,
    moteur: null,
    sansFenetre: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const cle = argv[i];
    const val = argv[i + 1];
    switch (cle) {
      case "--cohorte":
        a.cohorte = val;
        i++;
        break;
      case "--ids":
        a.ids = val.split(",").map((x) => Number(x.trim())).filter(Boolean);
        i++;
        break;
      case "--sans-site":
        a.sansSite = true;
        break;
      case "--limite":
        a.limite = Number(val);
        i++;
        break;
      case "--depuis":
        a.depuis = Number(val);
        i++;
        break;
      case "--sortie":
        a.sortie = path.resolve(RACINE, val);
        i++;
        break;
      case "--pause":
        a.pause = Number(val);
        i++;
        break;
      case "--candidats":
        a.candidats = Number(val);
        i++;
        break;
      case "--refaire":
        a.refaire = true;
        break;
      case "--recap":
        a.recap = true;
        break;
      case "--sans-google":
        a.sansGoogle = true;
        break;
      case "--sans-web":
        a.sansWeb = true;
        break;
      case "--moteur":
        a.moteur = val;
        i++;
        break;
      case "--sans-fenetre":
        a.sansFenetre = true;
        break;
      case "--aide":
      case "-h":
        console.log(AIDE);
        process.exit(0);
        break;
      default:
        if (cle.startsWith("--")) {
          console.error(`Option inconnue : ${cle}\n${AIDE}`);
          process.exit(1);
        }
    }
  }
  // « A » et « B » sont ce qu'on dit à l'oral ; en base c'est A_site_faible.
  if (a.cohorte === "A") a.cohorte = "A_site_faible";
  if (a.cohorte === "B") a.cohorte = "B_sans_site";
  return a;
}

const AIDE = `
Usage : node scripts/prospection/dossier-web.mjs [options]

  --cohorte A|B|<valeur>  restreindre à une cohorte de démarchage
  --ids 12,34             des entreprises précises
  --sans-site             seulement celles sans URL exploitable
  --limite N              s'arrêter après N entreprises
  --depuis N              sauter les N premières
  --sortie <dossier>      défaut .prospection/dossiers
  --pause <ms>            délai entre deux entreprises (défaut 2500)
  --candidats N           combien de résultats sonder (défaut 3)
  --moteur playwright|cse|ddg
                          playwright : la vraie page Google dans un vrai
                            navigateur, profil persistant (défaut)
                          cse : API Google Custom Search (demande GOOGLE_CSE_ID)
                          ddg : DuckDuckGo HTML — dépanne, mais coupe vite
  --sans-fenetre          navigateur masqué. À éviter : un CAPTCHA dans une
                          fenêtre invisible est un blocage sans issue.
  --sans-google           ne pas appeler l'API Places (économise le quota)
  --sans-web              passe fiche Google seule, sans aucune recherche web
  --refaire               retraiter même si le dossier existe
  --recap                 juste recomposer _RECAP.md depuis _index.jsonl
`;

// ═════════════════════════════════════════════════════════════════════════════
// Ce qui n'est jamais le site de l'artisan
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un annuaire cite l'entreprise, il ne lui appartient pas. La distinction est
 * la seule chose qui compte dans un résultat de recherche : sur ITSI LIARD,
 * neuf des dix résultats sont des annuaires et un seul est le site.
 *
 * Cette liste ne remplace pas `url_blacklist` (lue en base, elle, et partagée
 * avec la file de qualification) : elle la complète pour un besoin qui lui est
 * propre — classer un résultat de moteur, pas exclure une fiche du CRM.
 */
const ANNUAIRES = [
  "pagesjaunes.fr", "118000.fr", "118712.fr", "societe.com", "verif.com",
  "infogreffe.fr", "pappers.fr", "kompass.com", "cylex-locale.fr", "cylex.fr",
  "le-site-de.com", "toutendroit.com", "manageo.fr", "bilansgratuits.fr",
  "annuaire-entreprises.data.gouv.fr", "entreprises.lefigaro.fr", "corporama.com",
  "europages.fr", "hoodspot.fr", "justacote.com", "mappy.com", "yelp.fr",
  "yelp.com", "foursquare.com", "trustpilot.com", "starofservice.com",
  "petitesannonces.fr", "lesbonsartisans.fr", "annuaire-horaire.fr",
  "opendatasoft.com", "data.gouv.fr", "leparisien.fr", "toutsurmesfinances.com",
  "societe-annuaire.fr", "b-reputation.com", "score3.fr", "dirigeant.fr",
  "indexa.fr", "nomads-travel.fr", "creerentreprise.fr", "annuaire.komparo.fr",
  "horairesdouverture24.fr", "horaire-ouverture.fr", "adresse-horaire.fr",
  "toutendroit.com", "trouver-ouvert.fr", "shopping-horaires.fr", "infobel.com",
  "opendi.fr", "wikiwand.com", "solvabilite-entreprise.fr", "pagespro.com",
];

/**
 * La liste des annuaires ne sera jamais complète : il en naît un par mois, tous
 * bâtis sur le même gabarit « horaires / avis / coordonnées de X à Y ». Quand le
 * domaine ne dit rien, le TITRE trahit le gabarit — et un annuaire ne met jamais
 * le nom de l'entreprise dans son propre domaine, ce qui donne la règle : titre
 * d'annuaire + domaine qui ne porte pas le nom = annuaire.
 */
const TITRES_ANNUAIRE =
  /horaires?\s+d(?:'|’)ouverture|adresse,?\s*(?:horaires?|t[ée]l[ée]phone)|num[ée]ro de t[ée]l[ée]phone|avis et devis|coordonn[ée]es,?\s*horaires|toutes les informations pratiques|plan d(?:'|’)acc[èe]s/i;

/** Les plateformes de mise en relation : elles vendent des devis, pas des sites. */
const APPORTEURS = [
  "travaux.com", "quotatis.fr", "habitatpresto.com", "hellopro.fr", "ooreka.fr",
  "camif-habitat.fr", "3devis.com", "devis-travaux.org", "monequerre.fr",
  "izi-by-edf.fr", "leboncoin.fr", "houzz.fr", "travauxlib.com", "rendezvousdestravaux.com",
];

/** Une page sociale n'est pas un site : c'est le signe qu'il n'y en a pas. */
const SOCIAUX = [
  "facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "twitter.com",
  "x.com", "youtube.com", "pinterest.fr", "pinterest.com", "snapchat.com",
];

/** Hébergeurs gratuits : un site, oui, mais qui appartient à la plateforme. */
const HEBERGEURS_GRATUITS = [
  "wixsite.com", "e-monsite.com", "pagesperso-orange.fr", "sites.google.com",
  "business.site", "jimdosite.com", "jimdo.com", "wordpress.com", "blogspot.com",
  "free.fr", "wanadoo.fr", "over-blog.com", "webnode.fr", "site-solocal.com",
  "solocalnetwork.fr", "monsite.com", "chez.com",
];

/** Les moteurs et Google lui-même : jamais un résultat exploitable. */
const MOTEURS = [
  "google.com", "google.fr", "duckduckgo.com", "bing.com", "qwant.com",
  "maps.google.com", "goo.gl", "wikipedia.org", "wikiwand.com",
];

const couvre = (hote, liste) =>
  liste.some((d) => hote === d || hote.endsWith(`.${d}`));

// ═════════════════════════════════════════════════════════════════════════════
// Normalisations
// ═════════════════════════════════════════════════════════════════════════════

const sansAccents = (s) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Le nom réduit à ce qui identifie vraiment l'entreprise.
 *
 * Les formes juridiques (SARL, SAS, EURL…) et les mots de métier sont du bruit
 * pour la comparaison avec un nom de domaine : « SARL PLOMBERIE DUPONT » et
 * « dupont-plomberie.fr » doivent se reconnaître.
 */
const FORMES = /\b(sarl|sas|sasu|eurl|sa|snc|sci|scop|ste|societe|ets|etablissements|entreprise|eirl|scm|selarl)\b/g;

function motsDuNom(nom) {
  const base = sansAccents(nom ?? "")
    .toLowerCase()
    .replace(/[.'’`&,()\/]/g, " ")
    .replace(FORMES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return base.split(/\s+/).filter((m) => m.length >= 3);
}

const hoteDe = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Les 9 derniers chiffres : ce qui reste d'un numéro français quel qu'en soit le format. */
const chiffresTel = (t) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};

/**
 * Une ville, réduite à ce qui ne change pas d'une source à l'autre.
 *
 * Le CRM écrit « ST SULPICE SUR RISLE », le site « Saint-Sulpice-sur-Risle », et
 * l'un des deux se trompe même en « Saint Sulpice sur Rilse ». Sans cette
 * normalisation, le recoupement « ville trouvée » répondait non sur une page qui
 * ne parle que de ça.
 */
const villeReduite = (v) =>
  sansAccents(v ?? "")
    .toLowerCase()
    .replace(/\b(st|ste)\b/g, (m) => (m === "st" ? "saint" : "sainte"))
    .replace(/[^a-z0-9]/g, "");

// ═════════════════════════════════════════════════════════════════════════════
// Lecture Supabase (REST, en lecture seule)
// ═════════════════════════════════════════════════════════════════════════════

let ENV = {};

async function rest(chemin) {
  const url = `${ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${chemin}`;
  const cle = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} sur ${chemin} : ${await res.text()}`);
  return res.json();
}

const CHAMPS =
  "id,name,ville,code_postal,adresse,telephone,email,canonical_url,site_web_canonique," +
  "google_place_id,google_url,google_maps_url,note_moyenne,nombre_avis,cohorte_demarchage," +
  "qualifie,hidden_in_qualification,archived_at,premiers_tags,service_tags";

async function selectionner(a) {
  const filtres = [`select=${CHAMPS}`, "archived_at=is.null", "order=id.asc"];
  if (a.ids) filtres.push(`id=in.(${a.ids.join(",")})`);
  if (a.cohorte) filtres.push(`cohorte_demarchage=eq.${encodeURIComponent(a.cohorte)}`);
  if (a.sansSite) filtres.push("canonical_url=is.null", "site_web_canonique=is.null");
  // On pagine large et on tranche ensuite : PostgREST plafonne les réponses,
  // et `--depuis` doit pouvoir sauter au-delà de la première page.
  filtres.push("limit=2000");
  const lignes = await rest(`entreprises?${filtres.join("&")}`);
  const debut = a.depuis || 0;
  const fin = a.limite ? debut + a.limite : undefined;
  return lignes.slice(debut, fin);
}

async function blacklistActive() {
  try {
    const lignes = await rest("url_blacklist?active=eq.true&select=scope,value&limit=1000");
    return lignes
      .filter((l) => l.scope === "domain")
      .map((l) => String(l.value).toLowerCase().replace(/^www\./, ""));
  } catch (e) {
    console.warn(`  (blacklist illisible : ${e.message} — on continue sans)`);
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. La fiche Google Business, par l'API officielle
// ═════════════════════════════════════════════════════════════════════════════

const CHAMPS_PLACE =
  "id,displayName,formattedAddress,websiteUri,rating,userRatingCount," +
  "nationalPhoneNumber,businessStatus,googleMapsUri,primaryTypeDisplayName";

/**
 * `google_place_id` d'abord, recherche textuelle ensuite.
 *
 * Quand la fiche est déjà connue, Place Details est plus sûr (pas d'homonyme) et
 * moins cher qu'une recherche. La recherche textuelle ne sert qu'aux fiches que
 * l'enrichissement Maps n'a jamais vues — c'est-à-dire, sur la cohorte B, la
 * quasi-totalité.
 */
async function ficheGoogle(e) {
  const cle = ENV.GOOGLE_MAPS_API_KEY || ENV.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!cle) return { statut: "pas_de_cle" };

  const enTetes = (masque) => ({
    "Content-Type": "application/json",
    "X-Goog-Api-Key": cle,
    "X-Goog-FieldMask": masque,
  });

  try {
    if (e.google_place_id) {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(e.google_place_id)}?languageCode=fr`,
        { headers: enTetes(CHAMPS_PLACE) },
      );
      if (res.ok) return { statut: "trouvee", origine: "place_id", place: await res.json() };
      // Un place_id périmé arrive : on retombe sur la recherche plutôt que d'abandonner.
    }

    const requete = [e.name, e.ville, e.code_postal].filter(Boolean).join(" ");
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: enTetes(CHAMPS_PLACE.split(",").map((c) => `places.${c}`).join(",")),
      body: JSON.stringify({
        textQuery: requete,
        languageCode: "fr",
        regionCode: "FR",
        maxResultCount: 3,
      }),
    });
    if (!res.ok) return { statut: "erreur", detail: `HTTP ${res.status} ${await res.text()}` };
    const corps = await res.json();
    const places = corps.places ?? [];
    if (!places.length) return { statut: "aucune", requete };

    // Choix du bon parmi les homonymes : le code postal tranche, sinon le
    // premier — l'API classe déjà par pertinence géographique.
    const bonne =
      places.find((p) => e.code_postal && (p.formattedAddress ?? "").includes(e.code_postal)) ??
      places[0];
    return {
      statut: "trouvee",
      origine: "recherche",
      requete,
      place: bonne,
      autres: places.length - 1,
    };
  } catch (err) {
    return { statut: "erreur", detail: err.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Les résultats web
// ═════════════════════════════════════════════════════════════════════════════

const decoderEntites = (s) =>
  (s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const sansBalises = (s) => decoderEntites((s ?? "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/**
 * DuckDuckGo, version HTML — celle qui existe justement pour être lue sans JS.
 *
 * Les liens y sont enveloppés (`//duckduckgo.com/l/?uddg=<url encodée>`) : sans
 * la désenvelopper, on collectionnerait dix fois le même domaine de redirection.
 */
async function chercherDuckDuckGo(requete) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(requete)}&kl=fr-fr`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
  });
  const html = await res.text();

  if (!res.ok) return { moteur: "duckduckgo", requete, html, resultats: [], bloque: true };
  if (/anomaly|blocked|captcha/i.test(html) && !/result__a/.test(html)) {
    return { moteur: "duckduckgo", requete, html, resultats: [], bloque: true };
  }

  const resultats = [];
  const blocs = html.split(/<div class="result\b/).slice(1);
  for (const bloc of blocs) {
    const lien = bloc.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!lien) continue;
    const extrait = bloc.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    let brute = decoderEntites(lien[1]);
    if (brute.startsWith("//")) brute = `https:${brute}`;
    let finale = brute;
    try {
      const enveloppe = new URL(brute).searchParams.get("uddg");
      if (enveloppe) finale = enveloppe;
    } catch {
      /* lien exotique : on garde tel quel, la sonde tranchera */
    }
    if (!/^https?:\/\//.test(finale)) continue;

    resultats.push({
      rang: resultats.length + 1,
      url: finale,
      titre: sansBalises(lien[2]),
      extrait: extrait ? sansBalises(extrait[1]) : "",
    });
    if (resultats.length >= 10) break;
  }
  return { moteur: "duckduckgo", requete, html, resultats, bloque: resultats.length === 0 };
}

/**
 * Google Custom Search, quand `GOOGLE_CSE_ID` est renseigné.
 *
 * Ce sont les vrais résultats Google, par la porte d'entrée prévue pour ça. Le
 * quota gratuit est de 100 requêtes par jour ; au-delà c'est facturé. D'où le
 * choix de DuckDuckGo par défaut : le script doit tourner sur 579 fiches sans
 * que personne n'ait rien à configurer ni à payer.
 */
async function chercherGoogleCSE(requete) {
  const params = new URLSearchParams({
    key: ENV.GOOGLE_API_KEY,
    cx: ENV.GOOGLE_CSE_ID,
    q: requete,
    num: "10",
    hl: "fr",
    gl: "fr",
  });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      moteur: "google_cse",
      requete,
      html: JSON.stringify(corps),
      resultats: [],
      bloque: true,
      detail: corps?.error?.message ?? `HTTP ${res.status}`,
    };
  }
  const resultats = (corps.items ?? []).map((it, i) => ({
    rang: i + 1,
    url: it.link,
    titre: it.title ?? "",
    extrait: it.snippet ?? "",
  }));
  return { moteur: "google_cse", requete, html: JSON.stringify(corps, null, 2), resultats, bloque: false };
}

/**
 * Le moteur du lot, ouvert une seule fois.
 *
 * `playwright` par défaut : c'est le seul qui rende la vraie première page de
 * Google, et le seul qui tienne un lot entier. Les deux autres restent
 * accessibles — CSE quand on a un `cx` et qu'on préfère une API à un navigateur,
 * DuckDuckGo pour dépanner sur trois fiches sans rien installer.
 */
async function ouvrirMoteur(a) {
  const choisi =
    a.moteur ?? (ENV.GOOGLE_CSE_ID && ENV.GOOGLE_API_KEY ? "cse" : "playwright");

  if (choisi === "cse") {
    if (!ENV.GOOGLE_CSE_ID || !ENV.GOOGLE_API_KEY) {
      throw new Error("--moteur cse demande GOOGLE_API_KEY et GOOGLE_CSE_ID dans .env.local");
    }
    return { nom: "google_cse", chercher: chercherGoogleCSE, fermer: async () => {} };
  }
  if (choisi === "ddg") {
    return { nom: "duckduckgo", chercher: chercherDuckDuckGo, fermer: async () => {} };
  }
  if (choisi === "playwright") {
    const { ouvrirMoteurPlaywright } = await import("./moteur-playwright.mjs");
    return ouvrirMoteurPlaywright({
      racine: path.dirname(a.sortie),
      sansFenetre: a.sansFenetre,
    });
  }
  throw new Error(`Moteur inconnu : ${choisi} (playwright, cse ou ddg)`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. La sonde : ce que la page dit vraiment
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les métadonnées lues sur la page elle-même, pas dans le cache du moteur.
 *
 * L'attribut `content` d'une meta se lit en deux temps : on isole la balise
 * entière, puis on lit ses attributs. Une regex directe casse sur la première
 * apostrophe du texte — la meta d'ITSI LIARD s'était réduite à « L » avant que
 * ce détour soit écrit.
 */
/**
 * Le corps décodé dans SON encodage, pas dans celui qu'on espérait.
 *
 * `res.text()` suppose de l'UTF-8. Une bonne partie du web artisanal français est
 * encore en ISO-8859-1 : la première page sondée a rendu « Mar�chal Leclerc »,
 * et une meta description criblée de losanges noirs n'est pas une preuve, c'est
 * du bruit. On lit donc l'octet brut, puis on cherche l'encodage là où il est
 * annoncé — l'en-tête HTTP d'abord, la balise <meta charset> ensuite, qui est
 * seule à le dire sur les pages servies sans charset.
 */
function decoderCorps(buffer, contentType) {
  const octets = new Uint8Array(buffer);
  const annonce = (contentType ?? "").match(/charset=\s*"?([\w-]+)/i)?.[1];

  // Le <meta charset> est en ASCII pur dans le premier kilo-octet : le lire en
  // latin-1 est sans risque, quel que soit l'encodage réel de la suite.
  const debut = new TextDecoder("latin1").decode(octets.subarray(0, 2048));
  const dansLaPage =
    debut.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
    debut.match(/charset=\s*["']?([\w-]+)/i)?.[1];

  for (const nom of [annonce, dansLaPage, "utf-8"]) {
    if (!nom) continue;
    try {
      return new TextDecoder(nom.toLowerCase(), { fatal: false }).decode(octets);
    } catch {
      /* encodage inconnu de Node : on essaie le suivant */
    }
  }
  return new TextDecoder("utf-8").decode(octets);
}

function metaDeLaPage(html) {
  const titre = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let description = "";
  for (const balise of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const nom = balise.match(/\b(?:name|property)\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i);
    const cle = (nom?.[2] ?? nom?.[3] ?? nom?.[4] ?? "").toLowerCase();
    if (cle !== "description" && cle !== "og:description") continue;
    const c = balise.match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i);
    const valeur = decoderEntites(c?.[2] ?? c?.[3] ?? c?.[4] ?? "").trim();
    if (valeur && (!description || cle === "description")) description = valeur;
  }
  return {
    titre: titre ? sansBalises(titre[1]) : "",
    description,
  };
}

/**
 * Une note à 0 recouvre trois choses très différentes, et une seule est une
 * bonne nouvelle commerciale : le site mort. Le 403 d'un pare-feu et le timeout
 * d'un serveur lent sont des faux positifs — on l'a déjà payé sur 75 fiches.
 * La sonde les sépare en rendant le code HTTP tel quel.
 */
async function sonder(url, entreprise, telFicheGoogle = null) {
  const debut = Date.now();
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controleur.signal,
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const html = decoderCorps(await res.arrayBuffer(), res.headers.get("content-type"));
    const meta = metaDeLaPage(html);
    const texte = sansAccents(html).toLowerCase();
    const compact = villeReduite(html);
    const chiffres = html.replace(/\D/g, "");

    const mots = motsDuNom(entreprise.name);
    const motsTrouves = mots.filter((m) => texte.includes(m));
    // Les deux numéros comptent : celui du CRM et celui de la fiche Google
    // diffèrent souvent (portable du patron d'un côté, ligne fixe de l'autre),
    // et le site n'affiche parfois que le second.
    const tels = [entreprise.telephone, telFicheGoogle].map(chiffresTel).filter(Boolean);
    const ville = villeReduite(entreprise.ville);

    return {
      joignable: true,
      http: res.status,
      urlFinale: res.url || url,
      redirige: (res.url || url) !== url,
      ms: Date.now() - debut,
      poids: html.length,
      titre: meta.titre,
      description: meta.description,
      nomTrouve: mots.length > 0 && motsTrouves.length >= Math.ceil(mots.length / 2),
      motsTrouves,
      telTrouve: tels.some((t) => chiffres.includes(t)),
      villeTrouvee: ville.length >= 4 && compact.includes(ville),
    };
  } catch (e) {
    return {
      joignable: false,
      http: null,
      erreur: e.name === "AbortError" ? "délai dépassé (15 s)" : e.message,
      ms: Date.now() - debut,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Classement et recommandation
// ═════════════════════════════════════════════════════════════════════════════

function classer(url, blacklist, titre = "", porteLeNom = false) {
  const hote = hoteDe(url);
  if (!hote) return "illisible";
  if (couvre(hote, MOTEURS)) return "moteur";
  if (couvre(hote, blacklist)) return "blacklist";
  if (couvre(hote, SOCIAUX)) return "social";
  if (couvre(hote, ANNUAIRES)) return "annuaire";
  if (couvre(hote, APPORTEURS)) return "apporteur";
  if (couvre(hote, HEBERGEURS_GRATUITS)) return "hebergeur_gratuit";
  if (!porteLeNom && TITRES_ANNUAIRE.test(titre)) return "annuaire";
  return "candidat";
}

/**
 * Le domaine porte-t-il le nom de l'entreprise ?
 *
 * C'est le signal le plus fort d'un résultat de recherche, et le moins cher :
 * `itsi-liard-chauffage.fr` contient « itsi » et « liard ». On exige la moitié
 * des mots significatifs — un seul mot commun suffirait à confondre deux
 * « plomberie » de deux départements.
 */
function domainePorteLeNom(url, nom) {
  const hote = sansAccents(hoteDe(url)).replace(/[^a-z0-9]/g, "");
  const mots = motsDuNom(nom);
  if (!hote || !mots.length) return { oui: false, mots: [] };
  const trouves = mots.filter((m) => hote.includes(m));
  return { oui: trouves.length >= Math.ceil(mots.length / 2), mots: trouves };
}

/**
 * La proposition, et surtout SON MOTIF.
 *
 * Une recommandation sans son motif ne se relit pas : il faudrait refaire le
 * travail pour la contrôler. Chaque niveau de confiance dit donc ce qui l'a
 * produit, pour qu'un coup d'œil suffise à valider ou à écarter.
 */
function recommander(entreprise, fiche, examines, blacklist = []) {
  const siteFiche = fiche?.place?.websiteUri;
  if (siteFiche) {
    const nature = classer(siteFiche, blacklist);
    if (nature === "candidat") {
      return {
        url: siteFiche,
        confiance: "certaine",
        motif: "déclaré par l'entreprise elle-même sur sa fiche Google Business",
      };
    }
    // Une fiche qui pointe vers Facebook ou vers le site de son enseigne n'est
    // pas une bonne nouvelle : c'est le profil type de la cible. On le dit au
    // lieu de le retenir comme un site.
    return {
      url: null,
      confiance: "aucune",
      motif: `la fiche Google déclare ${siteFiche} — ${
        nature === "social"
          ? "une page sociale, donc toujours pas de site à soi"
          : nature === "hebergeur_gratuit"
            ? "un hébergeur gratuit, donc un site qui ne lui appartient pas"
            : `un ${nature}, pas son site`
      }`,
      siteDeclare: siteFiche,
    };
  }

  const candidats = examines.filter((r) => r.categorie === "candidat");
  const note = (r) => {
    let n = 0;
    if (r.nomDansDomaine?.oui) n += 40;
    if (r.sonde?.joignable && r.sonde.http >= 200 && r.sonde.http < 400) n += 25;
    if (r.sonde?.nomTrouve) n += 20;
    if (r.sonde?.telTrouve) n += 15;
    if (r.sonde?.villeTrouvee) n += 5;
    n -= Math.min(r.rang, 10); // à égalité, le mieux classé passe devant
    return n;
  };

  const meilleur = candidats.map((r) => ({ r, n: note(r) })).sort((a, b) => b.n - a.n)[0];
  if (!meilleur) {
    const social = examines.find((r) => r.categorie === "social");
    if (social) {
      return {
        url: null,
        confiance: "aucune",
        motif: `aucun site propre — seulement une page ${hoteDe(social.url)}. Reste « sans site », mais la page sociale prépare l'appel.`,
      };
    }
    return { url: null, confiance: "aucune", motif: "aucun candidat : que des annuaires." };
  }

  const r = meilleur.r;
  const preuves = [];
  if (r.nomDansDomaine?.oui) preuves.push(`le domaine porte le nom (${r.nomDansDomaine.mots.join(", ")})`);
  if (r.sonde?.joignable) preuves.push(`la page répond (HTTP ${r.sonde.http})`);
  if (r.sonde?.nomTrouve) preuves.push("le nom apparaît dans la page");
  if (r.sonde?.telTrouve) preuves.push("un téléphone connu est sur la page");
  if (r.sonde?.villeTrouvee) preuves.push("la ville aussi");

  const confiance = meilleur.n >= 75 ? "haute" : meilleur.n >= 45 ? "moyenne" : "faible";
  return {
    url: r.sonde?.urlFinale ?? r.url,
    confiance,
    motif: preuves.length ? preuves.join(" · ") : `1ᵉʳ résultat non-annuaire, sans autre preuve`,
    score: meilleur.n,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Le dossier
// ═════════════════════════════════════════════════════════════════════════════

const slug = (s) =>
  sansAccents(s ?? "sans-nom").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const oui = (b) => (b ? "oui" : "non");

const PICTO = {
  candidat: "🟢",
  annuaire: "📒",
  apporteur: "💸",
  social: "👤",
  hebergeur_gratuit: "🏚️",
  blacklist: "⛔",
  moteur: "🔍",
  illisible: "❓",
};

function redigerDossier(e, fiche, recherche, examines, reco) {
  const L = [];
  const siteCrm = e.canonical_url || e.site_web_canonique || null;

  L.push(`# ${e.id} · ${e.name ?? "(sans nom)"}`);
  L.push("");
  // `adresse` répète souvent le code postal et la ville : on ne les ajoute que
  // s'ils manquent, sinon l'en-tête lit « ST SULPICE SUR RISLE · 61300 · ST
  // SULPICE SUR RISLE ».
  const dansAdresse = villeReduite(e.adresse);
  L.push(
    [
      e.adresse,
      dansAdresse.includes(e.code_postal ?? " ") ? null : e.code_postal,
      e.ville && dansAdresse.includes(villeReduite(e.ville)) ? null : e.ville,
    ]
      .filter(Boolean)
      .join(" · ") || "_adresse inconnue_",
  );
  L.push("");
  L.push("## Ce que le CRM en dit");
  L.push("");
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| Site enregistré | ${siteCrm ?? "**aucun**"} |`);
  L.push(`| Téléphone | ${e.telephone ?? "—"} |`);
  L.push(`| Note / avis | ${e.note_moyenne ?? "—"} / ${e.nombre_avis ?? "—"} |`);
  L.push(`| Cohorte | ${e.cohorte_demarchage ?? "—"} |`);
  L.push(`| Qualifiée | ${oui(e.qualifie)} |`);
  L.push(`| Métier | ${e.premiers_tags || (e.service_tags ?? []).join(", ") || "—"} |`);
  L.push("");

  L.push("## Fiche Google Business");
  L.push("");
  if (fiche.statut === "trouvee") {
    const p = fiche.place;
    const site = p.websiteUri;
    L.push(`**${p.displayName?.text ?? "(sans nom)"}** — ${p.primaryTypeDisplayName?.text ?? "type inconnu"}`);
    L.push("");
    L.push(`| | |`);
    L.push(`|---|---|`);
    L.push(`| Adresse | ${p.formattedAddress ?? "—"} |`);
    L.push(`| Téléphone | ${p.nationalPhoneNumber ?? "—"}${
      p.nationalPhoneNumber && chiffresTel(p.nationalPhoneNumber) === chiffresTel(e.telephone)
        ? " (identique au CRM)"
        : p.nationalPhoneNumber
          ? " ⚠️ **différent du CRM**"
          : ""
    } |`);
    L.push(`| Site déclaré | ${site ? site : "**aucun** — la fiche existe mais ne pointe vers rien"} |`);
    L.push(`| Avis | ${
      p.userRatingCount
        ? `${p.rating ?? "?"}/5 sur ${p.userRatingCount} avis`
        : "**aucun avis** — fiche vraisemblablement non réclamée"
    } |`);
    L.push(`| Statut | ${p.businessStatus ?? "—"} |`);
    L.push(`| Maps | ${p.googleMapsUri ?? "—"} |`);
    if (fiche.origine === "recherche") {
      L.push(`| Trouvée par | recherche « ${fiche.requete} »${fiche.autres ? ` (${fiche.autres} autre(s) fiche(s) écartée(s))` : ""} |`);
    }
  } else if (fiche.statut === "aucune") {
    L.push(`Aucune fiche pour « ${fiche.requete} ». **Pas de présence Google du tout** — c'est un argument de vente en soi.`);
  } else if (fiche.statut === "pas_de_cle") {
    L.push("_Non consultée : pas de clé Places (ou `--sans-google`)._");
  } else {
    L.push(`_Non consultée : ${fiche.detail}_`);
  }
  L.push("");

  L.push(`## Résultats web — « ${recherche.requete} »`);
  L.push("");
  if (recherche.moteur === "inutile") {
    L.push("_Recherche non lancée : l'entreprise déclare elle-même son site sur sa fiche Google. Aucun moteur ne fera mieux que la source primaire._");
  } else if (recherche.moteur === "non consulté") {
    L.push("_Recherche non lancée (`--sans-web`) : cette passe ne consulte que la fiche Google._");
  } else {
    L.push(`_Moteur : ${recherche.moteur}._`);
    L.push("");
    if (!examines.length) {
      L.push(recherche.bloque ? "**Aucun résultat — le moteur a refusé la requête.**" : "Aucun résultat.");
    }
  }
  for (const r of examines) {
    L.push(`### ${PICTO[r.categorie] ?? "•"} ${r.rang}. ${r.titre || "(sans titre)"}`);
    L.push("");
    L.push(`<${r.url}>`);
    L.push("");
    L.push(`- **Catégorie** : ${r.categorie}`);
    if (r.extrait) L.push(`- **Extrait du moteur** : ${r.extrait}`);
    if (r.nomDansDomaine?.oui) L.push(`- **Le domaine porte le nom** : ${r.nomDansDomaine.mots.join(", ")}`);
    if (r.sonde) {
      if (r.sonde.joignable) {
        L.push(
          `- **Sonde** : HTTP ${r.sonde.http}${r.sonde.redirige ? ` → ${r.sonde.urlFinale}` : ""} · ${r.sonde.ms} ms · ${Math.round(r.sonde.poids / 1024)} ko`,
        );
        if (r.sonde.titre) L.push(`- **Titre de la page** : ${r.sonde.titre}`);
        L.push(`- **Meta description** : ${r.sonde.description || "_aucune_"}`);
        L.push(
          `- **Recoupements** : nom ${oui(r.sonde.nomTrouve)} · téléphone ${oui(r.sonde.telTrouve)} · ville ${oui(r.sonde.villeTrouvee)}`,
        );
      } else {
        L.push(`- **Sonde** : injoignable — ${r.sonde.erreur}`);
      }
    }
    L.push("");
  }

  L.push("## Ce que je propose");
  L.push("");
  if (reco.url) {
    L.push(`**Site à retenir : ${reco.url}**`);
    L.push("");
    L.push(`Confiance ${reco.confiance} — ${reco.motif}`);
    if (siteCrm && hoteDe(siteCrm) !== hoteDe(reco.url)) {
      L.push("");
      L.push(`⚠️ Le CRM en a déjà un autre : ${siteCrm}. À arbitrer.`);
    }
  } else {
    L.push(`**Aucun site à retenir.** ${reco.motif}`);
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push(`Recherche à refaire à la main : <https://www.google.com/search?q=${encodeURIComponent(recherche.requete)}>`);
  L.push("");
  return L.join("\n");
}

// ═════════════════════════════════════════════════════════════════════════════
// Le récap
// ═════════════════════════════════════════════════════════════════════════════

async function ecrireRecap(sortie) {
  const chemin = path.join(sortie, "_index.jsonl");
  if (!existsSync(chemin)) {
    console.error("Pas d'_index.jsonl : rien à récapituler.");
    return;
  }
  const lignes = (await readFile(chemin, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  // Une entreprise retraitée écrit une ligne de plus : la dernière gagne.
  const parId = new Map();
  for (const l of lignes) parId.set(l.id, l);
  const tout = [...parId.values()].sort((a, b) => a.id - b.id);

  const rang = { certaine: 0, haute: 1, moyenne: 2, faible: 3, aucune: 4 };
  tout.sort((a, b) => (rang[a.confiance] ?? 9) - (rang[b.confiance] ?? 9) || a.id - b.id);

  const compte = (c) => tout.filter((l) => l.confiance === c).length;
  const L = [];
  L.push("# Dossiers web — récapitulatif");
  L.push("");
  L.push(`${tout.length} entreprises passées. Trié par confiance : le haut du tableau se valide en série, le bas se regarde une par une.`);
  L.push("");
  L.push("| Confiance | Combien | Ce que ça veut dire |");
  L.push("|---|---:|---|");
  L.push(`| certaine | ${compte("certaine")} | l'entreprise déclare ce site sur sa propre fiche Google |`);
  L.push(`| haute | ${compte("haute")} | domaine au nom de l'entreprise **et** page qui répond **et** recoupements |`);
  L.push(`| moyenne | ${compte("moyenne")} | deux indices sur trois — à regarder |`);
  L.push(`| faible | ${compte("faible")} | un seul indice — à regarder de près |`);
  L.push(`| aucune | ${compte("aucune")} | pas de site trouvé : reste « sans site » |`);
  L.push("");
  L.push("| id | entreprise | ville | site trouvé | confiance | fiche Google | avis | dossier |");
  L.push("|---:|---|---|---|---|---|---:|---|");
  for (const l of tout) {
    L.push(
      `| ${l.id} | ${l.nom ?? ""} | ${l.ville ?? ""} | ${l.url ? `<${l.url}>` : "—"} | ${l.confiance} | ${
        l.ficheGoogle ? (l.siteSurFiche ? "site déclaré" : "sans site") : "aucune"
      } | ${l.avis ?? 0} | [${l.fichier}](${encodeURI(l.fichier)}) |`,
    );
  }
  L.push("");
  await writeFile(path.join(sortie, "_RECAP.md"), L.join("\n"), "utf8");
  console.log(`Récap écrit : ${path.join(sortie, "_RECAP.md")} (${tout.length} lignes)`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Boucle principale
// ═════════════════════════════════════════════════════════════════════════════

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const a = lireArgs(process.argv);
  ENV = await lireEnvLocal();

  await mkdir(a.sortie, { recursive: true });
  await mkdir(path.join(a.sortie, "_brut"), { recursive: true });

  if (a.recap) return ecrireRecap(a.sortie);

  if (!ENV.SUPABASE_URL && !ENV.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("SUPABASE_URL manquant — lancer depuis la racine du dépôt, où se trouve .env.local.");
    process.exit(1);
  }
  if (a.sansGoogle) ENV.GOOGLE_MAPS_API_KEY = "";

  const entreprises = await selectionner(a);
  const blacklist = await blacklistActive();
  const dejaFaits = new Set(
    (await readdir(a.sortie)).map((f) => Number(f.split("-")[0])).filter(Number.isFinite),
  );

  // Le moteur n'est ouvert que si on va s'en servir : `--sans-web` ne doit pas
  // faire démarrer un Chromium pour rien.
  const moteur = a.sansWeb ? null : await ouvrirMoteur(a);

  console.log(
    `${entreprises.length} entreprise(s) à traiter · moteur ${moteur?.nom ?? "aucun (--sans-web)"} · fiche Google ${
      ENV.GOOGLE_MAPS_API_KEY ? "oui" : "non"
    } · sortie ${a.sortie}`,
  );

  let n = 0;
  let blocsConsecutifs = 0;

  try {
  for (const e of entreprises) {
    n++;
    const etiquette = `[${n}/${entreprises.length}] ${e.id} ${e.name ?? ""}`;
    if (!a.refaire && dejaFaits.has(e.id)) {
      console.log(`${etiquette} — déjà fait, sauté`);
      continue;
    }

    const requete = [e.name, e.ville].filter(Boolean).join(" ");
    if (!requete.trim()) {
      console.log(`${etiquette} — ni nom ni ville, sauté`);
      continue;
    }

    const fiche = a.sansGoogle ? { statut: "pas_de_cle" } : await ficheGoogle(e);

    /*
     * L'ORDRE COMPTE, et il coûte cher dans l'autre sens.
     *
     * Quand l'entreprise déclare son site sur sa propre fiche Google, la
     * question est réglée : aucune recherche web ne fera mieux que la source
     * primaire. Chercher quand même, c'est brûler une requête d'un quota rare
     * (100/jour chez Google CSE) ou une chance de plus de se faire couper par
     * DuckDuckGo — pour un résultat déjà connu.
     *
     * On ne cherche donc QUE sur les fiches muettes. C'est aussi ce qui rend le
     * lot complet jouable : la passe `--sans-web` traite les 579 d'un trait, et
     * seule la minorité restante a besoin d'un moteur.
     */
    const siteDeclare = fiche?.place?.websiteUri;
    const declareUtilisable = siteDeclare && classer(siteDeclare, blacklist) === "candidat";
    const recherche =
      a.sansWeb || declareUtilisable
        ? { moteur: declareUtilisable ? "inutile" : "non consulté", requete, html: "", resultats: [], bloque: false }
        : await moteur.chercher(requete);

    // Un moteur qui refuse ne se force pas. Trois refus d'affilée et on s'arrête :
    // continuer ne ferait qu'écrire 500 dossiers vides et aggraver le blocage.
    if (recherche.bloque) {
      blocsConsecutifs++;
      console.warn(`${etiquette} — moteur muet (${recherche.detail ?? "0 résultat"})`);
      if (blocsConsecutifs >= 3) {
        console.error(
          "\nTrois refus d'affilée : le moteur nous a coupés. On s'arrête là.\n" +
            "Reprendre plus tard avec la même commande — les dossiers déjà écrits sont conservés.",
        );
        break;
      }
      await dormir(a.pause * 4);
      continue;
    }
    blocsConsecutifs = 0;

    // La page brute est gardée pour pouvoir revérifier une décision sans
    // relancer la recherche — donc sans rebrûler du quota ni risquer un blocage.
    if (recherche.html) {
      await writeFile(
        path.join(a.sortie, "_brut", `${e.id}.${recherche.moteur === "google_cse" ? "json" : "html"}`),
        recherche.html,
        "utf8",
      );
    }

    /*
     * Le panneau de droite de Google dit parfois ce que l'API Places tait.
     *
     * Les deux lisent la même fiche Business, mais pas au même moment ni avec
     * les mêmes droits : un site ajouté récemment apparaît dans le panneau avant
     * de ressortir dans l'API. Quand Places est muette et que le panneau parle,
     * on prend le panneau — c'est toujours l'entreprise qui l'a déclaré.
     */
    if (!fiche?.place?.websiteUri && recherche.siteFichePanneau) {
      fiche.place = { ...(fiche.place ?? {}), websiteUri: recherche.siteFichePanneau };
      fiche.siteVenuDuPanneau = true;
    }

    // On ne sonde que les candidats plausibles : sonder pagesjaunes.fr 579 fois
    // n'apprendrait rien et prendrait dix minutes de plus par cohorte.
    const examines = [];
    const hotesSondes = new Set();
    let sondes = 0;
    for (const r of recherche.resultats) {
      const nomDansDomaine = domainePorteLeNom(r.url, e.name);
      const categorie = classer(r.url, blacklist, r.titre, nomDansDomaine.oui);
      let sonde = null;
      // Un seul sondage par domaine : sur ITSI LIARD, l'accueil et la page
      // « Nous contacter » du même site occupaient deux des trois sondages.
      const hote = hoteDe(r.url);
      if (categorie === "candidat" && sondes < a.candidats && !hotesSondes.has(hote)) {
        sonde = await sonder(r.url, e, fiche?.place?.nationalPhoneNumber);
        hotesSondes.add(hote);
        sondes++;
      }
      examines.push({ ...r, categorie, nomDansDomaine, sonde });
    }

    const reco = recommander(e, fiche, examines, blacklist);
    const fichier = `${e.id}-${slug(e.name)}.md`;
    await writeFile(path.join(a.sortie, fichier), redigerDossier(e, fiche, recherche, examines, reco), "utf8");
    await appendFile(
      path.join(a.sortie, "_index.jsonl"),
      JSON.stringify({
        id: e.id,
        nom: e.name,
        ville: e.ville,
        code_postal: e.code_postal,
        cohorte: e.cohorte_demarchage,
        qualifie: e.qualifie,
        siteCrm: e.canonical_url || e.site_web_canonique || null,
        url: reco.url,
        confiance: reco.confiance,
        motif: reco.motif,
        ficheGoogle: fiche.statut === "trouvee",
        siteSurFiche: fiche?.place?.websiteUri ?? null,
        avis: fiche?.place?.userRatingCount ?? 0,
        note: fiche?.place?.rating ?? null,
        placeId: fiche?.place?.id ?? null,
        moteur: recherche.moteur,
        resultats: examines.length,
        fichier,
      }) + "\n",
      "utf8",
    );

    console.log(
      `${etiquette} — ${reco.url ? `${reco.confiance} : ${reco.url}` : "aucun site"} (${examines.length} résultats)`,
    );
    // Pas de pause quand rien n'a été demandé au moteur : une fiche réglée par
    // l'API Places n'a aucune raison d'attendre 2,5 s.
    if (recherche.html) await dormir(a.pause);
  }
  } finally {
    // Le navigateur se ferme même sur Ctrl-C ou sur erreur : un Chromium
    // orphelin garde le profil verrouillé et fait échouer le lot suivant.
    await moteur?.fermer();
  }

  await ecrireRecap(a.sortie);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
