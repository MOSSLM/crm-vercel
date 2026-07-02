/**
 * Département / région française dérivés d'un code postal (5 chiffres).
 *
 * Sert à remplir `entreprise.departement` et `entreprise.region` sans saisie
 * manuelle. L'approximation préfixe-postal → département est exacte à de rares
 * communes limitrophes près, largement suffisante pour du texte de site vitrine.
 * Codes non français (≠ 5 chiffres) → null.
 */

export interface GeoFr {
  departement: string;
  region: string;
}

const R = {
  ara: "Auvergne-Rhône-Alpes",
  bfc: "Bourgogne-Franche-Comté",
  bre: "Bretagne",
  cvl: "Centre-Val de Loire",
  cor: "Corse",
  ges: "Grand Est",
  hdf: "Hauts-de-France",
  idf: "Île-de-France",
  nor: "Normandie",
  naq: "Nouvelle-Aquitaine",
  occ: "Occitanie",
  pdl: "Pays de la Loire",
  pac: "Provence-Alpes-Côte d'Azur",
} as const;

const DEPARTEMENTS: Record<string, GeoFr> = {
  "01": { departement: "Ain", region: R.ara },
  "02": { departement: "Aisne", region: R.hdf },
  "03": { departement: "Allier", region: R.ara },
  "04": { departement: "Alpes-de-Haute-Provence", region: R.pac },
  "05": { departement: "Hautes-Alpes", region: R.pac },
  "06": { departement: "Alpes-Maritimes", region: R.pac },
  "07": { departement: "Ardèche", region: R.ara },
  "08": { departement: "Ardennes", region: R.ges },
  "09": { departement: "Ariège", region: R.occ },
  "10": { departement: "Aube", region: R.ges },
  "11": { departement: "Aude", region: R.occ },
  "12": { departement: "Aveyron", region: R.occ },
  "13": { departement: "Bouches-du-Rhône", region: R.pac },
  "14": { departement: "Calvados", region: R.nor },
  "15": { departement: "Cantal", region: R.ara },
  "16": { departement: "Charente", region: R.naq },
  "17": { departement: "Charente-Maritime", region: R.naq },
  "18": { departement: "Cher", region: R.cvl },
  "19": { departement: "Corrèze", region: R.naq },
  "21": { departement: "Côte-d'Or", region: R.bfc },
  "22": { departement: "Côtes-d'Armor", region: R.bre },
  "23": { departement: "Creuse", region: R.naq },
  "24": { departement: "Dordogne", region: R.naq },
  "25": { departement: "Doubs", region: R.bfc },
  "26": { departement: "Drôme", region: R.ara },
  "27": { departement: "Eure", region: R.nor },
  "28": { departement: "Eure-et-Loir", region: R.cvl },
  "29": { departement: "Finistère", region: R.bre },
  "30": { departement: "Gard", region: R.occ },
  "31": { departement: "Haute-Garonne", region: R.occ },
  "32": { departement: "Gers", region: R.occ },
  "33": { departement: "Gironde", region: R.naq },
  "34": { departement: "Hérault", region: R.occ },
  "35": { departement: "Ille-et-Vilaine", region: R.bre },
  "36": { departement: "Indre", region: R.cvl },
  "37": { departement: "Indre-et-Loire", region: R.cvl },
  "38": { departement: "Isère", region: R.ara },
  "39": { departement: "Jura", region: R.bfc },
  "40": { departement: "Landes", region: R.naq },
  "41": { departement: "Loir-et-Cher", region: R.cvl },
  "42": { departement: "Loire", region: R.ara },
  "43": { departement: "Haute-Loire", region: R.ara },
  "44": { departement: "Loire-Atlantique", region: R.pdl },
  "45": { departement: "Loiret", region: R.cvl },
  "46": { departement: "Lot", region: R.occ },
  "47": { departement: "Lot-et-Garonne", region: R.naq },
  "48": { departement: "Lozère", region: R.occ },
  "49": { departement: "Maine-et-Loire", region: R.pdl },
  "50": { departement: "Manche", region: R.nor },
  "51": { departement: "Marne", region: R.ges },
  "52": { departement: "Haute-Marne", region: R.ges },
  "53": { departement: "Mayenne", region: R.pdl },
  "54": { departement: "Meurthe-et-Moselle", region: R.ges },
  "55": { departement: "Meuse", region: R.ges },
  "56": { departement: "Morbihan", region: R.bre },
  "57": { departement: "Moselle", region: R.ges },
  "58": { departement: "Nièvre", region: R.bfc },
  "59": { departement: "Nord", region: R.hdf },
  "60": { departement: "Oise", region: R.hdf },
  "61": { departement: "Orne", region: R.nor },
  "62": { departement: "Pas-de-Calais", region: R.hdf },
  "63": { departement: "Puy-de-Dôme", region: R.ara },
  "64": { departement: "Pyrénées-Atlantiques", region: R.naq },
  "65": { departement: "Hautes-Pyrénées", region: R.occ },
  "66": { departement: "Pyrénées-Orientales", region: R.occ },
  "67": { departement: "Bas-Rhin", region: R.ges },
  "68": { departement: "Haut-Rhin", region: R.ges },
  "69": { departement: "Rhône", region: R.ara },
  "70": { departement: "Haute-Saône", region: R.bfc },
  "71": { departement: "Saône-et-Loire", region: R.bfc },
  "72": { departement: "Sarthe", region: R.pdl },
  "73": { departement: "Savoie", region: R.ara },
  "74": { departement: "Haute-Savoie", region: R.ara },
  "75": { departement: "Paris", region: R.idf },
  "76": { departement: "Seine-Maritime", region: R.nor },
  "77": { departement: "Seine-et-Marne", region: R.idf },
  "78": { departement: "Yvelines", region: R.idf },
  "79": { departement: "Deux-Sèvres", region: R.naq },
  "80": { departement: "Somme", region: R.hdf },
  "81": { departement: "Tarn", region: R.occ },
  "82": { departement: "Tarn-et-Garonne", region: R.occ },
  "83": { departement: "Var", region: R.pac },
  "84": { departement: "Vaucluse", region: R.pac },
  "85": { departement: "Vendée", region: R.pdl },
  "86": { departement: "Vienne", region: R.naq },
  "87": { departement: "Haute-Vienne", region: R.naq },
  "88": { departement: "Vosges", region: R.ges },
  "89": { departement: "Yonne", region: R.bfc },
  "90": { departement: "Territoire de Belfort", region: R.bfc },
  "91": { departement: "Essonne", region: R.idf },
  "92": { departement: "Hauts-de-Seine", region: R.idf },
  "93": { departement: "Seine-Saint-Denis", region: R.idf },
  "94": { departement: "Val-de-Marne", region: R.idf },
  "95": { departement: "Val-d'Oise", region: R.idf },
  "971": { departement: "Guadeloupe", region: "Guadeloupe" },
  "972": { departement: "Martinique", region: "Martinique" },
  "973": { departement: "Guyane", region: "Guyane" },
  "974": { departement: "La Réunion", region: "La Réunion" },
  "976": { departement: "Mayotte", region: "Mayotte" },
};

/** Looks up département + région from a French postal code, else null. */
export function geoFromCodePostal(codePostal: string | null | undefined): GeoFr | null {
  const cp = (codePostal ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return null;

  if (cp.startsWith("20")) {
    // Corse : 20000–20199 ≈ Corse-du-Sud, 20200+ ≈ Haute-Corse.
    const departement = parseInt(cp, 10) < 20200 ? "Corse-du-Sud" : "Haute-Corse";
    return { departement, region: R.cor };
  }

  const prefix = cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
  return DEPARTEMENTS[prefix] ?? null;
}
