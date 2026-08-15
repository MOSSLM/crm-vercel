/**
 * Repères de villes sur une carte : chargement, puis placement des noms.
 *
 * Le placement est la partie qui compte. Poser un nom à côté de chaque ville
 * donne une bouillie illisible dès qu'il y en a plus d'une dizaine — et sur la
 * France entière il y en a des centaines. On place donc les noms du plus peuplé
 * au moins peuplé, en écartant tout nom qui recouvrirait un nom déjà posé.
 *
 * L'effet recherché, et le comportement obtenu : à faible zoom seules les
 * grandes villes tiennent, et à mesure qu'on zoome les voisines cessent de se
 * gêner et apparaissent d'elles-mêmes — sans palier arbitraire à écrire.
 */
import { authedFetch } from "@/utils/authedFetch";

export type Commune = {
  code: string;
  nom: string;
  lat: number;
  lon: number;
  population: number;
};

export type EtiquetteCommune = Commune & { x: number; y: number };

/** Emprise géographique, en degrés décimaux. */
export type Emprise = { ouest: number; sud: number; est: number; nord: number };

export async function chargerCommunes(
  options: { emprise?: Emprise; limite?: number; populationMin?: number } = {},
  signal?: AbortSignal,
): Promise<Commune[]> {
  const params = new URLSearchParams();
  if (options.emprise) {
    const { ouest, sud, est, nord } = options.emprise;
    params.set("bbox", `${ouest},${sud},${est},${nord}`);
  }
  if (options.limite) params.set("limite", String(options.limite));
  if (options.populationMin) params.set("populationMin", String(options.populationMin));

  const res = await authedFetch(`/api/geo/communes?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`communes indisponibles (HTTP ${res.status})`);
  const corps = (await res.json()) as { communes?: unknown };
  if (!Array.isArray(corps.communes)) return [];
  return corps.communes.filter(
    (c): c is Commune =>
      !!c &&
      typeof c === "object" &&
      Number.isFinite((c as Commune).lat) &&
      Number.isFinite((c as Commune).lon),
  );
}

export type ContourCommune = {
  code: string;
  nom: string;
  population: number;
  contour: { type: string; coordinates: unknown };
};

/**
 * Silhouettes des communes d'une zone. Une seule requête, mise en cache un jour
 * côté navigateur : le découpage communal ne bouge qu'au 1ᵉʳ janvier.
 */
export async function chargerContoursCommunes(
  emprise: Emprise,
  limite = 24,
  signal?: AbortSignal,
): Promise<ContourCommune[]> {
  const params = new URLSearchParams({
    bbox: `${emprise.ouest},${emprise.sud},${emprise.est},${emprise.nord}`,
    limite: String(limite),
  });
  const res = await authedFetch(`/api/geo/communes/contours?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`contours indisponibles (HTTP ${res.status})`);
  const corps = (await res.json()) as { contours?: unknown };
  if (!Array.isArray(corps.contours)) return [];
  return corps.contours.filter(
    (c): c is ContourCommune =>
      !!c && typeof c === "object" && !!(c as ContourCommune).contour,
  );
}

/**
 * Comparaison de noms de communes indifférente aux accents, tirets et casse :
 * « Évry-Courcouronnes » saisi dans le formulaire doit reconnaître
 * « Evry Courcouronnes » rendu par l'API.
 */
export function memeCommune(a: string | null | undefined, b: string | null | undefined): boolean {
  const normaliser = (v: string) =>
    v
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  if (!a || !b) return false;
  return normaliser(a) === normaliser(b);
}

/** Largeur approximative d'un nom, en pixels, pour la détection de recouvrement. */
const largeurTexte = (nom: string, taille: number) => nom.length * taille * 0.54;

type Boite = { x0: number; y0: number; x1: number; y1: number };
const seChevauchent = (a: Boite, b: Boite) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Retient les villes dont le nom tient sans en recouvrir un autre.
 *
 * @param candidats  villes DÉJÀ projetées à l'écran, dans n'importe quel ordre
 * @param vue        dimensions de la scène : ce qui déborde n'est pas placé
 * @param taille     taille du texte, en pixels
 * @param maximum    garde-fou : au-delà, la carte redevient une bouillie
 */
export function placerEtiquettes(
  candidats: EtiquetteCommune[],
  vue: { largeur: number; hauteur: number },
  taille = 10,
  maximum = 28,
): EtiquetteCommune[] {
  // Du plus peuplé au moins peuplé : c'est ce qui décide QUI l'emporte quand
  // deux noms se disputent la même place.
  const tries = [...candidats].sort((a, b) => b.population - a.population);
  const posees: Boite[] = [];
  const retenues: EtiquetteCommune[] = [];

  for (const c of tries) {
    if (retenues.length >= maximum) break;
    // La pastille occupe la place à gauche du texte ; on réserve les deux.
    const largeur = largeurTexte(c.nom, taille) + taille;
    const hauteur = taille * 1.5;
    const boite: Boite = {
      x0: c.x - taille * 0.6,
      y0: c.y - hauteur / 2,
      x1: c.x + largeur,
      y1: c.y + hauteur / 2,
    };
    // Hors de la scène : inutile de le poser, et il fausserait l'encombrement.
    if (boite.x0 < 0 || boite.y0 < 0 || boite.x1 > vue.largeur || boite.y1 > vue.hauteur) continue;
    if (posees.some((p) => seChevauchent(p, boite))) continue;
    posees.push(boite);
    retenues.push(c);
  }
  return retenues;
}
