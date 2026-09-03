/**
 * La chaîne qui mène à une démo, remontée d'un bout à l'autre.
 *
 * ── L'ORDRE N'EST PAS ARBITRAIRE, C'EST UNE DÉPENDANCE ────────────────────
 *   SIRET → date au registre → chiffres clés → démo fabricable.
 *
 * Chaque maillon manquant rend le suivant impossible, et le symptôme est
 * toujours le même à l'écran : « pas de démo », sans dire pourquoi. Mesuré le
 * 03/09/2026 sur les 118 fiches sans démo de la file Bilal + Matteo — 73
 * n'attendaient QUE les chiffres clés, c'est-à-dire une soustraction.
 *
 * ── CE QUE CE SCRIPT NE FAIT PAS ──────────────────────────────────────────
 * Il n'invente aucune règle. Chaque étape appelle la fonction que l'app appelle
 * déjà : `hydraterIdentite` (le service des données publiques),
 * `patchChiffresCles` (le barème, avec sa garde sur les chiffres confirmés),
 * `cloneTemplateSite` derrière le MÊME garde de métier que la route
 * `create-demo`. Recopier l'un d'eux ici en ferait une seconde définition.
 *
 * Lancement — voir l'en-tête de `siret-par-adresse.ts` pour la ligne complète.
 * Sans `--ecrire`, il compte et ne touche à rien.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { hydraterIdentite } from "@/lib/donnees-publiques/service";
import { patchChiffresCles } from "@/lib/enrichment/chiffres-cles";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";
import { resolveLeadMagnetProjectId } from "@/lib/site-builder/resolve-project-id";
import {
  isServiceTagExplicitlyAllowed,
  isServiceTagKnownToTemplate,
  type ServiceTagSetting,
} from "@/utils/serviceTags";

const OWNERS = ["76353de0-ac50-4645-9530-8be2db55c7a3", "66ee3ab7-0ec4-4f4c-995b-d33f58cab585"];
/** « template CVC - Agency » : 324 des 325 démos de la vague en sortent. */
const GABARIT = "bac3f48f-bb0f-4877-8983-2f7e304d0aac";
const ECRIRE = process.argv.includes("--ecrire");

const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
  /^https?:\/\//.test(v ?? ""),
);
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("env Supabase absente");
const sb: SupabaseClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);

const idsDuPortefeuille = async (): Promise<number[]> => {
  const out: number[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb
      .from("entreprises")
      .select("id")
      .in("owner_id", OWNERS)
      .is("archived_at", null)
      .is("merged_into_id", null)
      .order("id")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    const lot = (data ?? []) as { id: number }[];
    out.push(...lot.map((l) => l.id));
    if (lot.length < 1000) break;
  }
  return out;
};

/** Un `in` de plus de quelques centaines d'identifiants fait une URL que PostgREST refuse. */
const tranches = <T,>(l: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

async function etape1DonneesPubliques(ids: number[]) {
  const avecDate = new Set<number>();
  for (const t of tranches(ids, 500)) {
    const { data } = await sb
      .from("entreprises_donnees_publiques")
      .select("entreprise_id, date_creation")
      .in("entreprise_id", t)
      .not("date_creation", "is", null);
    for (const l of (data ?? []) as { entreprise_id: number }[]) avecDate.add(l.entreprise_id);
  }

  const aFaire: { id: number; siret: string }[] = [];
  for (const t of tranches(ids, 500)) {
    const { data } = await sb.from("entreprises").select("id, siret").in("id", t).not("siret", "is", null);
    for (const l of (data ?? []) as { id: number; siret: string | null }[]) {
      if (l.siret && l.siret.trim() !== "" && !avecDate.has(l.id)) aFaire.push({ id: l.id, siret: l.siret });
    }
  }
  console.log(`[1] données publiques : ${aFaire.length} fiches ont un SIRET sans date au registre`);
  if (!ECRIRE) return;

  let ok = 0;
  let vide = 0;
  for (const f of aFaire) {
    const r = await hydraterIdentite(sb, { entreprise_id: f.id, siret: f.siret }, { declencheur: "backfill" });
    if (r.statut === "ok") ok += 1;
    else if (r.statut === "vide") vide += 1;
    else console.log(`    #${f.id} ${r.statut} ${r.message ?? ""}`);
  }
  console.log(`[1] ${ok} hydratées, ${vide} inconnues du registre`);
}

/**
 * La commune et le code postal, quand la fiche n'en a pas.
 *
 * ⚠️ CE N'EST PAS UN DÉTAIL DE CONFORT : sans eux, `create-demo` refuse — le
 * gabarit met la ville dans ses titres et son SEO local. Sept fiches de la file
 * étaient dans ce cas le 03/09, et la cause est toujours la même : la colonne
 * `adresse` a reçu la NOTE Google (« 5,0(11) ») au lieu d'une adresse.
 *
 * Le registre les rend, et lui ne se trompe pas de colonne.
 */
async function etape1bisLieu(ids: number[]) {
  const manquants: number[] = [];
  for (const t of tranches(ids, 500)) {
    const { data } = await sb.from("entreprises").select("id, ville, code_postal").in("id", t);
    for (const e of (data ?? []) as Array<{ id: number; ville: string | null; code_postal: string | null }>) {
      if ((e.ville ?? "").trim() === "" || (e.code_postal ?? "").trim() === "") manquants.push(e.id);
    }
  }
  if (manquants.length === 0) { console.log("[1b] lieu : rien à compléter"); return; }

  const dp = new Map<number, { ville: string | null; cp: string | null }>();
  for (const t of tranches(manquants, 500)) {
    const { data } = await sb
      .from("entreprises_donnees_publiques")
      .select("entreprise_id, ville_siege, code_postal_siege")
      .in("entreprise_id", t);
    for (const l of (data ?? []) as Array<{ entreprise_id: number; ville_siege: string | null; code_postal_siege: string | null }>) {
      dp.set(l.entreprise_id, { ville: l.ville_siege, cp: l.code_postal_siege });
    }
  }

  let poses = 0;
  for (const id of manquants) {
    const r = dp.get(id);
    if (!r?.ville || !r?.cp) continue;
    poses += 1;
    if (ECRIRE) {
      // `initcap` côté client : le registre écrit en capitales, et un titre de
      // page « SAINT-PRIEST » crie sur le site du prospect.
      const ville = r.ville.toLowerCase().replace(/(^|[\s'-])([a-zàâäéèêëîïôöùûüç])/g, (_, s, c) => s + c.toUpperCase());
      await sb.from("entreprises").update({ ville, code_postal: r.cp }).eq("id", id);
    }
  }
  console.log(`[1b] lieu : ${manquants.length} fiches sans commune ou code postal, ${poses} ${ECRIRE ? "complétées" : "complétables"} par le registre`);
}

async function etape2ChiffresCles(ids: number[]) {
  const matiere = new Map<number, { dateCreation: string | null; nombreAvis: number | null }>();
  for (const t of tranches(ids, 500)) {
    const { data: dp } = await sb
      .from("entreprises_donnees_publiques")
      .select("entreprise_id, date_creation")
      .in("entreprise_id", t);
    const { data: ent } = await sb.from("entreprises").select("id, nombre_avis").in("id", t);
    const avis = new Map((((ent ?? []) as { id: number; nombre_avis: number | null }[])).map((l) => [l.id, l.nombre_avis]));
    for (const l of (dp ?? []) as { entreprise_id: number; date_creation: string | null }[]) {
      matiere.set(l.entreprise_id, { dateCreation: l.date_creation, nombreAvis: avis.get(l.entreprise_id) ?? null });
    }
  }

  const projets: Record<string, unknown>[] = [];
  for (const t of tranches(ids, 500)) {
    const { data } = await sb
      .from("lead_magnet_projects")
      .select(
        "id, entreprise_id, stat_years_experience, stat_satisfied_clients, stat_installations_completed, " +
          "stat_years_experience_official, stat_satisfied_clients_official, stat_installations_completed_official",
      )
      .in("entreprise_id", t);
    // ⚠️ Le typage de PostgREST ABANDONNE sur une chaîne `select` longue et
    // rend `GenericStringError[]` : on retype à la main, comme le fait déjà
    // `/api/agent/tasks`.
    projets.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }

  let poses = 0;
  for (const p of projets) {
    const m = matiere.get(Number(p.entreprise_id));
    if (!m) continue;
    const patch = patchChiffresCles(m, {
      annees: (p.stat_years_experience as string | null) ?? null,
      clients: (p.stat_satisfied_clients as string | null) ?? null,
      installations: (p.stat_installations_completed as string | null) ?? null,
      anneesOfficiel: (p.stat_years_experience_official as string | null) ?? null,
      clientsOfficiel: (p.stat_satisfied_clients_official as string | null) ?? null,
      installationsOfficiel: (p.stat_installations_completed_official as string | null) ?? null,
    });
    if (!patch) continue;
    poses += 1;
    if (ECRIRE) await sb.from("lead_magnet_projects").update(patch).eq("id", String(p.id));
  }
  console.log(`[2] chiffres clés : ${poses} dossiers ${ECRIRE ? "complétés" : "à compléter"}`);
}

async function etape3Demos(ids: number[]) {
  const { data: reglagesBrut } = await sb.from("enrichment_tag_settings").select("tag, allowed, demarchable");
  const reglages = (reglagesBrut ?? []) as ServiceTagSetting[];

  const avecSite = new Set<number>();
  for (const t of tranches(ids, 500)) {
    const { data } = await sb.from("sites").select("enterprise_id, is_template").in("enterprise_id", t);
    for (const s of (data ?? []) as { enterprise_id: number; is_template: boolean | null }[]) {
      if (s.is_template !== true) avecSite.add(s.enterprise_id);
    }
  }

  const candidats: { id: number; name: string }[] = [];
  const bloques = { metier: 0, lieu: 0, chiffres: 0 };
  for (const t of tranches(ids, 500)) {
    const { data } = await sb
      .from("entreprises")
      .select("id, name, service_tags, ville, code_postal")
      .in("id", t);
    for (const e of (data ?? []) as Record<string, unknown>[]) {
      const id = Number(e.id);
      if (avecSite.has(id)) continue;

      // Le MÊME garde que la route `create-demo` : autorisé ET servi par le
      // gabarit. Les deux axes, sinon la démo sort au menu « Nos services » vide.
      const tags = Array.isArray(e.service_tags)
        ? (e.service_tags as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
        : [];
      const servables = tags
        .filter((x) => isServiceTagExplicitlyAllowed(x, reglages))
        .filter((x) => isServiceTagKnownToTemplate(x));
      if (servables.length === 0) { bloques.metier += 1; continue; }
      if (String(e.ville ?? "").trim() === "" || String(e.code_postal ?? "").trim() === "") { bloques.lieu += 1; continue; }
      candidats.push({ id, name: String(e.name ?? `Site ${id}`) });
    }
  }

  // Les chiffres clés se relisent APRÈS l'étape 2 : c'est elle qui vient de les
  // poser, et une démo sans ancienneté affiche un bloc de statistiques blanc.
  const aFabriquer: { id: number; name: string }[] = [];
  for (const t of tranches(candidats.map((c) => c.id), 500)) {
    const { data } = await sb
      .from("lead_magnet_projects")
      .select("entreprise_id, stat_years_experience")
      .in("entreprise_id", t);
    const rempli = new Set(
      ((data ?? []) as { entreprise_id: number; stat_years_experience: string | null }[])
        .filter((p) => {
          const v = (p.stat_years_experience ?? "").trim();
          return v !== "" && v !== "0" && v !== "-" && v !== "—";
        })
        .map((p) => p.entreprise_id),
    );
    for (const c of candidats) if (t.includes(c.id) && rempli.has(c.id)) aFabriquer.push(c);
  }
  bloques.chiffres = candidats.length - aFabriquer.length;

  console.log(
    `[3] démos : ${aFabriquer.length} fabricables — bloquées : ${bloques.metier} sans métier servi, ` +
      `${bloques.lieu} sans ville ou code postal, ${bloques.chiffres} sans chiffres clés`,
  );
  if (!ECRIRE) return;

  let faites = 0;
  for (const c of aFabriquer) {
    const projet = await resolveLeadMagnetProjectId(sb, { enterpriseId: c.id });
    const clone = await cloneTemplateSite(sb, GABARIT, {
      enterpriseId: c.id,
      name: c.name,
      leadMagnetProjectId: projet.projectId,
      buildStage: "a_faire",
    });
    if (clone.ok) faites += 1;
    else console.log(`    #${c.id} ${c.name} → ÉCHEC ${clone.error}`);
  }
  console.log(`[3] ${faites} démos fabriquées`);
}

async function main() {
  const ids = await idsDuPortefeuille();
  console.log(`portefeuille : ${ids.length} fiches vivantes`);
  await etape1DonneesPubliques(ids);
  await etape1bisLieu(ids);
  await etape2ChiffresCles(ids);
  await etape3Demos(ids);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
