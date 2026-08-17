import { z } from "zod";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { METIERS, METIER_PAR_DEFAUT, metierParTag } from "@/lib/gmaps/metiers";
import {
  classerVilles,
  compterFiches,
  densiteReference,
  indexerCommunes,
  type CommuneCandidate,
  type FicheBrute,
  type RecherchePassee,
} from "@/lib/gmaps/prospection";

export const runtime = "nodejs";

/**
 * « Où n'ai-je pas encore cherché ? »
 *
 * Croise trois tables qu'on ne peut pas joindre en une requête depuis le CRM :
 * les communes et leur population, les fiches déjà ramassées, et les recherches
 * déjà lancées. Le calcul lui-même vit dans `@/lib/gmaps/prospection` — cette
 * route ne fait que lire et rendre.
 *
 * POURQUOI LE CROISEMENT SE FAIT ICI ET NON EN SQL
 * Rattacher une fiche à une commune veut dire lire « 33700 Mérignac » au bout
 * d'une adresse libre et retrouver la bonne des trois communes de ce nom. En
 * SQL cela demanderait une fonction en base, donc un objet de plus à tenir à
 * jour hors du dépôt, et surtout intestable : c'est précisément la pièce dont
 * une erreur ne lève rien et affiche seulement une ville couverte comme vierge.
 * En TypeScript elle est sous tests (`prospection.test.ts`).
 */

const ParamsSchema = z.object({
  /** Tag de taxonomie ; à défaut, le métier le plus démarché. */
  metier: z.string().optional(),
  /**
   * Longueur du CLASSEMENT, pas d'une page.
   *
   * L'écran pagine de son côté : le classement entier tient en quelques dizaines
   * de kilo-octets (484 villes de plus de 20 000 habitants × ~150 octets), et le
   * rendre d'un coup fait que tourner la page — ou remplacer une ville qu'on
   * vient de lancer par la suivante — n'attend aucune requête. Le plafond couvre
   * donc tout le vivier au seuil par défaut ; `total` dit s'il a mordu.
   */
  limite: z.coerce.number().int().min(1).max(600).default(600),
  /**
   * En dessous de 20 000 habitants, une commune ne porte pas assez d'artisans
   * pour qu'une passe de trois zones vaille le déplacement — et le classement
   * se remplirait de bourgs dont on n'a évidemment aucune fiche.
   */
  populationMin: z.coerce.number().int().min(0).max(500_000).default(20_000),
});

/** Lignes lues par appel à PostgREST — sa limite dure par défaut. */
const PAGE = 1000;
/**
 * Plafond de lecture des fiches. À 4 119 lignes en base, tout tient en cinq
 * pages ; le plafond n'est pas une optimisation mais un garde-fou, et il est
 * ANNONCÉ dans la réponse (`tronque`) plutôt que silencieux — un classement
 * calculé sur un échantillon sans le dire afficherait des villes couvertes
 * comme vierges, ce qui est exactement l'erreur que cet écran doit éviter.
 */
const MAX_FICHES_LUES = 60_000;

/** Une recherche en erreur n'a rien ratissé : la ville reste à faire. */
const STATUTS_SANS_EFFET = new Set(["error"]);

async function lireFiches(): Promise<{ fiches: FicheBrute[]; tronque: boolean }> {
  const client = getServiceClient();
  const fiches: FicheBrute[] = [];
  for (let debut = 0; debut < MAX_FICHES_LUES; debut += PAGE) {
    const { data, error } = await client
      .from("entreprises_raw")
      .select("adresse, keyword")
      .not("adresse", "is", null)
      .order("id", { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw new Error(error.message);
    const lot = data ?? [];
    for (const ligne of lot) {
      fiches.push({
        adresse: ligne.adresse == null ? null : String(ligne.adresse),
        keyword: ligne.keyword == null ? null : String(ligne.keyword),
      });
    }
    if (lot.length < PAGE) return { fiches, tronque: false };
  }
  return { fiches, tronque: true };
}

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const params = ParamsSchema.safeParse({
    metier: url.searchParams.get("metier") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
    populationMin: url.searchParams.get("populationMin") ?? undefined,
  });
  if (!params.success) {
    return jsonError("parametres_invalides", 400, { details: params.error.flatten() }, cors);
  }

  const metier = metierParTag(params.data.metier) ?? METIER_PAR_DEFAUT;
  if (params.data.metier && !metierParTag(params.data.metier)) {
    return jsonError(
      "metier_inconnu",
      400,
      { connus: METIERS.map((m) => m.tag) },
      cors,
    );
  }

  const client = getServiceClient();

  let communes: CommuneCandidate[];
  let recherches: RecherchePassee[];
  let fiches: FicheBrute[];
  let tronque: boolean;
  try {
    const [reponseCommunes, reponseJobs, lecture] = await Promise.all([
      client
        .from("communes_fr")
        .select("code_insee, nom, population, lat, lon, codes_postaux")
        .gte("population", params.data.populationMin)
        .not("lat", "is", null)
        .not("lon", "is", null)
        .order("population", { ascending: false, nullsFirst: false })
        // 484 communes passent 20 000 habitants ; la marge absorbe un seuil
        // abaissé à la main sans jamais rendre une page démesurée.
        .limit(PAGE),
      client.from("crawl_jobs").select("status, metadata").limit(PAGE),
      lireFiches(),
    ]);

    if (reponseCommunes.error) throw new Error(reponseCommunes.error.message);
    if (reponseJobs.error) throw new Error(reponseJobs.error.message);

    communes = (reponseCommunes.data ?? []).map((c) => ({
      code: String(c.code_insee),
      nom: String(c.nom),
      population: Number(c.population) || 0,
      lat: Number(c.lat),
      lon: Number(c.lon),
      codesPostaux: Array.isArray(c.codes_postaux) ? c.codes_postaux.map(String) : [],
    }));

    recherches = (reponseJobs.data ?? [])
      .filter((j) => !STATUTS_SANS_EFFET.has(String(j.status ?? "")))
      .map((j) => {
        const meta = (j.metadata ?? {}) as Record<string, unknown>;
        const tuilesMax = Number(meta.tuilesMax ?? 0);
        return {
          lieu: String(meta.location ?? ""),
          motsCles: Array.isArray(meta.businessTypes) ? meta.businessTypes.map(String) : [],
          // Les recherches d'avant le mode 80/20 n'ont ni `exploration` ni
          // `tuilesMax` : elles ont donc bien parcouru toute la ville.
          rapide: meta.exploration === "rapide" || tuilesMax > 0,
        };
      })
      .filter((r) => r.lieu !== "");

    ({ fiches, tronque } = lecture);
  } catch (err) {
    return jsonError(
      "suggestions_indisponibles",
      502,
      { message: err instanceof Error ? err.message : "lecture impossible" },
      cors,
    );
  }

  const classement = classerVilles({ communes, fiches, recherches, metier });
  const villes = classement.slice(0, params.data.limite);

  // L'étalon est renvoyé pour être AFFICHÉ, pas seulement utilisé : « 0 fiche »
  // ne veut rien dire tant qu'on ne sait pas ce qu'une ville rend d'ordinaire.
  const index = indexerCommunes(communes);
  const fichesParCommune = compterFiches(fiches, index, metier);
  const densite = densiteReference(fichesParCommune, communes);

  return json(
    {
      metier: { tag: metier.tag, motCle: metier.motCle },
      metiers: METIERS.map((m) => ({ tag: m.tag, motCle: m.motCle })),
      villes,
      /** Longueur du classement AVANT plafonnement — voir `limite`. */
      total: classement.length,
      etalon: {
        densite: densite === null ? null : Math.round(densite * 10) / 10,
        villesCouvertes: fichesParCommune.size,
        fiches: [...fichesParCommune.values()].reduce((somme, n) => somme + n, 0),
      },
      tronque,
    },
    {
      headers: {
        ...cors,
        // Le classement ne bouge qu'après une recherche, et une recherche dure
        // des minutes : cinq minutes de cache épargnent une relecture complète
        // des fiches à chaque changement de métier.
        "Cache-Control": "private, max-age=300",
      },
    },
  );
});
