#!/usr/bin/env node
/**
 * Enrichir un lot de projets, depuis le poste, sans session admin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CHAÎNE, ET OÙ CE SCRIPT SE PLACE DEDANS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'enrichissement lui-même vit dans l'edge function Supabase
 * `enrich-lead-magnet` : c'est elle qui scrape le site, appelle le LLM,
 * interroge Google Places, et écrit `variables`, les `stat_*`, le logo, les tags.
 * Elle part de `entreprise.site_web_canonique || canonical_url` — sans URL, elle
 * n'a rien à lire.
 *
 * Ce qui l'entoure — choisir le périmètre, remettre les projets en état, appeler
 * par petits paquets, republier ensuite — vit dans la route Next
 * `/api/marketing-pipeline/reenrich`. Cette route est en `role: "admin"` et
 * exige une vraie session : elle n'est pas appelable depuis un terminal.
 *
 * D'où ce script, qui fait le strict minimum de ce que fait la route, pour un
 * lot déjà choisi : appeler l'edge function par paquets de 3 avec la clé de
 * service, et rendre compte. Il NE FAIT PAS le reset (`enrichResetPayload`) ni
 * la republication : il est prévu pour des projets qui n'ont jamais été
 * enrichis, pas pour rejouer par-dessus un enrichissement existant. Pour ça,
 * c'est la route qu'il faut, depuis le navigateur.
 *
 * LE VERROU À CONNAÎTRE : l'edge function refuse tout projet dont
 * `pret_pour_lm` n'est pas `true`, et répond `skipped / not_ready` sans rien
 * dire de plus. C'est ce que la route pose dans son reset. Les projets créés par
 * trigger, eux, naissent à `false` — d'où les 191 fiches de la cohorte B qu'il a
 * fallu déverrouiller à la main avant que quoi que ce soit ne se passe.
 *
 *   node scripts/prospection/enrichir-lot.mjs --cohorte B_sans_site
 *   node scripts/prospection/enrichir-lot.mjs --projets a,b,c
 */

import { readFile } from "node:fs/promises";
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

let ENV = {};
const base = () => ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
const cle = () => ENV.SUPABASE_SERVICE_ROLE_KEY;

async function rest(chemin) {
  const res = await fetch(`${base()}/rest/v1/${chemin}`, {
    headers: { apikey: cle(), Authorization: `Bearer ${cle()}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** L'edge function traite les projets en série : 3 par appel, comme la route. */
const PAQUET = 3;

async function main() {
  ENV = await lireEnvLocal();
  const argv = process.argv;
  const cohorte = argv[argv.indexOf("--cohorte") + 1];
  const listeProjets = argv.includes("--projets") ? argv[argv.indexOf("--projets") + 1].split(",") : null;
  const limite = argv.includes("--limite") ? Number(argv[argv.indexOf("--limite") + 1]) : 0;

  let projets;
  if (listeProjets) {
    projets = listeProjets.map((id) => ({ id }));
  } else {
    if (!cohorte) {
      console.error("Usage : --cohorte B_sans_site  ou  --projets <uuid,uuid>");
      process.exit(1);
    }
    // Les entreprises de la cohorte qui ont une URL : sans elle, l'edge function
    // rendrait `no_website` et l'appel serait perdu.
    const ents = await rest(
      `entreprises?cohorte_demarchage=eq.${encodeURIComponent(cohorte)}&archived_at=is.null&select=id&limit=2000`,
    );
    const ids = ents.map((e) => e.id);
    projets = [];
    for (let i = 0; i < ids.length; i += 200) {
      const lot = await rest(
        `lead_magnet_projects?entreprise_id=in.(${ids.slice(i, i + 200).join(",")})` +
          `&statut=eq.draft&pret_pour_lm=is.true&select=id,entreprise_id&limit=2000`,
      );
      projets.push(...lot);
    }
  }
  if (limite) projets = projets.slice(0, limite);

  console.log(`${projets.length} projets à enrichir, par paquets de ${PAQUET}.`);
  const bilan = { success: 0, failed: 0, skipped: 0, no_website: 0 };
  const echecs = [];

  for (let i = 0; i < projets.length; i += PAQUET) {
    const lot = projets.slice(i, i + PAQUET).map((p) => p.id);
    try {
      const res = await fetch(`${base()}/functions/v1/enrich-lead-magnet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cle()}`,
          apikey: cle(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_ids: lot, source: "dossiers-web" }),
      });
      if (!res.ok) {
        bilan.failed += lot.length;
        echecs.push({ lot, erreur: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` });
        continue;
      }
      const corps = await res.json();
      for (const r of corps.results ?? []) {
        bilan[r.status] = (bilan[r.status] ?? 0) + 1;
        if (r.status !== "success") echecs.push({ projet: r.project_id, erreur: r.error ?? r.status });
      }
    } catch (e) {
      // Un paquet perdu n'arrête pas le lot : on note et on continue.
      bilan.failed += lot.length;
      echecs.push({ lot, erreur: e.message });
    }
    const fait = Math.min(i + PAQUET, projets.length);
    console.log(
      `  ${fait}/${projets.length} — ${bilan.success} réussis · ${bilan.failed} échoués · ` +
        `${bilan.skipped ?? 0} sautés · ${bilan.no_website ?? 0} sans site`,
    );
  }

  console.log("\nBilan :", bilan);
  if (echecs.length) {
    console.log(`\n${echecs.length} incidents, les 10 premiers :`);
    for (const e of echecs.slice(0, 10)) console.log("  ", JSON.stringify(e).slice(0, 200));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
