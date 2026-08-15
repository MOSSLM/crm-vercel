/**
 * Référentiel des 96 départements de France métropolitaine.
 *
 * Le contour géographique vit dans `public/geo/departements-fr.json` (contours
 * IGN / Etalab simplifiés, coordonnées arrondies à 4 décimales ≈ 11 m). Ce
 * fichier-là ne porte volontairement que le code : le nom, la région et le
 * chef-lieu sont ici, pour qu'un libellé n'existe qu'à un seul endroit.
 */

export type Departement = {
  code: string;
  nom: string;
  region: string;
  /** Préfecture — sert aussi de terme de recherche dans la barre « aller à ». */
  chefLieu: string;
};

const RAW: Array<[code: string, nom: string, chefLieu: string]> = [
  ["01", "Ain", "Bourg-en-Bresse"],
  ["02", "Aisne", "Laon"],
  ["03", "Allier", "Moulins"],
  ["04", "Alpes-de-Haute-Provence", "Digne-les-Bains"],
  ["05", "Hautes-Alpes", "Gap"],
  ["06", "Alpes-Maritimes", "Nice"],
  ["07", "Ardèche", "Privas"],
  ["08", "Ardennes", "Charleville-Mézières"],
  ["09", "Ariège", "Foix"],
  ["10", "Aube", "Troyes"],
  ["11", "Aude", "Carcassonne"],
  ["12", "Aveyron", "Rodez"],
  ["13", "Bouches-du-Rhône", "Marseille"],
  ["14", "Calvados", "Caen"],
  ["15", "Cantal", "Aurillac"],
  ["16", "Charente", "Angoulême"],
  ["17", "Charente-Maritime", "La Rochelle"],
  ["18", "Cher", "Bourges"],
  ["19", "Corrèze", "Tulle"],
  ["21", "Côte-d'Or", "Dijon"],
  ["22", "Côtes-d'Armor", "Saint-Brieuc"],
  ["23", "Creuse", "Guéret"],
  ["24", "Dordogne", "Périgueux"],
  ["25", "Doubs", "Besançon"],
  ["26", "Drôme", "Valence"],
  ["27", "Eure", "Évreux"],
  ["28", "Eure-et-Loir", "Chartres"],
  ["29", "Finistère", "Quimper"],
  ["2A", "Corse-du-Sud", "Ajaccio"],
  ["2B", "Haute-Corse", "Bastia"],
  ["30", "Gard", "Nîmes"],
  ["31", "Haute-Garonne", "Toulouse"],
  ["32", "Gers", "Auch"],
  ["33", "Gironde", "Bordeaux"],
  ["34", "Hérault", "Montpellier"],
  ["35", "Ille-et-Vilaine", "Rennes"],
  ["36", "Indre", "Châteauroux"],
  ["37", "Indre-et-Loire", "Tours"],
  ["38", "Isère", "Grenoble"],
  ["39", "Jura", "Lons-le-Saunier"],
  ["40", "Landes", "Mont-de-Marsan"],
  ["41", "Loir-et-Cher", "Blois"],
  ["42", "Loire", "Saint-Étienne"],
  ["43", "Haute-Loire", "Le Puy-en-Velay"],
  ["44", "Loire-Atlantique", "Nantes"],
  ["45", "Loiret", "Orléans"],
  ["46", "Lot", "Cahors"],
  ["47", "Lot-et-Garonne", "Agen"],
  ["48", "Lozère", "Mende"],
  ["49", "Maine-et-Loire", "Angers"],
  ["50", "Manche", "Saint-Lô"],
  ["51", "Marne", "Châlons-en-Champagne"],
  ["52", "Haute-Marne", "Chaumont"],
  ["53", "Mayenne", "Laval"],
  ["54", "Meurthe-et-Moselle", "Nancy"],
  ["55", "Meuse", "Bar-le-Duc"],
  ["56", "Morbihan", "Vannes"],
  ["57", "Moselle", "Metz"],
  ["58", "Nièvre", "Nevers"],
  ["59", "Nord", "Lille"],
  ["60", "Oise", "Beauvais"],
  ["61", "Orne", "Alençon"],
  ["62", "Pas-de-Calais", "Arras"],
  ["63", "Puy-de-Dôme", "Clermont-Ferrand"],
  ["64", "Pyrénées-Atlantiques", "Pau"],
  ["65", "Hautes-Pyrénées", "Tarbes"],
  ["66", "Pyrénées-Orientales", "Perpignan"],
  ["67", "Bas-Rhin", "Strasbourg"],
  ["68", "Haut-Rhin", "Colmar"],
  ["69", "Rhône", "Lyon"],
  ["70", "Haute-Saône", "Vesoul"],
  ["71", "Saône-et-Loire", "Mâcon"],
  ["72", "Sarthe", "Le Mans"],
  ["73", "Savoie", "Chambéry"],
  ["74", "Haute-Savoie", "Annecy"],
  ["75", "Paris", "Paris"],
  ["76", "Seine-Maritime", "Rouen"],
  ["77", "Seine-et-Marne", "Melun"],
  ["78", "Yvelines", "Versailles"],
  ["79", "Deux-Sèvres", "Niort"],
  ["80", "Somme", "Amiens"],
  ["81", "Tarn", "Albi"],
  ["82", "Tarn-et-Garonne", "Montauban"],
  ["83", "Var", "Toulon"],
  ["84", "Vaucluse", "Avignon"],
  ["85", "Vendée", "La Roche-sur-Yon"],
  ["86", "Vienne", "Poitiers"],
  ["87", "Haute-Vienne", "Limoges"],
  ["88", "Vosges", "Épinal"],
  ["89", "Yonne", "Auxerre"],
  ["90", "Territoire de Belfort", "Belfort"],
  ["91", "Essonne", "Évry-Courcouronnes"],
  ["92", "Hauts-de-Seine", "Nanterre"],
  ["93", "Seine-Saint-Denis", "Bobigny"],
  ["94", "Val-de-Marne", "Créteil"],
  ["95", "Val-d'Oise", "Cergy"],
];

const REGIONS: Record<string, string[]> = {
  "Auvergne-Rhône-Alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "Bourgogne-Franche-Comté": ["21", "25", "39", "58", "70", "71", "89", "90"],
  Bretagne: ["22", "29", "35", "56"],
  "Centre-Val de Loire": ["18", "28", "36", "37", "41", "45"],
  Corse: ["2A", "2B"],
  "Grand Est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "Hauts-de-France": ["02", "59", "60", "62", "80"],
  "Île-de-France": ["75", "77", "78", "91", "92", "93", "94", "95"],
  Normandie: ["14", "27", "50", "61", "76"],
  "Nouvelle-Aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  Occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "Pays de la Loire": ["44", "49", "53", "72", "85"],
  "Provence-Alpes-Côte d'Azur": ["04", "05", "06", "13", "83", "84"],
};

const REGION_OF: Record<string, string> = {};
for (const [region, codes] of Object.entries(REGIONS)) {
  for (const code of codes) REGION_OF[code] = region;
}

export const DEPARTEMENTS: Departement[] = RAW.map(([code, nom, chefLieu]) => ({
  code,
  nom,
  chefLieu,
  region: REGION_OF[code] ?? "—",
}));

export const DEPARTEMENT_BY_CODE: Record<string, Departement> = Object.fromEntries(
  DEPARTEMENTS.map((d) => [d.code, d]),
);

/** URL du fond de carte (asset statique, servi depuis `public/`). */
export const CONTOURS_URL = "/geo/departements-fr.json";

/**
 * Code département déduit d'un code postal. Ne sert que de secours quand une
 * fiche n'a pas de coordonnées : le rattachement de référence se fait par
 * point-dans-polygone (cf. `resolveDepartement`), pour que la pastille tombe
 * toujours dans le département qu'on lui compte.
 *
 * La Corse est le seul cas particulier : elle partage le préfixe « 20 » entre
 * deux départements (200xx/201xx → 2A, le reste → 2B).
 */
export function departementFromCodePostal(cp: string | null | undefined): string | null {
  if (!cp) return null;
  const clean = cp.replace(/\s/g, "");
  if (!/^\d{5}$/.test(clean)) return null;
  const prefix = clean.slice(0, 2);
  if (prefix === "20") {
    const n = Number(clean.slice(2));
    return n < 200 ? "2A" : "2B";
  }
  return DEPARTEMENT_BY_CODE[prefix] ? prefix : null;
}
