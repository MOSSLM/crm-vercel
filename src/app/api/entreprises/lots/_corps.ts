import { z } from "zod";

import { schemaFiltres } from "../explorateur/_filtres";

/**
 * Les corps acceptés pour figer un lot — sortis de la route pour être
 * ÉPROUVABLES.
 *
 * POURQUOI CE FICHIER EXISTE. `ExplorateurEntreprises` postait
 * `entreprise_ids` là où le schéma attend `entrepriseIds`. Zod ne voyait donc
 * aucun identifiant, rendait 400 « Required », et l'explorateur — le seul
 * chemin que l'écran vide des lots proposait pour en créer un — ne pouvait rien
 * figer. Rien ne le signalait : la route répondait parfaitement, à une demande
 * que personne ne lui faisait.
 *
 * Un schéma enfermé dans un `route.ts` ne se teste pas : Next réserve les
 * exports d'un fichier de route à ses propres noms. D'où ce voisin en `_`, la
 * même convention que `api/automations/campagnes/_campagne.ts`. Ce que le test
 * vérifie n'est pas que Zod fonctionne, c'est que le corps RÉELLEMENT envoyé
 * par chaque écran traverse la porte.
 */

/**
 * Le plafond d'un lot. Même valeur pour les deux portes : au-delà, ce n'est
 * plus un lot de travail, c'est un backfill — et un backfill se pilote
 * autrement qu'en cochant une case sur un téléphone.
 */
export const PLAFOND_LOT = 20_000;

/**
 * LA PREMIÈRE PORTE : une liste d'identifiants.
 *
 * C'est l'appelant — l'explorateur, le marketing pipeline — qui a déjà résolu
 * sa requête et sait exactement ce qu'il a sous les yeux. Refaire la requête
 * ici rendrait un lot différent de ce que l'humain a vu défiler, sans que rien
 * ne le signale.
 */
export const corpsSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  entrepriseIds: z.array(z.number().int().positive()).min(1).max(PLAFOND_LOT),
});

/**
 * L'AUTRE PORTE : figer depuis des critères, sans transporter les identifiants.
 *
 * La règle ci-dessus visait le SILENCE d'une divergence, pas la résolution côté
 * serveur — et sa prémisse (« ce que l'humain a vu défiler ») ne tient plus à
 * 34 633 lignes : personne ne fait défiler ça. Ce que l'humain voit, c'est un
 * NOMBRE. C'est donc ce nombre qu'on protège : `totalAttendu` est comparé en
 * base, et une divergence REFUSE la création au lieu de fabriquer un lot que
 * personne n'a validé.
 *
 * Sans cette porte, figer 20 000 fiches depuis un téléphone demandait de
 * parcourir cent pages puis de poster 150 ko de JSON. Avec, c'est un appel —
 * mesuré à ~350 ms sur les « sans site ».
 */
export const corpsCriteresSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  criteres: z.object({
    q: z.string().trim().max(200).nullable().optional(),
    flags: z.array(z.string()).max(20).optional(),
    sources: z.array(z.string()).max(10).optional(),
    owner: z.string().uuid().nullable().optional(),
    /**
     * Le vocabulaire du pipeline marketing. Il est ACCEPTÉ à la lecture pour
     * qu'un segment venu de là puisse être présenté tel quel — et refusé par la
     * route, parce que `chercher_entreprises` ne sait pas le trancher.
     */
    services: z.array(z.string()).max(50).optional(),
    filtres: z.array(z.string()).max(20).optional(),
  }),
  /** Le compte affiché au moment du clic. La garde, et la raison d'être de cette porte. */
  totalAttendu: z.number().int().nonnegative(),
});

/**
 * LA TROISIÈME PORTE : les filtres de l'explorateur, tels quels.
 *
 * Les deux autres ne pouvaient pas la remplacer. Par identifiants, on plafonne
 * à ce qui est coché — cinq cents fiches, une page à la fois : sans objet sur
 * un résultat de 34 633 lignes. Par critères, on ne parle que le vocabulaire de
 * `chercher_entreprises`, neuf drapeaux et quatre sources : figer « WordPress
 * abandonnés, en Gironde » par là rendrait TOUT LE PARC, puisque ni la
 * technologie ni le département ne s'y traduisent.
 *
 * `schemaFiltres` est celui de l'écran, importé et pas recopié : ce que
 * l'explorateur affiche et ce qu'on fige traversent la même validation, puis le
 * même `explorateur_base_sql`. Il n'y a rien à faire diverger.
 *
 * `totalAttendu` est le compte qui était affiché au moment du clic. La base le
 * recompte et REFUSE de créer quoi que ce soit s'il a bougé : c'est ce qui
 * permet de figer sans transporter d'identifiants sans perdre ce que la règle
 * d'origine protégeait — le silence d'une divergence.
 */
export const corpsExplorateurSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).nullable().optional(),
  filtres: schemaFiltres,
  totalAttendu: z.number().int().nonnegative(),
});

export type CorpsLot = z.infer<typeof corpsSchema>;
export type CorpsLotCriteres = z.infer<typeof corpsCriteresSchema>;
export type CorpsLotExplorateur = z.infer<typeof corpsExplorateurSchema>;
