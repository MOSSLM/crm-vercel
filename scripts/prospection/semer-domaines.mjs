#!/usr/bin/env node
/**
 * Verser les listes de domaines du bot dans `url_blacklist`, une fois pour toutes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL NE SERT QU'UNE FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « On pourrait lister les annuaires dans Supabase chaque fois que t'en détectes
 * un, du coup ça évite au robot de les enregistrer à chaque fois. Ça éviterait
 * d'avoir un agent, ça pourrait juste être algorithmique. » — 17/08.
 *
 * C'est exactement le bon découpage. Les listes vivaient dans le fichier du bot :
 * chaque annuaire découvert demandait une modification de code, un commit, un
 * déploiement — et surtout, la connaissance restait dans le dépôt au lieu d'être
 * dans la base que tout le reste du CRM interroge déjà.
 *
 * Ce script fait le versement initial. Ensuite, `dossier-web.mjs` LIT la base et
 * y AJOUTE ce qu'il découvre : plus jamais de code à changer pour un annuaire de
 * plus. Les constantes du bot restent comme semence, pour qu'une base vide ou un
 * poste neuf reparte avec ce qu'on sait déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DANS `url_blacklist`. JAMAIS.
 * ─────────────────────────────────────────────────────────────────────────────
 * C'était le premier réflexe, et c'était un piège. `url_blacklist` porte un
 * trigger, `trg_blacklist_cleanup`, qui appelle `_delete_blacklisted_rows_for_rule` :
 * un DELETE SEC sur `entreprises` et `entreprises_raw` dès qu'une entrée passe
 * à `active = true`. Y verser 145 annuaires aurait supprimé toutes les fiches
 * qui les portent — l'inverse exact de la règle « masquer, jamais supprimer ».
 * Le lot n'est passé que parce que le trigger a dépassé le délai maximal et que
 * la transaction a été annulée en entier. Contrôlé après coup : 60 726
 * entreprises, 579 cohortes, 882 opportunités — rien perdu.
 *
 * `domaines_classes` ne fait que classer. Elle ne supprime rien, ne masque rien,
 * ne retire rien d'une file. Elle dit ce qu'un domaine est, et c'est tout.
 *
 * La colonne `categorie` distingue ce que le domaine EST — parce qu'« exclure »
 * recouvre trois gestes différents :
 *   annuaire · apporteur · certificateur · fabricant  il cite l'entreprise ;
 *     son URL n'est jamais à retenir.
 *   reseau                                            une chaîne : on met de
 *     côté et on démarche autrement.
 *   plateforme                                        une vitrine au nom de
 *     l'artisan, hébergée ailleurs : on GARDE l'URL, elle est la preuve.
 *   hebergeur · social                                compté comme sans site.
 *
 *   node scripts/prospection/semer-domaines.mjs [--ecrire]
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DOMAINES_CONNUS } from "./domaines.mjs";

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

async function main() {
  const ENV = await lireEnvLocal();
  const ecrire = process.argv.includes("--ecrire");
  const cle = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const base = ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;

  const existantes = await fetch(`${base}/rest/v1/domaines_classes?select=domaine,categorie&limit=5000`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  }).then((r) => r.json());
  const deja = new Map(existantes.map((e) => [String(e.domaine).toLowerCase(), e]));

  const lignes = [];
  // Un domaine ne peut porter qu'une catégorie, et certains figurent dans deux
  // listes du bot — `effy.fr` est à la fois apporteur et certificateur, et
  // proposer les deux fait échouer tout le lot (« ON CONFLICT DO UPDATE cannot
  // affect row a second time »). La première catégorie rencontrée l'emporte,
  // l'ordre des listes valant ordre de priorité.
  const vus = new Set();
  for (const [categorie, domaines] of Object.entries(DOMAINES_CONNUS)) {
    for (const d of domaines) {
      if (vus.has(d.toLowerCase())) continue;
      vus.add(d.toLowerCase());
      // Déjà classé : on ne réécrit pas. Une correction humaine l'emporte
      // toujours sur la semence.
      if (deja.has(d.toLowerCase())) continue;
      lignes.push({
        domaine: d,
        categorie,
        motif: `semé depuis les listes du bot de dossiers web (${categorie})`,
        a_confirmer: false,
        cree_par: "semer-domaines.mjs",
      });
    }
  }

  console.log(
    `${Object.values(DOMAINES_CONNUS).flat().length} domaines connus · ` +
      `${deja.size} déjà classés · ${lignes.length} à créer`,
  );
  for (const [cat, n] of Object.entries(
    lignes.reduce((a, l) => ((a[l.categorie] = (a[l.categorie] ?? 0) + 1), a), {}),
  )) {
    console.log(`  ${String(n).padStart(4)}  ${cat}`);
  }

  if (!ecrire) {
    console.log("\nSimulation. Ajouter --ecrire pour appliquer.");
    return;
  }

  for (let i = 0; i < lignes.length; i += 100) {
    const res = await fetch(`${base}/rest/v1/domaines_classes?on_conflict=domaine`, {
      method: "POST",
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(lignes.slice(i, i + 100)),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  console.log(`\n${lignes.length} domaines classés dans domaines_classes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
