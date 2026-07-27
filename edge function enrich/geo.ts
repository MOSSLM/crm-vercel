// =====================================================================
// Géographie : grande ville de repli déduite du code postal
// =====================================================================
// Filet de sécurité pour la ville SEO (`closest_big_city`). Le LLM dispose du
// site, de la fiche Google, de l'adresse et du code postal : il doit renvoyer
// une vraie ville dans l'immense majorité des cas. Quand il ne renvoie rien, on
// retombe sur la ville la plus significative du département — une vraie ville,
// jamais un placeholder.
//
// Le découpage préfixe postal → département reprend celui de
// `src/lib/site-builder/geo-fr.ts` (exact à quelques communes limitrophes près).
//
// Deux écarts assumés par rapport à la liste stricte des préfectures, parce que
// l'usage ici est SEO ("la grande ville qu'on met en avant") et pas administratif :
//  - Île-de-France (75, 77, 78, 91→95) → Paris, et non la préfecture du
//    département (Melun, Versailles, Bobigny…) ;
//  - Pas-de-Calais (62) → Lille est hors département : on garde Arras, la
//    préfecture, qui reste une vraie grande ville du secteur.
// =====================================================================

const PARIS = "Paris";

const BIG_CITY_BY_DEPARTEMENT: Record<string, string> = {
  "01": "Bourg-en-Bresse",
  "02": "Laon",
  "03": "Moulins",
  "04": "Digne-les-Bains",
  "05": "Gap",
  "06": "Nice",
  "07": "Privas",
  "08": "Charleville-Mézières",
  "09": "Foix",
  "10": "Troyes",
  "11": "Carcassonne",
  "12": "Rodez",
  "13": "Marseille",
  "14": "Caen",
  "15": "Aurillac",
  "16": "Angoulême",
  "17": "La Rochelle",
  "18": "Bourges",
  "19": "Tulle",
  "21": "Dijon",
  "22": "Saint-Brieuc",
  "23": "Guéret",
  "24": "Périgueux",
  "25": "Besançon",
  "26": "Valence",
  "27": "Évreux",
  "28": "Chartres",
  "29": "Quimper",
  "30": "Nîmes",
  "31": "Toulouse",
  "32": "Auch",
  "33": "Bordeaux",
  "34": "Montpellier",
  "35": "Rennes",
  "36": "Châteauroux",
  "37": "Tours",
  "38": "Grenoble",
  "39": "Lons-le-Saunier",
  "40": "Mont-de-Marsan",
  "41": "Blois",
  "42": "Saint-Étienne",
  "43": "Le Puy-en-Velay",
  "44": "Nantes",
  "45": "Orléans",
  "46": "Cahors",
  "47": "Agen",
  "48": "Mende",
  "49": "Angers",
  "50": "Saint-Lô",
  "51": "Châlons-en-Champagne",
  "52": "Chaumont",
  "53": "Laval",
  "54": "Nancy",
  "55": "Bar-le-Duc",
  "56": "Vannes",
  "57": "Metz",
  "58": "Nevers",
  "59": "Lille",
  "60": "Beauvais",
  "61": "Alençon",
  "62": "Arras",
  "63": "Clermont-Ferrand",
  "64": "Pau",
  "65": "Tarbes",
  "66": "Perpignan",
  "67": "Strasbourg",
  "68": "Colmar",
  "69": "Lyon",
  "70": "Vesoul",
  "71": "Mâcon",
  "72": "Le Mans",
  "73": "Chambéry",
  "74": "Annecy",
  "75": PARIS,
  "76": "Rouen",
  "77": PARIS,
  "78": PARIS,
  "79": "Niort",
  "80": "Amiens",
  "81": "Albi",
  "82": "Montauban",
  "83": "Toulon",
  "84": "Avignon",
  "85": "La Roche-sur-Yon",
  "86": "Poitiers",
  "87": "Limoges",
  "88": "Épinal",
  "89": "Auxerre",
  "90": "Belfort",
  "91": PARIS,
  "92": PARIS,
  "93": PARIS,
  "94": PARIS,
  "95": PARIS,
  "971": "Pointe-à-Pitre",
  "972": "Fort-de-France",
  "973": "Cayenne",
  "974": "Saint-Denis",
  "976": "Mamoudzou",
};

/**
 * Grande ville de référence pour un code postal français (5 chiffres).
 * Retourne null pour un code absent ou non français — l'appelant retombe alors
 * sur la ville de l'entreprise.
 */
export function bigCityFromCodePostal(codePostal: string | null | undefined): string | null {
  const cp = (codePostal ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return null;

  // Corse : 20000–20199 ≈ Corse-du-Sud (Ajaccio), 20200+ ≈ Haute-Corse (Bastia).
  if (cp.startsWith("20")) {
    return parseInt(cp, 10) < 20200 ? "Ajaccio" : "Bastia";
  }

  const prefix = cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
  return BIG_CITY_BY_DEPARTEMENT[prefix] ?? null;
}
