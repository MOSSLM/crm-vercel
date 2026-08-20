#!/usr/bin/env node
/**
 * L'exécuteur local du lissage — la moitié de la file qui vit sur cette machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE, ET POURQUOI CE N'EST PAS UN PIS-ALLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Dix des vingt-huit bots du registre sont des scripts locaux : Playwright, un
 * profil Chrome persistant, des CAPTCHA qu'on ne contourne qu'à l'œil. Rien de
 * tout ça ne tient dans une fonction serverless — et ce n'est pas une limite à
 * repousser, c'est la raison pour laquelle ces bots marchent. Matteo l'a posé
 * lui-même : ceux-là peuvent n'être utilisables que quand il ouvre son poste.
 *
 * La file, elle, vit en base. Ce script est le bras : il réclame les étapes qui
 * l'attendent, lance l'outil, et rend des CONSTATS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Il n'écrit AUCUNE URL de site. Le dossier web PROPOSE, un humain écrit —
 *     c'est la règle du registre, et elle a été payée : un mauvais rapprochement
 *     contamine ensuite le RGE et les finances. Les candidats vont dans le
 *     dossier de la ligne ; l'étape de relecture les reprendra.
 *   · Il ne réclame pas les étapes « humain ». Elles attendent un écran.
 *   · Il n'invente pas de verdict d'absence : il importe `constatSite` de
 *     `scripts/prospection/verdict-site.mjs`, la MÊME règle que
 *     `appliquer-dossiers.mjs`. Deux définitions de « sans site » divergeraient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT LE JOUER
 * ─────────────────────────────────────────────────────────────────────────────
 *   npm run dev                          (dans un autre terminal)
 *   node scripts/lissage/runner.mjs                       — un lot de 20
 *   node scripts/lissage/runner.mjs --taille 50 --boucle  — jusqu'à épuisement
 *   node scripts/lissage/runner.mjs --passe <uuid>        — une passe précise
 *   node scripts/lissage/runner.mjs --simuler             — ne rend rien
 *
 * `--simuler` montre ce qui serait rendu et n'appelle pas le POST. La règle du
 * dépôt vaut ici comme ailleurs : rien n'est écrit sans qu'on l'ait demandé.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { constatSite } from "../prospection/verdict-site.mjs";

const RACINE = process.cwd();
const SORTIE_DOSSIERS = path.join(RACINE, ".prospection", "dossiers");

function lireArgs(argv) {
  const a = { taille: 20, base: "http://localhost:3000", passe: null, boucle: false, simuler: false };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--taille") a.taille = Number(argv[++i]) || 20;
    else if (v === "--passe") a.passe = argv[++i];
    else if (v === "--base") a.base = argv[++i];
    else if (v === "--boucle") a.boucle = true;
    else if (v === "--simuler") a.simuler = true;
  }
  return a;
}

/** `.env.local` lu à la main : ce script doit tourner sans `npm install`. */
async function lireEnvLocal() {
  const env = { ...process.env };
  for (const nom of [".env.local", ".env"]) {
    const chemin = path.join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    for (const ligne of (await readFile(chemin, "utf8")).split("\n")) {
      const m = ligne.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let valeur = m[2].trim();
      if ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'"))) {
        valeur = valeur.slice(1, -1);
      }
      if (env[m[1]] === undefined) env[m[1]] = valeur;
    }
  }
  return env;
}

const entetes = (env) => {
  const h = { "content-type": "application/json" };
  // Le même contrat que le cron : en local, sans secret configuré, la route
  // laisse passer. Avec un secret, il faut le présenter.
  if (env.CRON_SECRET) h.authorization = `Bearer ${env.CRON_SECRET}`;
  else if (env.PG_CRON_SECRET) h["x-pg-cron-secret"] = env.PG_CRON_SECRET;
  return h;
};

/** Lancer un script du dépôt et attendre sa fin. Sa sortie reste visible. */
function lancer(script, args) {
  return new Promise((resoudre) => {
    const p = spawn(process.execPath, [script, ...args], { stdio: "inherit", cwd: RACINE });
    p.on("close", (code) => resoudre(code ?? 1));
    p.on("error", () => resoudre(1));
  });
}

/** Les lignes de `_index.jsonl`, par identifiant d'entreprise. Dernière gagne. */
async function lireIndexDossiers() {
  const chemin = path.join(SORTIE_DOSSIERS, "_index.jsonl");
  if (!existsSync(chemin)) return new Map();
  const m = new Map();
  for (const ligne of (await readFile(chemin, "utf8")).split("\n")) {
    if (!ligne.trim()) continue;
    try {
      const o = JSON.parse(ligne);
      if (o?.id != null) m.set(Number(o.id), o);
    } catch {
      // Une ligne illisible ne fait pas tomber le lot : on la saute.
    }
  }
  return m;
}

/**
 * Le dossier web : la fiche Google ET les candidats de site, en un passage.
 *
 * DEUX SUJETS, DEUX TRAITEMENTS DIFFÉRENTS :
 *
 *   · la fiche Google se TRANCHE. L'API Places fait autorité : elle répond
 *     « trouvée » ou « pas trouvée », et les deux sont des résultats.
 *   · le site ne se tranche qu'à la baisse. Un `absent` s'écrit — la règle
 *     partagée dit sur quelle preuve — mais un `present` JAMAIS : il vaudrait
 *     écriture d'URL, et l'écriture exige une relecture humaine.
 */
async function outilDossierWeb(items, a) {
  const ids = items.map((i) => i.prospect?.entrepriseId).filter(Boolean);
  if (ids.length === 0) return [];
  const code = await lancer("scripts/prospection/dossier-web.mjs", ["--ids", ids.join(","), "--refaire"]);
  const index = await lireIndexDossiers();

  return items.map((item) => {
    const id = item.prospect?.entrepriseId;
    const l = index.get(Number(id));
    if (!l) {
      // Le script s'est arrêté avant cette fiche — trois refus de Google, le
      // plus souvent. C'est `inconnu`, et surtout PAS `absent`.
      return {
        ligneId: item.ligneId,
        outil: item.outil,
        constats: [],
        erreur: code === 0 ? "aucun dossier produit pour cette fiche" : "le dossier web s'est arrêté avant cette fiche",
      };
    }

    const constats = [];

    // ── La fiche Google, tranchée ────────────────────────────────────────
    if (l.ficheGoogle && l.placeId) {
      constats.push({
        sujet: "fiche_google",
        etat: "present",
        valeur: l.placeId,
        confiance: "certaine",
        source: "dossier-web",
        preuve: { nom: l.nomGoogle, avis: l.avis, note: l.note, site_declare: l.siteSurFiche },
      });
    } else if (l.ficheGoogle === false) {
      constats.push({
        sujet: "fiche_google",
        etat: "absent",
        confiance: "haute",
        source: "dossier-web",
        preuve: { pourquoi: "l'API Places ne rend aucune fiche pour ce nom et cette commune" },
      });
    }

    // ── Le site : la règle partagée, et rien de plus ─────────────────────
    const verdict = constatSite(l);
    // « present » veut dire « écris cette URL », et ça ne se fait pas sans
    // relecture. On garde le candidat, on n'écrit pas le constat.
    if (verdict.etat !== "present") {
      constats.push({ sujet: "site_web", ...verdict, source: "dossier-web" });
    }

    const candidats = verdict.etat === "present" ? [{ url: verdict.valeur, confiance: verdict.confiance, motif: l.motif }] : [];

    return {
      ligneId: item.ligneId,
      outil: item.outil,
      constats,
      dossier: { candidats, dossier_fichier: l.fichier, moteur: l.moteur },
    };
  });
}

/**
 * Le vérificateur de sites : il va LIRE la page, et c'est ce qui tranche.
 *
 * Il travaille sur les URL déjà connues. Un domaine qui n'existe pas, une page
 * qui ne parle pas d'eux : ce sont les 67 fiches du 20/08 dont la colonne
 * portait une URL et le constat disait « absent ». Le constat avait raison.
 */
async function outilVerifierSites(items) {
  const ids = items.map((i) => i.prospect?.entrepriseId).filter(Boolean);
  if (ids.length === 0) return [];
  // `--constats` EST OBLIGATOIRE ICI : sans lui le script visite et ne rend
  // qu'un rapport Markdown, donc la file ne verrait jamais rien changer et
  // relancerait éternellement. C'est aussi la seule chose qui le fait écrire —
  // par défaut il ne touche à rien.
  await lancer("scripts/prospection/verifier-sites.mjs", ["--ids", ids.join(","), "--constats"]);
  // Il pose LUI-MÊME ses constats dans `constats_presence`. On ne les redouble
  // donc pas : on dit que l'outil est passé, et la file relira les faits.
  return items.map((item) => ({ ligneId: item.ligneId, outil: item.outil, constats: [] }));
}

const OUTILS = {
  "dossier-web": outilDossierWeb,
  "verifier-sites": outilVerifierSites,
};

async function unTour(a, env) {
  const url = new URL("/api/lissage/local", a.base);
  url.searchParams.set("taille", String(a.taille));
  url.searchParams.set("machine", os.hostname());
  if (a.passe) url.searchParams.set("passeId", a.passe);

  const r = await fetch(url, { headers: entetes(env) });
  if (!r.ok) {
    console.error(`Réclamation refusée (${r.status}) : ${await r.text()}`);
    return 0;
  }
  const { items = [] } = await r.json();
  if (items.length === 0) {
    console.log("Rien ne m'attend dans la file.");
    return 0;
  }

  // Un appel de script par OUTIL, pas par prospect : `dossier-web --ids a,b,c`
  // fait le lot d'un coup, et c'est ce qui rend le débit tenable.
  const parOutil = new Map();
  for (const i of items) {
    if (!parOutil.has(i.outil)) parOutil.set(i.outil, []);
    parOutil.get(i.outil).push(i);
  }

  const comptes = [];
  for (const [outil, lot] of parOutil) {
    const executeur = OUTILS[outil];
    if (!executeur) {
      console.warn(`« ${outil} » n'est pas branché sur ce poste — ${lot.length} ligne(s) rendues telles quelles.`);
      comptes.push(
        ...lot.map((i) => ({
          ligneId: i.ligneId,
          outil,
          constats: [],
          erreur: "cet outil n'est pas branché sur le poste local",
        })),
      );
      continue;
    }
    console.log(`\n▸ ${outil} — ${lot.length} prospect(s)`);
    comptes.push(...(await executeur(lot, a)));
  }

  if (a.simuler) {
    console.log("\n--simuler : rien n'est rendu. Voici ce qui partirait :");
    console.log(JSON.stringify(comptes, null, 2));
    return 0;
  }

  const rendu = await fetch(new URL("/api/lissage/local", a.base), {
    method: "POST",
    headers: entetes(env),
    body: JSON.stringify({ comptes }),
  });
  if (!rendu.ok) {
    console.error(`Le compte rendu a été refusé (${rendu.status}) : ${await rendu.text()}`);
    return 0;
  }
  const bilan = await rendu.json();
  console.log(`\n${bilan.enregistres} ligne(s) rendues à la file.`);
  return items.length;
}

async function principal() {
  const a = lireArgs(process.argv);
  const env = await lireEnvLocal();
  console.log(`Poste local — ${os.hostname()} → ${a.base}${a.simuler ? " (simulation)" : ""}`);

  let total = 0;
  for (;;) {
    const n = await unTour(a, env);
    total += n;
    if (!a.boucle || n === 0) break;
  }
  console.log(`\nFini — ${total} ligne(s) traitées.`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
