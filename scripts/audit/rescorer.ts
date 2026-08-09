#!/usr/bin/env node
/**
 * Rejoue le barème sur les analyses déjà en base, et montre l'avant/après.
 *
 *   npm run audit:rescorer                    # lit Supabase
 *   npm run audit:rescorer -- --fichier x.json   # lit un export local
 *   npm run audit:rescorer -- --detail        # une ligne par entreprise
 *
 * POURQUOI CE SCRIPT EXISTE. Changer un barème qu'on montre à des prospects sans
 * mesurer l'effet du changement, c'est remplacer une erreur par une autre en
 * espérant. Les signaux bruts sont stockés dans `entreprises_audit_site.signaux`,
 * donc rejouer le calcul ne coûte AUCUNE requête réseau et se fait en une
 * seconde sur tout le parc.
 *
 * CE QU'IL MESURE, ET CE QU'IL NE PEUT PAS MESURER. Le script rejoue `scorer()`,
 * donc il montre l'effet des corrections de BARÈME (clés dérivées des verdicts,
 * fusion des deux mesures de temps, page vide). Il ne peut pas montrer l'effet
 * des corrections d'EXTRACTION — le compteur de largeurs fixes et la lecture des
 * feuilles CSS externes — parce que celles-ci changent la façon de lire le HTML,
 * et que le HTML n'est pas conservé. Ces gains-là n'apparaîtront qu'après une
 * ré-analyse du parc :
 *
 *   update entreprises_audit_site set analyse_le = null;
 *
 * Autrement dit, les chiffres sortis ici sont un PLANCHER : la réalité après
 * ré-analyse sera meilleure.
 */

import { scorer, SEUILS } from "../../src/lib/audit-site/score";
import type { SignauxSite } from "../../src/lib/audit-site/types";

interface LigneStockee {
  entreprise_id: number;
  note_globale: number | null;
  note_vitesse: number | null;
  note_seo: number | null;
  note_mobile: number | null;
  note_conversion: number | null;
  issue_keys: string[] | null;
  signaux: Record<string, unknown> | null;
  nombre_avis?: number | null;
}

// ---------------------------------------------------------------------------
// Remise en forme des signaux d'avant
// ---------------------------------------------------------------------------

/**
 * Les lignes écrites par l'ancienne version n'ont pas tous les champs.
 *
 * On ne comble QUE ce qui se déduit honnêtement des signaux déjà présents. Le
 * reste vaut `null`, ce que le barème traite en « inconnu » — donc hors
 * dénominateur. Inventer une valeur ici fausserait la comparaison dans le sens
 * qui nous arrange, ce qui est exactement le défaut qu'on corrige.
 */
function normaliser(brut: Record<string, unknown>): SignauxSite {
  const s = { ...brut } as unknown as SignauxSite & Record<string, unknown>;

  // Déductible : la coquille se lit dans la longueur du texte servi et le poids
  // du document, deux champs que l'ancienne version enregistrait déjà.
  if (s.coquille === undefined) {
    const texte = Number(brut.longueurTexteVisible ?? Infinity);
    const octets = Number(brut.poidsOctets ?? Infinity);
    s.coquille = texte < SEUILS.texteSpa || octets < SEUILS.htmlCoquilleOctets;
  }

  // Non déductible : exige le texte de la page, qu'on ne conserve pas.
  if (s.pageParking === undefined) s.pageParking = false;

  // Non déductible : l'ancienne version ne lisait pas les feuilles externes et
  // ne savait donc pas si elle avait tout vu. On garde son hypothèse implicite
  // (« j'ai tout vu ») pour ne pas créditer artificiellement les sites.
  if (s.cssLisible === undefined) s.cssLisible = true;

  // Non déductible : la pesée des ressources n'existait pas.
  if (s.poidsTotalOctets === undefined) s.poidsTotalOctets = null;

  return s;
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

async function chargerDepuisSupabase(): Promise<LigneStockee[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error(
      "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis, ou passez --fichier <export.json>.",
    );
  }

  const champs =
    "entreprise_id,note_globale,note_vitesse,note_seo,note_mobile,note_conversion,issue_keys,signaux";
  const reponse = await fetch(
    `${url}/rest/v1/entreprises_audit_site?select=${champs}&signaux=not.is.null`,
    { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
  );
  if (!reponse.ok) throw new Error(`Supabase ${reponse.status}: ${await reponse.text()}`);
  return (await reponse.json()) as LigneStockee[];
}

async function chargerDepuisFichier(chemin: string): Promise<LigneStockee[]> {
  const { readFile } = await import("node:fs/promises");
  const contenu = await readFile(chemin, "utf8");
  const donnees = JSON.parse(contenu);
  return Array.isArray(donnees) ? donnees : donnees.rows ?? [];
}

// ---------------------------------------------------------------------------
// Comparaison
// ---------------------------------------------------------------------------

interface Ecart {
  entreprise: number;
  avant: number | null;
  apres: number;
  clesRetirees: string[];
  clesAjoutees: string[];
}

function comparer(lignes: LigneStockee[]) {
  const freqAvant = new Map<string, number>();
  const freqApres = new Map<string, number>();
  const ecarts: Ecart[] = [];
  let ignorees = 0;

  for (const ligne of lignes) {
    if (!ligne.signaux) {
      ignorees++;
      continue;
    }

    const signaux = normaliser(ligne.signaux);
    const resultat = scorer(signaux, { nombreAvis: ligne.nombre_avis ?? null });

    const avant = new Set(ligne.issue_keys ?? []);
    const apres = new Set(resultat.issueKeys);
    for (const k of avant) freqAvant.set(k, (freqAvant.get(k) ?? 0) + 1);
    for (const k of apres) freqApres.set(k, (freqApres.get(k) ?? 0) + 1);

    const retirees = [...avant].filter((k) => !apres.has(k));
    const ajoutees = [...apres].filter((k) => !avant.has(k));

    if (retirees.length || ajoutees.length || ligne.note_globale !== resultat.noteGlobale) {
      ecarts.push({
        entreprise: ligne.entreprise_id,
        avant: ligne.note_globale,
        apres: resultat.noteGlobale,
        clesRetirees: retirees,
        clesAjoutees: ajoutees,
      });
    }
  }

  return { freqAvant, freqApres, ecarts, ignorees, total: lignes.length - ignorees };
}

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

const pct = (n: number, total: number) => (total ? `${((100 * n) / total).toFixed(0)} %` : "—");

function afficher(r: ReturnType<typeof comparer>, detail: boolean) {
  const { freqAvant, freqApres, ecarts, ignorees, total } = r;

  console.log(`\nAnalyses rejouées : ${total}${ignorees ? ` (${ignorees} sans signaux, ignorées)` : ""}\n`);

  const cles = [...new Set([...freqAvant.keys(), ...freqApres.keys()])].sort(
    (a, b) => (freqApres.get(b) ?? 0) - (freqApres.get(a) ?? 0),
  );

  console.log("Clé                          avant            après");
  console.log("────────────────────────────────────────────────────────");
  for (const cle of cles) {
    const a = freqAvant.get(cle) ?? 0;
    const b = freqApres.get(cle) ?? 0;
    const fleche = b < a ? "↓" : b > a ? "↑" : " ";
    console.log(
      `${cle.padEnd(28)} ${String(a).padStart(3)} ${pct(a, total).padStart(6)}   ` +
        `${String(b).padStart(3)} ${pct(b, total).padStart(6)}  ${fleche}`,
    );
  }

  console.log(`\nLignes dont le verdict change : ${ecarts.length} / ${total}`);

  if (detail) {
    console.log("\nDétail :");
    for (const e of ecarts) {
      const notes = e.avant !== e.apres ? `${e.avant ?? "—"} → ${e.apres}` : `${e.apres}`;
      const retrait = e.clesRetirees.length ? ` −[${e.clesRetirees.join(", ")}]` : "";
      const ajout = e.clesAjoutees.length ? ` +[${e.clesAjoutees.join(", ")}]` : "";
      console.log(`  #${String(e.entreprise).padStart(5)}  ${notes.padEnd(12)}${retrait}${ajout}`);
    }
  }

  console.log(
    "\nRappel : ces chiffres ne reflètent que les corrections de barème.\n" +
      "Le compteur de largeurs fixes et la lecture du CSS externe ne prendront\n" +
      "effet qu'après une ré-analyse (update entreprises_audit_site set analyse_le = null).\n",
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const detail = args.includes("--detail");
  const iFichier = args.indexOf("--fichier");

  const lignes =
    iFichier >= 0 ? await chargerDepuisFichier(args[iFichier + 1]) : await chargerDepuisSupabase();

  if (lignes.length === 0) {
    console.log("Aucune analyse à rejouer.");
    return;
  }

  afficher(comparer(lignes), detail);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
