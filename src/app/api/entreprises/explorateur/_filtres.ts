import { z } from "zod";

/**
 * Le vocabulaire de filtres de l'explorateur — une seule définition.
 *
 * POURQUOI IL VIT ICI ET PLUS DANS LA ROUTE. Deux appelants s'en servent
 * maintenant : `/api/entreprises/explorateur`, qui AFFICHE la population, et
 * `/api/entreprises/lots`, qui la FIGE. S'ils portaient chacun leur copie, un
 * filtre ajouté d'un côté serait accepté et ignoré de l'autre — le lot serait
 * alors plus large que ce que l'écran montrait, sans que rien ne le signale.
 * C'est exactement le mensonge que ce dépôt refuse déjà pour les drapeaux
 * inconnus de `chercher_entreprises`.
 *
 * La couture est fermée jusqu'en base : les deux routes passent cet objet à
 * `explorateur_base_sql`, qui rend le SQL. Un filtre traverse donc la chaîne
 * entière ou n'existe nulle part.
 *
 * Un fichier de route ne peut rien exporter d'autre que les noms de Next, d'où
 * ce voisin en `_` — même convention que `api/automations/campagnes/_campagne.ts`.
 */

const ternaire = z.enum(["oui", "non"]).optional();
const perimetre = z.enum(["exclure", "inclure", "seulement"]).optional();
const listeTexte = z.array(z.string().min(1).max(120)).max(200).optional();

export const schemaFiltres = z
  .object({
    q: z.string().max(200).optional(),
    qualifie: ternaire,
    opportunite: ternaire,
    fiche_google: ternaire,
    demarche: ternaire,
    rge: ternaire,
    email: ternaire,
    telephone: ternaire,
    siret: ternaire,
    logo: ternaire,
    masquees: perimetre,
    archivees: perimetre,
    avis_min: z.number().int().min(0).max(100000).optional(),
    avis_max: z.number().int().min(0).max(100000).optional(),
    note_min: z.number().min(0).max(5).optional(),
    ca_min: z.number().int().min(0).optional(),
    ca_max: z.number().int().min(0).optional(),
    site: listeTexte,
    demo: listeTexte,
    ca: listeTexte,
    effectif: listeTexte,
    avis: listeTexte,
    departements: listeTexte,
    villes: listeTexte,
    sources: listeTexte,
    cohortes: listeTexte,
    technologies: listeTexte,
    // Un lot se choisit, pas se coche : un seul id, pas un tableau.
    lot_id: z.number().int().positive().optional(),
  })
  .strict();

export type FiltresExplorateur = z.infer<typeof schemaFiltres>;

/**
 * Zod laisse passer les clés absentes comme `undefined` ; `JSON.stringify` les
 * supprimerait, mais on les retire explicitement pour que le SQL voie un objet
 * sans clé plutôt qu'une clé à `null` — les deux ne veulent pas dire pareil
 * côté `nullif(...)`.
 */
export function nettoyer(filtres: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(filtres ?? {})) {
    if (valeur === undefined || valeur === null) continue;
    if (typeof valeur === "string" && valeur.trim() === "") continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    out[cle] = valeur;
  }
  return out;
}

/**
 * Un jeu de filtres désigne-t-il vraiment une population, ou tout le parc ?
 *
 * `masquees` et `archivees` ne comptent pas TANT QU'ILS SONT AU DÉFAUT : l'écran
 * les pose à « exclure » sans qu'on ait rien choisi, et ils ne réduisent donc
 * rien. Réglés autrement — « archivées seulement » — ce sont de vrais critères,
 * et un lot d'archivées est une demande légitime.
 *
 * La règle est recopiée de `filtresActifs` (src/lib/entreprises/explorateur.ts),
 * qui la tient côté écran. Les deux DOIVENT rester d'accord : si le serveur
 * comptait autrement, l'écran proposerait un bouton actif que la route refuse,
 * ou l'inverse. La couture est tenue par `corps.test.ts`.
 *
 * Sans cette garde, un lot sans critère prendrait les 60 000 fiches sous un nom
 * qui promet le contraire — le plafond finirait par le refuser, mais bien plus
 * tard et pour la mauvaise raison.
 */
const PERIMETRES_PAR_DEFAUT: Record<string, string> = { masquees: "exclure", archivees: "exclure" };

export function filtresVides(filtres: Record<string, unknown>): boolean {
  return Object.entries(filtres).every(([cle, valeur]) => PERIMETRES_PAR_DEFAUT[cle] === valeur);
}
