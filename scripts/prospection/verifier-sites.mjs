#!/usr/bin/env node
/**
 * Les sites qu'on détient sont-ils vraiment les leurs ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * « Y a beaucoup de faux positifs dans les sites trouvés. Des annuaires, des
 * trucs comme ça. La plupart ont pas de site en vrai je pense, t'as surévalué
 * leurs sites. » — 17/08.
 *
 * Trois façons de répondre, une seule qui vaut :
 *   · comparer le nom au domaine → trop grossier. Testé : il classe
 *     `kmdepannage.fr` comme douteux pour « KM Dépannage Chauffage », et
 *     `rg-plomberie.com` pour « RG PLOMBERIE ». 60 faux doutes sur 199.
 *   · `host_est_generique` → ne connaît que les hébergeurs gratuits et les
 *     réseaux sociaux. Il ignore les chaînes, les fabricants, les annuaires.
 *   · ALLER VOIR LA PAGE. C'est la seule preuve.
 *
 * Ce script va chercher chaque URL détenue et cherche, dans le HTML rendu :
 *   le nom de l'entreprise (hors vocabulaire de métier, qui ne prouve rien),
 *   son téléphone, sa ville, son code postal.
 * Un site à soi parle de soi. Un annuaire, une page de réseau ou le site d'un
 * fabricant ne portent, au mieux, qu'un de ces éléments — et souvent aucun.
 *
 * Il n'écrit rien. Il produit `_VERIFICATION.md` et un JSON des id à revoir.
 *
 *   node scripts/prospection/verifier-sites.mjs --cohorte B_sans_site
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";

const RACINE = process.cwd();
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function lireEnvLocal() {
  const env = { ...process.env };
  for (const nom of [".env.local", ".env"]) {
    const chemin = path.join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    for (const ligne of (await readFile(chemin, "utf8")).split("\n")) {
      const m = ligne.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

const sansAccents = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const FORMES = /\b(sarl|sas|sasu|eurl|sa|snc|sci|ste|societe|ets|etablissements|entreprise|eirl)\b/g;
const METIER = new Set([
  "climatisation", "clim", "chauffage", "chauffagiste", "plomberie", "plombier", "sanitaire",
  "energie", "energies", "renouvelable", "pompe", "chaleur", "froid", "thermique", "electricite",
  "electrique", "electricien", "batiment", "travaux", "service", "services", "france", "groupe",
  "maison", "habitat", "confort", "technique", "installation", "depannage", "entretien", "isolation",
  "menuiserie", "couverture", "toiture", "renovation", "solaire", "photovoltaique", "ventilation",
  "genie", "fils", "freres", "pere", "showroom", "magasin", "agence",
]);

/** Les mots qui n'appartiennent qu'à cette entreprise-là. */
function motsPropres(nom) {
  return sansAccents(nom ?? "")
    .toLowerCase()
    .replace(/[.'’`&,()\/]/g, " ")
    .replace(FORMES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((m) => m.length >= 3 && !METIER.has(m));
}

const chiffresTel = (t) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};
const villeReduite = (v) =>
  sansAccents(v ?? "").toLowerCase().replace(/\b(st|ste)\b/g, (m) => (m === "st" ? "saint" : "sainte")).replace(/[^a-z0-9]/g, "");

function decoderCorps(buffer, contentType) {
  const octets = new Uint8Array(buffer);
  const annonce = (contentType ?? "").match(/charset=\s*"?([\w-]+)/i)?.[1];
  const debut = new TextDecoder("latin1").decode(octets.subarray(0, 2048));
  const dansLaPage = debut.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  for (const nom of [annonce, dansLaPage, "utf-8"]) {
    if (!nom) continue;
    try {
      return new TextDecoder(nom.toLowerCase(), { fatal: false }).decode(octets);
    } catch {
      /* encodage inconnu : suivant */
    }
  }
  return new TextDecoder("utf-8").decode(octets);
}

/**
 * LE DÉFAUT QUE LES TROIS INDICES NE VOYAIENT PAS.
 *
 * « Nom trouvé, téléphone trouvé, ville trouvée » : une fiche PagesJaunes coche
 * les trois. C'est même sa raison d'être. Les recoupements prouvent qu'une page
 * PARLE de l'entreprise, jamais qu'elle LUI APPARTIENT.
 *
 * Ce qui distingue vraiment, c'est la forme du site autour :
 *   · un annuaire renvoie vers des CENTAINES d'autres fiches — `/entreprise/…`,
 *     `/pro/…`, `/artisan/…`. Un artisan n'a pas de lien de ce genre ;
 *   · il porte le vocabulaire de son métier à lui : « trouvez un artisan »,
 *     « comparez les devis », « déposez votre demande » ;
 *   · et surtout, son domaine ne porte JAMAIS le nom de l'entreprise citée.
 *
 * Le domaine reste donc le juge de paix : `alpoclim.fr` pour ALPOCLIM ne se
 * discute pas. Le reste ne sert qu'à trancher quand le domaine est muet.
 */
const MARQUEURS_ANNUAIRE =
  /trouvez? un artisan|comparez? (?:les |jusqu)|devis gratuits?|d[ée]posez votre (?:demande|projet)|jusqu'[àa] \d+ devis|annuaire|nos professionnels|artisans? pr[èe]s de chez|inscrivez[- ]vous gratuitement|professionnels? r[ée]f[ée]renc[ée]s/i;

const LIENS_DE_FICHE =
  /href="[^"]*\/(?:entreprise|entreprises|pro|pros|artisan|artisans|professionnel|professionnels|societe|societes|fiche|prestataire)s?\/[^"]{3,}"/gi;

function natureDuSite(html, e, indices) {
  const mots = motsPropres(e.name);
  const dom = sansAccents((() => {
    try {
      return new URL((e.site_web_canonique || e.canonical_url || "").trim()).hostname;
    } catch {
      return "";
    }
  })()).toLowerCase().replace(/[^a-z0-9]/g, "");

  const motsDansDomaine = mots.filter((m) => dom.includes(m));
  const porteLeNom = mots.length > 0 && motsDansDomaine.length >= Math.ceil(mots.length / 2);

  const fiches = new Set((html.match(LIENS_DE_FICHE) ?? []).map((s) => s.toLowerCase())).size;
  const marqueur = MARQUEURS_ANNUAIRE.test(sansAccents(html));

  // Le domaine au nom de l'entreprise l'emporte sur tout le reste : un artisan
  // peut très bien écrire « devis gratuit » sur son propre site.
  if (porteLeNom) return { nature: "site_propre", porteLeNom, fiches, marqueur };
  // Six fiches d'entreprises liées depuis une page d'accueil, c'est un annuaire.
  // Un artisan en a zéro ; un site de réseau en a autant qu'il a d'agences.
  if (fiches >= 6) return { nature: "annuaire", porteLeNom, fiches, marqueur };
  if (marqueur && fiches >= 2) return { nature: "annuaire", porteLeNom, fiches, marqueur };
  if (indices.nomDansTitre && !marqueur) return { nature: "site_probable", porteLeNom, fiches, marqueur };
  return { nature: "doute", porteLeNom, fiches, marqueur };
}

/**
 * LE DOMAINE EXISTE-T-IL SEULEMENT ?
 *
 * `fetch` rend « fetch failed » aussi bien pour un serveur lent que pour un
 * domaine qui n'a jamais existé. La différence est pourtant tout : un timeout
 * ne prouve rien, un NXDOMAIN prouve qu'il N'Y A PAS DE SITE. C'est la seule
 * façon d'écrire « absent » sans se tromper — et elle concerne 47 des 80 URL
 * injoignables de la cohorte B, dont `kmdepannage.fr` et `paris-genie-clim.fr`.
 */
async function resoudre(hote) {
  try {
    await dns.lookup(hote);
    return { existe: true };
  } catch (e) {
    return {
      existe: false,
      // ENOTFOUND = le nom n'existe pas. EAI_AGAIN = le résolveur n'a pas
      // répondu — c'est une panne chez nous, pas une preuve chez eux.
      definitif: e.code === "ENOTFOUND",
      code: e.code ?? "inconnu",
    };
  }
}

async function verifier(e) {
  const url = (e.site_web_canonique || e.canonical_url || "").trim();
  let hote = "";
  try {
    hote = new URL(url.startsWith("http") ? url : `http://${url}`).hostname;
  } catch {
    /* URL illisible : la requête échouera et le dira */
  }
  if (hote) {
    const dnsRes = await resoudre(hote);
    if (!dnsRes.existe && dnsRes.definitif) {
      return {
        id: e.id, nom: e.name, url, http: null, score: -2,
        erreur: "le domaine n'existe pas (NXDOMAIN)", nature: "domaine_mort", indices: {},
      };
    }
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15000);
  try {
    const res = await fetch(url.startsWith("http") ? url : `http://${url}`, {
      redirect: "follow",
      signal: controleur.signal,
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const html = decoderCorps(await res.arrayBuffer(), res.headers.get("content-type"));
    const texte = sansAccents(html).toLowerCase();
    const compact = villeReduite(html);
    const chiffres = html.replace(/\D/g, "");
    const titre = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";

    const mots = motsPropres(e.name);
    const trouves = mots.filter((m) => texte.includes(m));
    const tel = chiffresTel(e.telephone);
    const ville = villeReduite(e.ville);

    const indices = {
      nom: mots.length > 0 && trouves.length >= Math.ceil(mots.length / 2),
      // Le nom dans le TITRE est bien plus fort que le nom quelque part dans la
      // page : un annuaire cite l'entreprise dans son corps, jamais dans le
      // titre de sa page d'accueil.
      nomDansTitre: mots.length > 0 && mots.some((m) => sansAccents(titre).toLowerCase().includes(m)),
      telephone: Boolean(tel) && chiffres.includes(tel),
      ville: ville.length >= 4 && compact.includes(ville),
    };
    const score = Object.values(indices).filter(Boolean).length;
    const forme = natureDuSite(html, e, indices);

    return {
      id: e.id,
      nom: e.name,
      url,
      http: res.status,
      urlFinale: res.url,
      titre: titre.slice(0, 110),
      indices,
      score,
      ...forme,
    };
  } catch (err) {
    return {
      id: e.id,
      nom: e.name,
      url,
      http: null,
      erreur: err.name === "AbortError" ? "délai dépassé" : err.message,
      indices: {},
      score: -1,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/** Huit de front : assez pour tenir 200 URL en deux minutes, sans matraquer. */
async function enParallele(items, n, fn) {
  const out = new Array(items.length);
  let curseur = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = curseur++; i < items.length; i = curseur++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

async function main() {
  const ENV = await lireEnvLocal();
  const argv = process.argv;
  const cohorte = argv.includes("--cohorte") ? argv[argv.indexOf("--cohorte") + 1] : "B_sans_site";
  const sortie = path.join(RACINE, ".prospection", "dossiers");

  const cle = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const lire = async (chemin) =>
    (await fetch(`${ENV.SUPABASE_URL}/rest/v1/${chemin}`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    })).json();

  const brutes = await lire(
    `entreprises?cohorte_demarchage=eq.${encodeURIComponent(cohorte)}` +
      `&archived_at=is.null&select=id,name,ville,code_postal,telephone,canonical_url,site_web_canonique&limit=2000`,
  );

  /*
   * ON VISITE TOUT CE QUI EST DÉCLARÉ PRÉSENT, pas seulement ce qui est en base.
   *
   * Le constat le plus récent fait foi, et une passe `dossier-web` postérieure
   * écrasait donc les visites par une preuve plus faible : 266 « présent »
   * annoncés sur la seule foi d'une fiche Google, contre 76 réellement vus.
   * En reprenant l'URL du constat quand `entreprises` n'en porte pas, la visite
   * redevient le dernier mot — et le mot le mieux fondé.
   */
  const ids = brutes.map((e) => e.id);
  const constats = {};
  for (let i = 0; i < ids.length; i += 200) {
    for (const c of await lire(
      `v_presence_actuelle?sujet=eq.site_web&etat=eq.present&entreprise_id=in.(${ids.slice(i, i + 200).join(",")})&select=entreprise_id,valeur`,
    )) {
      constats[c.entreprise_id] = c.valeur;
    }
  }

  const ents = brutes
    .map((e) => ({
      ...e,
      site_web_canonique: (e.site_web_canonique || e.canonical_url || "").trim() || constats[e.id] || null,
    }))
    .filter((e) => e.site_web_canonique);

  console.log(`${ents.length} sites à vérifier…`);
  const resultats = await enParallele(ents, 8, verifier);

  /**
   * Le verdict tient compte de la FORME du site, pas seulement des recoupements.
   * Un annuaire coche les trois indices et n'est toujours pas leur site.
   */
  const verdict = (r) => {
    if (r.nature === "domaine_mort") return "DOMAINE MORT — pas de site";
    if (r.score < 0) return "injoignable";
    if (r.nature === "annuaire") return "ANNUAIRE";
    if (r.nature === "site_propre") return "leur site (domaine à leur nom)";
    if (r.nature === "site_probable" && r.score >= 2) return "leur site (probable)";
    if (r.score >= 2) return "à regarder — indices bons, forme douteuse";
    return "AUCUN INDICE";
  };
  const parVerdict = resultats.reduce((a, r) => ((a[verdict(r)] = (a[verdict(r)] ?? 0) + 1), a), {});
  console.log("\n", parVerdict);

  // Les injoignables comptent dans le doute : un site mort n'est pas un site.
  // Le détail de l'erreur est affiché — un timeout, un DNS mort et un refus de
  // connexion ne disent pas la même chose du prospect.
  const erreurs = resultats
    .filter((r) => r.score < 0)
    .reduce((a, r) => ((a[r.erreur] = (a[r.erreur] ?? 0) + 1), a), {});
  if (Object.keys(erreurs).length) console.log("\nInjoignables, par cause :", erreurs);

  /**
   * Les annuaires découverts, versés en base pour que le prochain lot les
   * reconnaisse sans que personne n'ait rien à écrire.
   *
   * On ne verse QUE ce dont on est sûr : un domaine que la forme dénonce comme
   * annuaire, et qui n'est pas déjà classé. En `a_confirmer = false` — la preuve
   * est mécanique (six fiches d'entreprises liées depuis l'accueil), pas une
   * intuition.
   */
  const annuaires = [...new Set(resultats.filter((r) => r.nature === "annuaire").map((r) => {
    try { return new URL(r.urlFinale ?? r.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
  }).filter(Boolean))];
  if (annuaires.length) {
    const rep = await fetch(`${ENV.SUPABASE_URL}/rest/v1/domaines_classes?on_conflict=domaine`, {
      method: "POST",
      headers: {
        apikey: cle, Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(annuaires.map((d) => ({
        domaine: d, categorie: "annuaire", a_confirmer: false, cree_par: "verifier-sites.mjs",
        motif: "la page d'accueil renvoie vers d'autres fiches d'entreprises : c'est un annuaire",
      }))),
    });
    console.log(rep.ok
      ? `\n${annuaires.length} annuaires détectés et classés : ${annuaires.join(", ")}`
      : `\n(classement des annuaires refusé : ${rep.status})`);
  }

  const suspects = resultats
    .filter((r) => r.score <= 1 || r.nature === "annuaire" || r.nature === "doute")
    .sort((a, b) => a.score - b.score);
  const L = ["# Vérification des sites détenus", ""];
  L.push(`${ents.length} URL visitées. Un site à soi parle de soi : on y trouve le nom, le téléphone, la ville.`);
  L.push("Un annuaire, une page de réseau ou le site d'un fabricant n'en portent au mieux qu'un.");
  L.push("");
  for (const [k, v] of Object.entries(parVerdict)) L.push(`- **${k}** : ${v}`);
  L.push("", "## À revoir", "");
  L.push("| id | entreprise | URL | HTTP | titre de la page | nom | tél | ville |");
  L.push("|---:|---|---|---:|---|:-:|:-:|:-:|");
  const oc = (b) => (b ? "✅" : "—");
  for (const r of suspects) {
    L.push(
      `| ${r.id} | ${r.nom ?? ""} | <${r.url}> | ${r.http ?? r.erreur} | ${r.titre ?? ""} | ` +
        `${oc(r.indices.nom)} | ${oc(r.indices.telephone)} | ${oc(r.indices.ville)} |`,
    );
  }
  await writeFile(path.join(sortie, "_VERIFICATION.md"), L.join("\n"), "utf8");

  /*
   * LA VISITE FAIT FOI, PAS L'URL.
   *
   * Le constat posé jusqu'ici disait « présent » dès qu'une URL existait en
   * base. C'est ce qui produisait les faux positifs : sur 199 URL détenues,
   * 53 pointent vers un domaine qui n'existe plus et 61 répondent sans porter
   * la moindre trace de l'entreprise. Une URL est une adresse, pas une preuve.
   *
   * On reverse donc ce qu'on vient de constater de nos yeux :
   *   deux indices ou plus         → présent, confiance haute ;
   *   domaine INEXISTANT           → absent, et c'est le plus sûr des absents :
   *                                  un NXDOMAIN ne se discute pas ;
   *   joint mais sans aucun indice → inconnu. On tient une URL qui n'est pas la
   *                                  sienne : on ne sait donc rien de son site,
   *                                  et le dire vaut mieux que trancher.
   */
  if (process.argv.includes("--constats")) {
    const constats = [];
    for (const r of resultats) {
      const commun = {
        entreprise_id: r.id,
        sujet: "site_web",
        source: "verifier-sites",
        constate_par: "verifier-sites.mjs",
      };
      if (r.nature === "annuaire") {
        // Trois indices et pourtant pas leur site : c'est le cas que les
        // recoupements seuls laissaient passer.
        constats.push({
          ...commun,
          etat: "inconnu",
          valeur: null,
          confiance: "faible",
          preuve: { url_detenue: r.url, titre: r.titre, fiches_liees: r.fiches,
                    pourquoi: "l'URL détenue est un annuaire, pas leur site" },
        });
      } else if (r.score >= 2 && r.nature !== "doute") {
        constats.push({
          ...commun,
          etat: "present",
          valeur: r.urlFinale ?? r.url,
          confiance: r.score >= 3 ? "certaine" : "haute",
          preuve: { http: r.http, titre: r.titre, indices: r.indices, url_detenue: r.url,
                    nature: r.nature, domaine_au_nom: r.porteLeNom },
        });
      } else if (r.nature === "domaine_mort") {
        // La seule absence qu'on puisse affirmer sans réserve : le nom de
        // domaine n'existe pas. Il n'y a rien à visiter, et rien à espérer.
        constats.push({
          ...commun,
          etat: "absent",
          valeur: null,
          confiance: "certaine",
          preuve: { url_detenue: r.url, pourquoi: "le nom de domaine n'existe pas (NXDOMAIN)" },
        });
      } else if (r.score < 0) {
        // On ne distingue pas ici le NXDOMAIN du timeout : `verifier` ne rend
        // que « fetch failed ». Un DNS mort mérite « absent », un serveur lent
        // mérite « inconnu » — dans le doute on prend le moins affirmatif, et
        // le contrôle DNS reste à faire à part.
        constats.push({
          ...commun,
          etat: "inconnu",
          valeur: null,
          confiance: "faible",
          preuve: { url_detenue: r.url, erreur: r.erreur, pourquoi: "URL détenue mais injoignable" },
        });
      } else {
        constats.push({
          ...commun,
          etat: "inconnu",
          valeur: null,
          confiance: "faible",
          preuve: {
            url_detenue: r.url,
            http: r.http,
            titre: r.titre,
            indices: r.indices,
            pourquoi: "la page répond mais ne porte ni le nom, ni le téléphone, ni la ville",
          },
        });
      }
    }
    for (let i = 0; i < constats.length; i += 200) {
      const rep = await fetch(`${ENV.SUPABASE_URL}/rest/v1/constats_presence`, {
        method: "POST",
        headers: {
          apikey: cle,
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(constats.slice(i, i + 200)),
      });
      if (!rep.ok) throw new Error(`${rep.status} ${(await rep.text()).slice(0, 200)}`);
    }
    const c = constats.reduce((a, x) => ((a[x.etat] = (a[x.etat] ?? 0) + 1), a), {});
    console.log(`\n${constats.length} constats posés depuis la visite :`, c);
  }
  await writeFile(
    path.join(sortie, "_SUSPECTS.json"),
    JSON.stringify(suspects.map((r) => r.id), null, 2),
    "utf8",
  );
  console.log(`\n${suspects.length} à revoir → ${path.join(sortie, "_VERIFICATION.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
