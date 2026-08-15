/**
 * @jest-environment node
 */
import { GrilleSchema, JobStatusSchema } from "../contract";
import {
  avancement,
  cadreAvecPoints,
  cadreDeTuile,
  cadresDeGrille,
  compterHorsCadre,
  seuilsQuantile,
} from "../grille";

/**
 * Grille volontairement IRRÉGULIÈRE sur son dernier pas : c'est le cas réel.
 * Le cadre d'une ville ne tombe jamais sur un multiple exact du pas de tuilage,
 * si bien que la dernière rangée et la dernière colonne sont plus étroites.
 * Une carte qui reconstruirait la grille en multipliant le pas dessinerait des
 * tuiles fausses précisément sur les bords — là où l'on regarde si la zone est
 * couverte jusqu'au bout.
 */
const GRILLE = GrilleSchema.parse({
  // Nord → sud : le sens dans lequel le crawler numérote ses rangées.
  latitudes: [45.9, 45.8, 45.77],
  // Ouest → est.
  longitudes: [1.2, 1.3, 1.4, 1.44],
  rangees: 2,
  colonnes: 3,
  total: 6,
  tileStep: 0.1,
  source: "openstreetmap",
});

describe("cadreDeTuile", () => {
  it("numérote par rangées, du nord au sud et d'ouest en est", () => {
    // Tuile 1 = coin nord-ouest.
    expect(cadreDeTuile(GRILLE, 1)).toMatchObject({
      rangee: 0,
      colonne: 0,
      nord: 45.9,
      sud: 45.8,
      ouest: 1.2,
      est: 1.3,
    });
    // Tuile 4 = début de la deuxième rangée, donc plus au sud et de retour à l'ouest.
    expect(cadreDeTuile(GRILLE, 4)).toMatchObject({
      rangee: 1,
      colonne: 0,
      nord: 45.8,
      sud: 45.77,
      ouest: 1.2,
    });
  });

  it("respecte la dernière colonne, plus étroite que le pas", () => {
    const derniere = cadreDeTuile(GRILLE, 6);
    expect(derniere).toMatchObject({ rangee: 1, colonne: 2, ouest: 1.4, est: 1.44 });
    // 0,04° et non 0,1° : la tuile de bord ne fait pas la taille du pas.
    expect((derniere!.est - derniere!.ouest)).toBeCloseTo(0.04, 6);
  });

  it("ne peint rien hors des bornes plutôt que de dégénérer", () => {
    expect(cadreDeTuile(GRILLE, 0)).toBeNull();
    expect(cadreDeTuile(GRILLE, 7)).toBeNull();
    expect(cadreDeTuile(GRILLE, 2.5)).toBeNull();
  });

  it("produit exactement autant de cadres que de tuiles annoncées", () => {
    const cadres = cadresDeGrille(GRILLE);
    expect(cadres).toHaveLength(GRILLE.total);
    expect(cadres.map((c) => c.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("cadreAvecPoints", () => {
  const dedans = { lat: 45.85, lng: 1.3 };
  const unPeuDehors = { lat: 45.95, lng: 1.5 };
  const tresLoin = { lat: 47.5, lng: 4.1 };

  it("s'étend pour rattraper une entreprise trouvée hors de la grille", () => {
    // Google rend régulièrement des fiches situées hors de la tuile
    // interrogée : cadrer sur la seule grille les rendait invisibles.
    const sans = cadreAvecPoints(GRILLE, []);
    const avec = cadreAvecPoints(GRILLE, [unPeuDehors]);
    expect(avec.nord).toBeGreaterThan(sans.nord);
    expect(avec.est).toBeGreaterThan(sans.est);
  });

  it("ne bouge pas pour un point déjà dans la grille", () => {
    expect(cadreAvecPoints(GRILLE, [dedans])).toEqual(cadreAvecPoints(GRILLE, []));
  });

  it("refuse de se laisser étirer par un point très éloigné", () => {
    // Mesuré sur Limoges : sans plafond, deux fiches isolées faisaient tripler
    // le cadre et réduisaient la grille — le sujet de l'écran — au tiers de la
    // scène.
    expect(cadreAvecPoints(GRILLE, [tresLoin])).toEqual(cadreAvecPoints(GRILLE, []));
  });

  it("compte, plutôt que de taire, les entreprises hors du cadre", () => {
    const cadre = cadreAvecPoints(GRILLE, [dedans, tresLoin]);
    expect(compterHorsCadre(cadre, [dedans, tresLoin])).toBe(1);
  });
});

describe("avancement", () => {
  it("rend null quand le total est inconnu, pour ne pas afficher une barre pleine", () => {
    // Le scraper a longtemps publié `tuiles_total = 0` : diviser par ce total
    // donnait une barre à 100 % dès la première seconde.
    expect(avancement(3, 0)).toBeNull();
    expect(avancement(3, Number.NaN)).toBeNull();
  });

  it("borne la fraction entre 0 et 1", () => {
    expect(avancement(0, 10)).toBe(0);
    expect(avancement(5, 10)).toBe(0.5);
    expect(avancement(12, 10)).toBe(1);
  });
});

describe("seuilsQuantile", () => {
  it("ignore les tuiles vides : elles ne doivent pas peser sur l'échelle", () => {
    expect(seuilsQuantile([0, 0, 0], 6)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CONTRAT 5 — tolérance au scraper pas encore redéployé
// ---------------------------------------------------------------------------

const STATUT_MINIMAL = {
  jobId: "job-1",
  status: "running",
  found: 4,
  inserted: 3,
  merged: 1,
  saved: 3,
  pages: 0,
  tilesDone: 2,
  tilesTotal: 6,
  rechercheIds: {},
  error: null,
  metadata: {},
};

describe("JobStatusSchema — champs de la carte", () => {
  it("accepte un statut sans aucun champ de carte (scraper pas encore redéployé)", () => {
    // Les deux dépôts sont déployés séparément : sans valeurs par défaut, le
    // premier déploiement du CRM répondrait 502 à tout suivi tant que la machine
    // du scraper n'a pas redémarré — un crawl sain, rendu invisible.
    const parse = JobStatusSchema.safeParse(STATUT_MINIMAL);
    expect(parse.success).toBe(true);
    expect(parse.data!.grille).toBeNull();
    expect(parse.data!.points).toEqual([]);
    expect(parse.data!.tuiles).toEqual([]);
    expect(parse.data!.pointsTotal).toBe(0);
  });

  it("écarte un point aberrant sans emporter tout le suivi", () => {
    const parse = JobStatusSchema.safeParse({
      ...STATUT_MINIMAL,
      points: [
        { nom: "Plomberie A", lat: 45.83, lng: 1.26, nouveau: true, tuile: 1 },
        { nom: "Coordonnées illisibles", lat: "n/a", lng: null },
        { nom: "Plomberie B", lat: 45.84, lng: 1.27, nouveau: false, tuile: 2 },
      ],
    });
    expect(parse.success).toBe(true);
    expect(parse.data!.points.map((p) => p.nom)).toEqual(["Plomberie A", "Plomberie B"]);
  });

  it("écarte le point (0, 0), signature d'une coordonnée manquante", () => {
    // Mesuré : 1 fiche sur 26 au crawl de Limoges ressortait à (0, 0) parce que
    // `Number(null)` vaut 0 et passe `Number.isFinite`. Une entreprise française
    // au large du golfe de Guinée est une donnée absente, pas un lieu.
    const parse = JobStatusSchema.safeParse({
      ...STATUT_MINIMAL,
      points: [
        { nom: "Sans coordonnées", lat: 0, lng: 0 },
        { nom: "Plomberie B", lat: 45.84, lng: 1.27 },
      ],
    });
    expect(parse.success).toBe(true);
    expect(parse.data!.points.map((p) => p.nom)).toEqual(["Plomberie B"]);
  });

  it("distingue une tuile vide (0) d'une tuile pas encore parcourue (null)", () => {
    const parse = JobStatusSchema.safeParse({ ...STATUT_MINIMAL, tuiles: [3, 0, null] });
    expect(parse.success).toBe(true);
    expect(parse.data!.tuiles).toEqual([3, 0, null]);
  });

  it("refuse une grille inexploitable plutôt que de dessiner n'importe quoi", () => {
    // Une seule latitude ne délimite aucune rangée : il n'y a rien à peindre.
    const parse = JobStatusSchema.safeParse({
      ...STATUT_MINIMAL,
      grille: { latitudes: [45.9], longitudes: [1.2, 1.3], rangees: 0, colonnes: 1, total: 0 },
    });
    expect(parse.success).toBe(false);
  });
});
