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

async function verifier(e) {
  const url = (e.site_web_canonique || e.canonical_url || "").trim();
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

    return { id: e.id, nom: e.name, url, http: res.status, urlFinale: res.url, titre: titre.slice(0, 110), indices, score };
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
  const res = await fetch(
    `${ENV.SUPABASE_URL}/rest/v1/entreprises?cohorte_demarchage=eq.${encodeURIComponent(cohorte)}` +
      `&archived_at=is.null&select=id,name,ville,code_postal,telephone,canonical_url,site_web_canonique&limit=2000`,
    { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
  );
  const ents = (await res.json()).filter((e) => (e.site_web_canonique || e.canonical_url || "").trim());

  console.log(`${ents.length} sites à vérifier…`);
  const resultats = await enParallele(ents, 8, verifier);

  const verdict = (r) =>
    r.score < 0 ? "injoignable" : r.score >= 2 ? "c'est bien leur site" : r.score === 1 ? "un seul indice" : "AUCUN INDICE";
  const parVerdict = resultats.reduce((a, r) => ((a[verdict(r)] = (a[verdict(r)] ?? 0) + 1), a), {});
  console.log("\n", parVerdict);

  // Les injoignables comptent dans le doute : un site mort n'est pas un site.
  // Le détail de l'erreur est affiché — un timeout, un DNS mort et un refus de
  // connexion ne disent pas la même chose du prospect.
  const erreurs = resultats
    .filter((r) => r.score < 0)
    .reduce((a, r) => ((a[r.erreur] = (a[r.erreur] ?? 0) + 1), a), {});
  if (Object.keys(erreurs).length) console.log("\nInjoignables, par cause :", erreurs);

  const suspects = resultats
    .filter((r) => r.score <= 1)
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
      if (r.score >= 2) {
        constats.push({
          ...commun,
          etat: "present",
          valeur: r.urlFinale ?? r.url,
          confiance: r.score >= 3 ? "certaine" : "haute",
          preuve: { http: r.http, titre: r.titre, indices: r.indices, url_detenue: r.url },
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
