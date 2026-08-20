#!/usr/bin/env node
/**
 * Reporter les dossiers web dans le CRM — la seule moitié qui écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UN SCRIPT SÉPARÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `dossier-web.mjs` ne touche à rien : il cherche et il range. Cette séparation
 * n'est pas de la coquetterie. Elle permet de relancer la collecte autant de
 * fois qu'on veut sans conséquence, de relire les dossiers à froid, et de ne
 * décider qu'après. Ici, à l'inverse, tout est irréversible sans le journal —
 * d'où les deux verrous ci-dessous.
 *
 *   · RIEN N'EST ÉCRIT SANS `--ecrire`. Par défaut le script montre ce qu'il
 *     ferait, ligne par ligne, et s'arrête.
 *   · L'ÉTAT D'AVANT EST ARCHIVÉ avant la première écriture, dans
 *     `journal_dossiers_web_20260817`. Le trigger `updated_at` détruit sinon la
 *     seule preuve de ce qui était là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST ÉCRIT, ET CE QUI NE L'EST JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Écrit, et seulement sur une case vide (sauf `--ecraser`) :
 *   site_web_canonique · canonical_url  le site trouvé. C'est LA valeur qui
 *     débloque tout le reste : la fonction déployée `enrich-lead-magnet` part de
 *     `site_web_canonique || canonical_url` pour scraper. Sans elle, elle n'a
 *     rien à lire — et c'est pourquoi zéro projet de la cohorte B est enrichi.
 *   google_place_id                     l'identifiant v1 de la fiche. La même
 *     fonction le re-cherche sinon par requête texte, ET CETTE RECHERCHE EST
 *     FACTURÉE : son propre commentaire dit que c'est « le chiffre à surveiller
 *     sur un gros lot ». L'écrire une fois l'économise à chaque enrichissement.
 *   google_maps_url · note_moyenne · nombre_avis   ce que la fiche déclare.
 *
 * Jamais écrit :
 *   qualifie, owner_id          ils appartiennent à l'attribution, pas à nous.
 *   telephone, name, adresse    le bot voit souvent un numéro différent de celui
 *     du CRM (portable du patron d'un côté, ligne fixe de la fiche de l'autre).
 *     Choisir entre les deux est un arbitrage humain, pas une écriture de masse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DES CHAÎNES
 * ─────────────────────────────────────────────────────────────────────────────
 * Plusieurs fiches d'un même réseau tombent sur la même URL — c'est la règle
 * posée le 17/08 : « même URL ou base d'URL et adresses différentes, c'est une
 * chaîne ». Les écrire toutes ferait exactement ce qu'on cherche à éviter :
 * fabriquer des doublons de site là où il faut un tag de réseau. Toute URL
 * réclamée par deux entreprises ou plus est donc ÉCARTÉE et listée à part.
 *
 *   node scripts/prospection/appliquer-dossiers.mjs                (simulation)
 *   node scripts/prospection/appliquer-dossiers.mjs --ecrire
 *   node scripts/prospection/appliquer-dossiers.mjs --confiance certaine --ecrire
 */

import { readFile, writeFile } from "node:fs/promises";
import { constatSite } from "./verdict-site.mjs";
import { existsSync } from "node:fs";
import path from "node:path";

const RACINE = process.cwd();

async function lireEnvLocal() {
  const env = { ...process.env };
  for (const nom of [".env.local", ".env"]) {
    const chemin = path.join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    for (const ligne of (await readFile(chemin, "utf8")).split("\n")) {
      const m = ligne.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

const AIDE = `
Usage : node scripts/prospection/appliquer-dossiers.mjs [options]

  --volet google          n'écrit que ce qui ne demande aucun jugement :
                          place_id, note, nombre d'avis. C'est le défaut.
  --volet site            n'écrit que les URL. Demande --relu (voir plus bas).
  --volet constats        pose les constats de présence à trois états, dans
                          constats_presence : présent / absent / inconnu.
                          N'écrit rien sur entreprises, n'écrase jamais rien.
  --volet tout            google + site.
  --relu <fichier.json>   la liste des id dont l'URL a été relue et validée.
                          Sans elle, aucune URL n'est écrite.
  --ecrire                applique vraiment (sans lui : simulation)
  --confiance a,b         niveaux retenus (défaut : certaine,haute)
  --sortie <dossier>      où sont les dossiers (défaut .prospection/dossiers)
  --ecraser               remplace aussi les valeurs déjà présentes
  --limite N              s'arrêter après N fiches
`;

function lireArgs(argv) {
  const a = {
    ecrire: false,
    confiance: ["certaine", "haute"],
    sortie: path.join(RACINE, ".prospection", "dossiers"),
    ecraser: false,
    limite: 0,
    volet: "google",
    relu: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const c = argv[i];
    const v = argv[i + 1];
    if (c === "--ecrire") a.ecrire = true;
    else if (c === "--ecraser") a.ecraser = true;
    else if (c === "--confiance") (a.confiance = v.split(",").map((s) => s.trim())), i++;
    else if (c === "--sortie") (a.sortie = path.resolve(RACINE, v)), i++;
    else if (c === "--limite") (a.limite = Number(v)), i++;
    else if (c === "--volet") (a.volet = v), i++;
    else if (c === "--relu") (a.relu = path.resolve(RACINE, v)), i++;
    else if (c === "--aide" || c === "-h") (console.log(AIDE), process.exit(0));
    else if (c.startsWith("--")) (console.error(`Option inconnue : ${c}\n${AIDE}`), process.exit(1));
  }
  if (!["google", "site", "constats", "tout"].includes(a.volet)) {
    console.error(`--volet doit valoir google, site, constats ou tout (reçu : ${a.volet})`);
    process.exit(1);
  }
  return a;
}


async function poserConstats(lignes) {
  const constats = lignes.map((l) => {
    const c = constatSite(l);
    return {
      entreprise_id: l.id,
      sujet: "site_web",
      etat: c.etat,
      valeur: c.valeur,
      confiance: c.confiance,
      source: `dossier-web/${l.moteur ?? "places"}`,
      preuve: c.preuve,
      constate_par: "dossier-web.mjs",
    };
  });

  const compte = constats.reduce((acc, c) => ((acc[c.etat] = (acc[c.etat] ?? 0) + 1), acc), {});
  console.log(
    `\nConstats de présence du site : ` +
      `${compte.present ?? 0} présent · ${compte.absent ?? 0} absent (cherché, rien trouvé) · ` +
      `${compte.inconnu ?? 0} inconnu (pas cherché)`,
  );
  return constats;
}

/**
 * LE VOLET « SITE » NE S'ÉCRIT PAS TOUT SEUL, ET C'EST VOULU.
 *
 * La question posée le 17/08 : « la partie qui écrit doit-elle être faite en
 * code ? c'est pas mieux que ce soit toi qui vérifie ? » Réponse mesurée sur le
 * lot : les deux, mais pas sur les mêmes champs.
 *
 * `place_id`, note, avis viennent de l'API Places sur une fiche appariée par nom
 * et code postal — 147 fiches sur 147, aucune ambiguïté, aucun jugement. Les
 * relire à la main n'ajouterait que des fautes de recopie.
 *
 * L'URL, non. Le lot a rendu, tous classés « certaine » parce que c'est bien ce
 * que la fiche Google déclare :
 *   mestre.fr/magasins/lyon-10020            la page d'un magasin de chaîne
 *   cclhome.fr/agences/5459-perpignan-sud    idem
 *   luve.it                                  le fabricant italien, pas la filiale
 *   confort.mitsubishielectric.fr/installateur/…   l'annuaire du fabricant
 *   repreneurs.com/845356815-pac-access      une annonce de cession
 * La fiche a raison à chaque fois, et à chaque fois ce n'est pas le site de
 * l'artisan. C'est une lecture, pas un filtre : aucune liste de domaines ne
 * rattrapera le cas suivant, qui sera un autre fabricant, un autre réseau.
 *
 * D'où le verrou : `--volet site` exige `--relu <fichier>`, la liste explicite
 * des id dont l'URL a été regardée. Ce que le script sait faire, il le fait ;
 * ce qu'il ne sait pas, il refuse de le deviner.
 */
const SIGNATURE_PAGE_DE_RESEAU =
  /\/(agences?|magasins?|boutiques?|points?-de-vente|installateurs?|revendeurs?|distributeurs?|partenaires?|artisans?|pros?|annuaire|filiales?)\//i;

let ENV = {};

async function rest(chemin, init = {}) {
  const base = ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
  const cle = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}

const hoteDe = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * L'URL débarrassée de ce qui n'identifie pas le site.
 *
 * Les fiches Google rendent souvent l'URL taguée par Google lui-même
 * (`?utm_source=gmb`, `?srsltid=…`). Stocker ça, c'est stocker une campagne
 * dans un champ censé porter une adresse — et deux fiches du même site ne se
 * reconnaîtraient plus entre elles.
 */
function urlPropre(brute) {
  try {
    const u = new URL(brute);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|srsltid|gclid|fbclid|mc_|_ga)/i.test(p)) u.searchParams.delete(p);
    }
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch {
    return brute;
  }
}

/**
 * La liste de ce qui attend une lecture, rangée par urgence de suspicion.
 *
 * Ce fichier est le seul livrable qui demande du temps humain. Il est donc trié
 * pour que les cas douteux soient EN HAUT : une URL qui ressemble à une page de
 * réseau se juge en une seconde, une URL au nom de l'entreprise se valide en
 * bloc. Le tri, c'est la moitié du travail de relecture.
 */
async function ecrireARelire(sortie, aRelire) {
  const suspecte = (r) => {
    const raisons = [];
    if (SIGNATURE_PAGE_DE_RESEAU.test(r.url)) raisons.push("page de réseau ou d'annuaire");
    if (!r.ligne.motif?.includes("le domaine porte le nom") && r.ligne.confiance !== "certaine") {
      raisons.push("le domaine ne porte pas le nom");
    }
    try {
      if (new URL(r.url).pathname.split("/").filter(Boolean).length >= 2) {
        raisons.push("URL profonde, pas une page d'accueil");
      }
    } catch {
      /* URL illisible : elle ressortira de toute façon */
    }
    if (r.ligne.confiance !== "certaine") raisons.push(`confiance ${r.ligne.confiance}`);
    return raisons;
  };

  const lignes = aRelire
    .map((r) => ({ ...r, raisons: suspecte(r) }))
    .sort((a, b) => b.raisons.length - a.raisons.length);

  const L = [];
  L.push("# URL à relire avant écriture");
  L.push("");
  L.push(
    `${lignes.length} fiches n'ont aucune URL dans le CRM et le bot en propose une. ` +
      "Les plus douteuses d'abord : chaque ligne dit pourquoi elle l'est.",
  );
  L.push("");
  L.push("Valider = mettre l'id dans un JSON, puis :");
  L.push("");
  L.push("```bash");
  L.push("node scripts/prospection/appliquer-dossiers.mjs --volet site --relu valides.json --ecrire");
  L.push("```");
  L.push("");
  L.push("| id | entreprise | URL proposée | confiance | à vérifier | dossier |");
  L.push("|---:|---|---|---|---|---|");
  for (const r of lignes) {
    L.push(
      `| ${r.ligne.id} | ${r.avant.name ?? ""} | <${r.url}> | ${r.ligne.confiance} | ` +
        `${r.raisons.length ? r.raisons.join(" · ") : "—"} | [dossier](${encodeURI(r.ligne.fichier)}) |`,
    );
  }
  L.push("");
  L.push("Liste brute des id, à filtrer avant de la passer en `--relu` :");
  L.push("");
  L.push("```json");
  L.push(JSON.stringify(lignes.map((r) => r.ligne.id)));
  L.push("```");
  L.push("");
  await writeFile(path.join(sortie, "_A-RELIRE.md"), L.join("\n"), "utf8");
  console.log(`\n${lignes.length} URL à relire → ${path.join(sortie, "_A-RELIRE.md")}`);
}

async function main() {
  const a = lireArgs(process.argv);
  ENV = await lireEnvLocal();

  const chemin = path.join(a.sortie, "_index.jsonl");
  if (!existsSync(chemin)) {
    console.error(`Pas d'index à ${chemin} — lancer d'abord dossier-web.mjs.`);
    process.exit(1);
  }

  // Une entreprise retraitée écrit une ligne de plus : la dernière fait foi.
  const parId = new Map();
  for (const l of (await readFile(chemin, "utf8")).split("\n").filter(Boolean)) {
    const o = JSON.parse(l);
    parId.set(o.id, o);
  }

  /*
   * LE FILTRE DE CONFIANCE PORTE SUR L'URL, ET SUR ELLE SEULE.
   *
   * Première version : il s'appliquait à tout, et écartait donc 104 `place_id`
   * parfaitement sûrs sous prétexte que l'URL de la même fiche était douteuse.
   * Or les deux n'ont rien à voir — l'identifiant vient de l'API Places sur une
   * fiche appariée par nom et code postal, la confiance qualifie la seule
   * question « ce site est-il le sien ». Une fiche Google certaine peut très
   * bien déclarer la page d'un magasin de chaîne.
   *
   * Les données Google concernent donc TOUTES les fiches identifiées ; le
   * filtre de confiance et l'exclusion des chaînes ne gouvernent que les URL.
   */
  const tous = [...parId.values()];
  /*
   * `accord` est la condition d'entrée, pas un détail.
   *
   * Sans lui, on écrivait le `place_id` de « Air Pr'eau » sur « Roud EPC »
   * parce que les deux partagent un code postal — et le 409 de la contrainte
   * unique a été la seule chose qui l'ait signalé, par hasard, sur une fiche où
   * l'identifiant était déjà pris ailleurs. Les autres seraient passées.
   *
   * Un index d'avant ce champ ne contient pas `accord` : on ne devine pas, on
   * refuse. Relancer la collecte le remplit.
   */
  const avecFiche = tous.filter((l) => l.placeId && l.accord === true);
  const nonAccordes = tous.filter((l) => l.placeId && l.accord !== true);
  const retenues = tous.filter((l) => l.url && a.confiance.includes(l.confiance));

  // Les chaînes, écartées des URL avant tout le reste.
  const parHote = new Map();
  for (const l of retenues) {
    const h = hoteDe(l.url);
    if (!parHote.has(h)) parHote.set(h, []);
    parHote.get(h).push(l);
  }
  const chaines = [...parHote.entries()].filter(([, v]) => v.length > 1);
  const idsChaines = new Set(chaines.flatMap(([, v]) => v.map((l) => l.id)));
  const urlsSaines = retenues.filter((l) => !idsChaines.has(l.id));

  const ecritSite = a.volet === "site" || a.volet === "tout";
  const ecritGoogle = a.volet === "google" || a.volet === "tout";

  // Les constats se posent sur TOUTES les fiches du lot — y compris, et surtout,
  // celles où l'on n'a rien trouvé : c'est là que le constat porte l'information.
  if (a.volet === "constats") {
    const constats = await poserConstats(tous);
    if (!a.ecrire) {
      console.log("\nSimulation. Rien n'a été écrit. Ajouter --ecrire pour appliquer.");
      return;
    }
    for (let i = 0; i < constats.length; i += 200) {
      await rest("constats_presence", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(constats.slice(i, i + 200)),
      });
    }
    console.log(`${constats.length} constats posés (table append-only : rien n'a été écrasé).`);
    return;
  }

  // L'union : une fiche entre dans le plan si l'un des deux volets a de quoi
  // écrire dessus.
  const parIdCandidat = new Map();
  if (ecritGoogle) for (const l of avecFiche) parIdCandidat.set(l.id, l);
  if (ecritSite) for (const l of urlsSaines) parIdCandidat.set(l.id, l);
  let aEcrire = [...parIdCandidat.values()].sort((x, y) => x.id - y.id);
  if (a.limite) aEcrire = aEcrire.slice(0, a.limite);

  console.log(
    `${parId.size} dossiers · volet ${a.volet}\n` +
      `  données Google : ${avecFiche.length} fiches identifiées ET confirmées` +
      (nonAccordes.length ? `, ${nonAccordes.length} non confirmées (écartées)` : "") +
      "\n" +
      `  URL            : ${retenues.length} retenues (${a.confiance.join("/")}), ` +
      `${idsChaines.size} écartées comme chaînes\n` +
      `  → ${aEcrire.length} fiches examinées`,
  );

  if (chaines.length) {
    console.log("\nURL réclamées par plusieurs entreprises — à traiter en réseau, pas en site :");
    for (const [h, v] of chaines.sort((x, y) => y[1].length - x[1].length)) {
      console.log(`  ${h} → ${v.length} fiches : ${v.map((l) => l.id).join(", ")}`);
    }
  }

  if (!aEcrire.length) return;

  // L'état actuel, relu en base plutôt que repris du dossier : le dossier peut
  // dater de plusieurs jours, et une fiche a pu être enrichie entre-temps.
  const ids = aEcrire.map((l) => l.id);
  const actuelles = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const paquet = ids.slice(i, i + 200);
    const lignes = await rest(
      `entreprises?id=in.(${paquet.join(",")})&select=id,name,canonical_url,site_web_canonique,google_place_id,google_maps_url,note_moyenne,nombre_avis`,
    );
    for (const l of lignes) actuelles.set(l.id, l);
  }

  // Les id relus et validés, s'il y en a. Le fichier accepte les deux formes
  // qu'on écrit naturellement : une liste d'id, ou une liste d'objets {id}.
  let relus = null;
  if (a.relu) {
    const brut = JSON.parse(await readFile(a.relu, "utf8"));
    relus = new Set((Array.isArray(brut) ? brut : (brut.valides ?? [])).map((x) => Number(x?.id ?? x)));
    console.log(`\n${relus.size} URL relues et validées (${path.basename(a.relu)}).`);
  }

  if (ecritSite && !relus) {
    console.error(
      "\n--volet site sans --relu : refusé.\n" +
        "Les URL demandent une lecture — la fiche Google déclare parfois la page\n" +
        "d'un magasin de chaîne ou l'annuaire d'un fabricant, et elle a raison.\n" +
        "Relire _A-RELIRE.md, puis passer la liste des id validés en --relu.",
    );
    process.exit(1);
  }

  const vide = (v) => v === null || v === undefined || String(v).trim() === "";
  const plan = [];
  const aRelire = [];
  for (const l of aEcrire) {
    const e = actuelles.get(l.id);
    if (!e) continue;
    const url = urlPropre(l.url);
    const patch = {};

    if (ecritSite && relus.has(l.id)) {
      if (a.ecraser || vide(e.site_web_canonique)) patch.site_web_canonique = url;
      if (a.ecraser || vide(e.canonical_url)) patch.canonical_url = url;
    } else if (vide(e.site_web_canonique) && vide(e.canonical_url)) {
      // Une fiche sans aucune URL et dont la proposition n'est pas relue : c'est
      // exactement ce qui doit passer sous les yeux de quelqu'un.
      aRelire.push({ ligne: l, avant: e, url });
    }

    if (ecritGoogle) {
      if (l.placeId && (a.ecraser || vide(e.google_place_id))) patch.google_place_id = l.placeId;
      if (l.note != null && (a.ecraser || e.note_moyenne == null)) patch.note_moyenne = l.note;
      if (l.avis != null && (a.ecraser || e.nombre_avis == null)) patch.nombre_avis = l.avis;
    }

    if (Object.keys(patch).length) plan.push({ ligne: l, avant: e, patch });
  }

  if (aRelire.length) await ecrireARelire(a.sortie, aRelire);

  console.log(`\n${plan.length} fiches à modifier réellement (les autres ont déjà tout).\n`);
  for (const p of plan.slice(0, 15)) {
    console.log(
      `  ${p.ligne.id} ${(p.avant.name ?? "").slice(0, 38).padEnd(38)} ${Object.keys(p.patch).join(", ")}`,
    );
    if (p.patch.site_web_canonique) console.log(`        → ${p.patch.site_web_canonique}`);
  }
  if (plan.length > 15) console.log(`  … et ${plan.length - 15} autres`);

  if (!a.ecrire) {
    console.log("\nSimulation. Rien n'a été écrit. Ajouter --ecrire pour appliquer.");
    await writeFile(
      path.join(a.sortie, "_PLAN.json"),
      JSON.stringify(plan.map((p) => ({ id: p.ligne.id, patch: p.patch })), null, 2),
      "utf8",
    );
    return;
  }

  // Le journal AVANT la première écriture. Insertion par paquets : PostgREST
  // accepte un tableau, et 300 allers-retours pour un archivage seraient absurdes.
  const archive = plan.map((p) => ({
    entreprise_id: p.ligne.id,
    canonical_url_avant: p.avant.canonical_url,
    site_web_canonique_avant: p.avant.site_web_canonique,
    google_place_id_avant: p.avant.google_place_id,
    note_moyenne_avant: p.avant.note_moyenne,
    nombre_avis_avant: p.avant.nombre_avis,
    url_appliquee: p.patch.site_web_canonique ?? p.patch.canonical_url ?? null,
    confiance: p.ligne.confiance,
    motif: p.ligne.motif,
  }));
  for (let i = 0; i < archive.length; i += 200) {
    await rest("journal_dossiers_web_20260817?on_conflict=entreprise_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(archive.slice(i, i + 200)),
    });
  }
  console.log(`Journal : ${archive.length} états archivés.`);

  let ok = 0;
  const echecs = [];
  for (const p of plan) {
    try {
      await rest(`entreprises?id=eq.${p.ligne.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(p.patch),
      });
      ok++;
    } catch (e) {
      // Un échec isolé n'annule pas le lot : la cause la plus probable est une
      // clé de dédoublonnage déjà prise — c'est-à-dire une chaîne que la
      // détection par hôte n'a pas vue, parce que le réseau utilise deux
      // domaines. On la remonte au lieu de la taire.
      echecs.push({ id: p.ligne.id, nom: p.avant.name, erreur: String(e.message).slice(0, 160) });
    }
  }

  console.log(`\n${ok} fiches mises à jour, ${echecs.length} en échec.`);
  if (echecs.length) {
    for (const e of echecs.slice(0, 20)) console.log(`  ${e.id} ${e.nom} — ${e.erreur}`);
    await writeFile(path.join(a.sortie, "_ECHECS.json"), JSON.stringify(echecs, null, 2), "utf8");
  }
  console.log(
    "\nRollback : sql/20260817_dossiers_web_appliques.sql en donne la requête, " +
      "depuis journal_dossiers_web_20260817.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
