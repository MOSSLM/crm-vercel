/**
 * Finir les démos de la file de démarchage — les trois derniers maillons.
 *
 * ── CE QUI MANQUAIT ENTRE « FABRIQUÉE » ET « PRÊTE » ──────────────────────
 * `chaine-demo.ts` s'arrête au clonage : il rend un site qui existe, en
 * `build_stage = 'a_faire'`. Or `choisirSiteMontrable` — la définition de
 * « prête » que lisent la plaquette, le moteur d'automatisations et le cockpit
 * RDV — refuse exactement cet état. Les 110 démos fabriquées le 03/09/2026
 * étaient donc invisibles pour tout ce qui envoie un lien : le travail était
 * fait et ne servait à rien.
 *
 * Trois maillons restaient, et aucun n'avait de chemin par lot :
 *
 *   [1] LE TIRAGE DES PHOTOS. Sans lui, l'`image_set` cloné du gabarit se
 *       RE-RÉSOUT à chaque rendu selon les `service_tags` — et retombe
 *       plusieurs fois sur la même photo. Mesuré le 03/09 sur la démo d'ENEOLE
 *       (3 métiers, médiathèque fournie) : 3 photos distinctes dans une bande
 *       de 6, deux affichées DEUX FOIS. La même bande sur une démo tirée
 *       (R'CLIMS) : 6 photos distinctes. Ce n'est pas un réglage fin, c'est la
 *       différence entre un portfolio et un doublon.
 *
 *   [2] LA VIGNETTE. `preparerCartesManquantes` la fabrique déjà, mais six par
 *       heure : le parc en comptait 284 en attente, soit deux jours de cron
 *       pour une file qu'on travaille aujourd'hui. Le filet reste le filet ; ce
 *       script rattrape la vague.
 *
 *   [3] LA VALIDATION. Personne ne peut regarder 85 démos une par une, et une
 *       validation en masse à l'aveugle mettrait un lien mort entre les mains
 *       d'un agent.
 *
 * ── POURQUOI LA VIGNETTE EST LE GARDE-FOU DE LA VALIDATION ────────────────
 * `ensureDemoScreenshot` REFUSE une capture quasi vide (`imageQuasiVide`) : une
 * carte qui sort prouve que la page s'est affichée, avec son contenu. C'est la
 * seule vérification de rendu qui existe dans ce dépôt, et elle est déjà
 * nécessaire par ailleurs — l'utiliser comme condition ne coûte donc rien de
 * plus. **Aucun site ne passe à `pret` sans sa carte.** Un échec de capture
 * laisse le site en `a_faire` et se compte : c'est un site à regarder, pas un
 * site à envoyer.
 *
 * ── L'ORDRE, ET CE QU'IL N'IMPOSE PAS ─────────────────────────────────────
 * Tirage → vignette → validation. Le tirage passe d'abord pour que la preuve de
 * rendu porte sur la page définitive. En revanche il ne périme AUCUNE vignette
 * existante : `AUTO_IMAGE_ZONES` ne contient qu'une zone (`realisations`), et la
 * capture est cadrée `position: "top"` sur le premier écran. Les 51 démos déjà
 * vignettées et non tirées ne sont donc pas recapturées — c'eût été 102
 * captures pour un pixel inchangé.
 *
 * ── LA POPULATION EST CELLE DE L'ÉCRAN, RECOPIÉE DE LA ROUTE ──────────────
 * `entreprise.owner_id`, `status in (pending, snoozed)`, `kind in (call,
 * whatsapp, linkedin)`, `enrollment_id not null` : mot pour mot le filtre de
 * `GET /api/agent/tasks`. Écrite autrement, elle traiterait une population que
 * l'agent ne voit pas — ou en oublierait une qu'il voit. En particulier ce
 * n'est PAS `assignee_id` : la file se cadre sur le propriétaire de la fiche.
 *
 * Lancement (le shim rend les modules `server-only` importables) :
 *   TS_NODE_BASEURL=. npx ts-node -r ./scripts/_shim-server-only.js \
 *     -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/lissage/finir-demos.ts [--ecrire] [--etape 1|2|3] [--limite N]
 *
 * Sans `--ecrire`, il compte et ne touche à rien.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildDemoCard } from "@/lib/og/build-demo-card";
import { tirerImagesPourSite } from "@/lib/site-builder/claude-design/tirer-images";

const OWNERS = ["76353de0-ac50-4645-9530-8be2db55c7a3", "66ee3ab7-0ec4-4f4c-995b-d33f58cab585"];
const ECRIRE = process.argv.includes("--ecrire");

const argNombre = (nom: string, defaut: number): number => {
  const i = process.argv.indexOf(nom);
  if (i === -1) return defaut;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : defaut;
};
const LIMITE = argNombre("--limite", Number.POSITIVE_INFINITY);
/** `--etape 2` ne joue que les vignettes : de quoi reprendre une passe coupée. */
const ETAPES = (() => {
  const i = process.argv.indexOf("--etape");
  if (i === -1) return new Set([1, 2, 3]);
  return new Set(
    (process.argv[i + 1] ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= 3),
  );
})();

// La garde `/^https?:\/\//` existe à cause du caviardage du scanner de secrets :
// `NEXT_PUBLIC_SUPABASE_URL` rend une empreinte hexadécimale, pas une URL.
const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
  /^https?:\/\//.test(v ?? ""),
);
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("env Supabase absente");
const sb: SupabaseClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Un `in` de plus de quelques centaines d'identifiants fait une URL que PostgREST refuse. */
const tranches = <T,>(l: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

/**
 * `n` travaux à la fois, à la file. Les captures durent 20 à 40 s chez thum.io
 * (aucune clé de rendu n'est posée sur ce parc) : en série, 92 démos
 * demanderaient plus d'une heure ; toutes d'un coup, le service limite.
 */
async function enParallele<T>(taches: readonly (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(taches.length);
  let curseur = 0;
  const ouvrier = async () => {
    for (;;) {
      const i = curseur++;
      if (i >= taches.length) return;
      out[i] = await taches[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, taches.length) }, ouvrier));
  return out;
}

interface FicheDeLaFile {
  entrepriseId: number;
  nom: string;
  siteId: string | null;
  buildStage: string | null;
  publie: boolean;
  aVignette: boolean;
  aTirage: boolean;
}

/** La file telle que l'agent la voit — cf. l'en-tête pour le filtre. */
async function fileDeDemarchage(): Promise<FicheDeLaFile[]> {
  const { data, error } = await sb
    .from("prospection_tasks")
    .select("entreprise_id, entreprise:entreprises!inner(id, name, owner_id)")
    .in("entreprise.owner_id", OWNERS)
    .in("status", ["pending", "snoozed"])
    .in("kind", ["call", "whatsapp", "linkedin"])
    .not("enrollment_id", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);

  const noms = new Map<number, string>();
  for (const l of (data ?? []) as unknown as Array<{
    entreprise_id: number | null;
    entreprise: { id: number; name: string | null } | null;
  }>) {
    if (l.entreprise_id == null || !l.entreprise) continue;
    noms.set(l.entreprise_id, l.entreprise.name ?? `#${l.entreprise_id}`);
  }
  const ids = [...noms.keys()];

  // Le site NON gabarit de chaque fiche. Une entreprise peut en porter
  // plusieurs (refonte) : on garde le plus avancé, c'est celui que
  // `choisirSiteMontrable` retiendrait.
  const sites = new Map<number, { id: string; buildStage: string | null; publie: boolean; vignette: boolean }>();
  for (const t of tranches(ids, 300)) {
    const { data: rows, error: e } = await sb
      .from("sites")
      .select("id, enterprise_id, build_stage, is_published, og_image_url, is_template")
      .in("enterprise_id", t);
    if (e) throw new Error(e.message);
    for (const s of (rows ?? []) as Array<{
      id: string;
      enterprise_id: number;
      build_stage: string | null;
      is_published: boolean | null;
      og_image_url: string | null;
      is_template: boolean | null;
    }>) {
      if (s.is_template === true) continue;
      const candidat = {
        id: s.id,
        buildStage: s.build_stage,
        publie: s.is_published === true,
        vignette: (s.og_image_url ?? "").trim() !== "",
      };
      const ancien = sites.get(s.enterprise_id);
      const rang = (c: typeof candidat) => (c.publie ? 2 : c.buildStage === "pret" ? 1 : 0);
      if (!ancien || rang(candidat) > rang(ancien)) sites.set(s.enterprise_id, candidat);
    }
  }

  const tirages = new Set<number>();
  for (const t of tranches(ids, 300)) {
    const { data: rows } = await sb.from("entreprise_tirages_photos").select("entreprise_id").in("entreprise_id", t);
    for (const l of (rows ?? []) as Array<{ entreprise_id: number }>) tirages.add(l.entreprise_id);
  }

  return ids.map((id) => {
    const s = sites.get(id);
    return {
      entrepriseId: id,
      nom: noms.get(id) ?? `#${id}`,
      siteId: s?.id ?? null,
      buildStage: s?.buildStage ?? null,
      publie: s?.publie ?? false,
      aVignette: s?.vignette ?? false,
      aTirage: tirages.has(id),
    };
  });
}

/** [1] Les photos, figées sur l'entreprise. Aucun appel externe : la médiathèque. */
async function etape1Tirages(file: readonly FicheDeLaFile[]) {
  const aTirer = file.filter((f) => f.siteId && !f.aTirage).slice(0, LIMITE);
  console.log(`[1] tirage des photos : ${aTirer.length} démo(s) sans bande figée`);
  if (!ECRIRE || aTirer.length === 0) return;

  let ok = 0;
  const refus = new Map<string, number>();
  await enParallele(
    aTirer.map((f) => async () => {
      const r = await tirerImagesPourSite(sb, f.siteId!, {
        entrepriseId: f.entrepriseId,
        // `null` : c'est un lot, personne n'a regardé. La colonne le dira.
        tirePar: null,
      });
      if (r.ok) {
        ok += 1;
        // `enregistre: false` = les photos sont posées mais pas protégées d'une
        // refonte. Ça se dit, ça n'annule rien.
        if (!r.enregistre) console.log(`    #${f.entrepriseId} ${f.nom} → posées, tirage non enregistré`);
      } else {
        refus.set(r.erreur, (refus.get(r.erreur) ?? 0) + 1);
      }
    }),
    6,
  );
  console.log(`[1] ${ok} bande(s) tirée(s)`);
  for (const [motif, n] of [...refus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ✖ ${n} × ${motif}`);
  }
}

/** [2] La carte de partage — et la preuve que la page s'affiche. */
async function etape2Vignettes(file: readonly FicheDeLaFile[]) {
  const aFaire = file.filter((f) => f.siteId && !f.aVignette).slice(0, LIMITE);
  console.log(`[2] vignettes : ${aFaire.length} démo(s) sans carte de partage`);
  if (!ECRIRE || aFaire.length === 0) return new Set<string>();

  const faites = new Set<string>();
  let echecs = 0;
  await enParallele(
    aFaire.map((f) => async () => {
      const r = await buildDemoCard(sb, f.siteId!).catch((e) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : "exception",
        status: 500,
      }));
      if (r.ok) {
        faites.add(f.siteId!);
        if (r.warnings.length > 0) console.log(`    ⚠ #${f.entrepriseId} ${f.nom} : ${r.warnings.join(" ; ")}`);
      } else {
        echecs += 1;
        console.log(`    ✖ #${f.entrepriseId} ${f.nom} : ${r.error}`);
        // La date de tentative fait tourner la file du cron, échec compris —
        // même règle que `preparerCartesManquantes`, pour ne pas boucler ici
        // sur les mêmes sites au prochain passage.
        await sb
          .from("sites")
          .update({ og_generated_at: new Date().toISOString() })
          .eq("id", f.siteId!)
          .then(undefined, () => undefined);
      }
    }),
    4,
  );
  console.log(`[2] ${faites.size} carte(s) fabriquée(s), ${echecs} échec(s)`);
  return faites;
}

/**
 * [3] La validation. `build_stage = 'pret'` fait entrer le site dans
 * `choisirSiteMontrable` — c'est le geste qui autorise un lien à partir.
 *
 * La condition est la carte, jamais l'ancienneté ni le simple fait d'exister :
 * cf. l'en-tête. On relit l'état en base plutôt que de faire confiance à la
 * lecture du début — l'étape 2 vient de le changer.
 */
async function etape3Validation(file: readonly FicheDeLaFile[]) {
  const candidats = file.filter((f) => f.siteId && !f.publie && f.buildStage !== "pret");
  if (candidats.length === 0) {
    console.log("[3] validation : aucune démo en chantier");
    return;
  }

  const avecCarte = new Set<string>();
  for (const t of tranches(candidats.map((c) => c.siteId!), 300)) {
    const { data } = await sb.from("sites").select("id, og_image_url").in("id", t);
    for (const s of (data ?? []) as Array<{ id: string; og_image_url: string | null }>) {
      if ((s.og_image_url ?? "").trim() !== "") avecCarte.add(s.id);
    }
  }

  const aValider = candidats.filter((c) => avecCarte.has(c.siteId!)).slice(0, LIMITE);
  const sansPreuve = candidats.length - aValider.length;
  console.log(
    `[3] validation : ${aValider.length} démo(s) ${ECRIRE ? "validées" : "validables"}` +
      (sansPreuve > 0 ? ` — ${sansPreuve} laissée(s) en chantier faute de carte (rendu non prouvé)` : ""),
  );
  if (!ECRIRE || aValider.length === 0) return;

  let faites = 0;
  for (const t of tranches(aValider.map((c) => c.siteId!), 100)) {
    const { error } = await sb.from("sites").update({ build_stage: "pret" }).in("id", t);
    if (error) console.log(`    ✖ ${t.length} site(s) : ${error.message}`);
    else faites += t.length;
  }
  console.log(`[3] ${faites} démo(s) marquée(s) prêtes`);
}

/** Le compte, dans le vocabulaire de l'écran : prête / chantier / aucune. */
function compter(file: readonly FicheDeLaFile[], titre: string) {
  const prete = file.filter((f) => f.publie || f.buildStage === "pret").length;
  const chantier = file.filter((f) => f.siteId && !f.publie && f.buildStage !== "pret").length;
  const aucune = file.filter((f) => !f.siteId).length;
  const vignette = file.filter((f) => f.aVignette).length;
  const tirage = file.filter((f) => f.aTirage).length;
  console.log(
    `${titre} : ${file.length} fiches — ${prete} prête(s), ${chantier} en chantier, ${aucune} sans démo ` +
      `| ${vignette} vignette(s), ${tirage} bande(s) tirée(s)`,
  );
}

async function main() {
  const avant = await fileDeDemarchage();
  compter(avant, "AVANT");
  if (!ECRIRE) console.log("(lecture seule — ajouter --ecrire pour agir)");

  if (ETAPES.has(1)) await etape1Tirages(avant);
  if (ETAPES.has(2)) await etape2Vignettes(avant);
  if (ETAPES.has(3)) await etape3Validation(avant);

  if (ECRIRE) compter(await fileDeDemarchage(), "APRÈS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
