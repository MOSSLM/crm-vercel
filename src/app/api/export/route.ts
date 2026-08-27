/**
 * GET /api/export?jeu=entreprises|contacts|pipeline — sortir ses données.
 *
 * ── CE QUE CETTE ROUTE REMPLACE ──────────────────────────────────────────
 * Les trois boutons d'export des Paramètres n'avaient AUCUN `onClick`. Ils
 * étaient là depuis le début, ils avaient l'air de marcher, et ils ne faisaient
 * rien. Sur 60 726 entreprises, ne pas pouvoir sortir une liste est un frein
 * quotidien — et un verrou : des données qu'on ne peut pas exporter sont des
 * données qu'on ne possède plus vraiment.
 *
 * ── LA RÉPONSE EST UN FLUX, ET ELLE DOIT L'ÊTRE ──────────────────────────
 * 60 726 entreprises assemblées en mémoire avant d'être rendues, c'est une
 * fonction serverless qui dépasse sa limite mémoire et rend une 500 opaque —
 * exactement au moment où l'export devient utile. On pagine donc en base et on
 * pousse chaque page dans un `ReadableStream` : la mémoire reste plate quel que
 * soit le volume, et le navigateur commence à écrire sur disque avant la fin.
 *
 * PostgREST plafonne par ailleurs une réponse à 1 000 lignes : sans pagination,
 * l'export serait silencieusement tronqué à 1 000 entreprises. Un fichier
 * incomplet SANS message est le pire des deux mondes — on l'utilise en croyant
 * l'avoir en entier.
 *
 * ── « LES RECHERCHES » N'EST PAS EXPORTABLE D'ICI, ET C'EST VOULU ────────
 * Les recherches Google Maps ne vivent pas en base : elles sont servies par le
 * scraper externe, que `api/gmaps/jobs` prend soin de NE JAMAIS réveiller
 * (`skipEnsureRunning`) parce qu'une page qui le sonde en boucle suffirait à le
 * maintenir allumé indéfiniment. Un bouton d'export global dans les Paramètres
 * rallumerait la machine pour un fichier. L'export par recherche existe déjà,
 * là où il a du sens : sur l'écran de recherche (`/api/gmaps/results/:jobId`).
 */

import { jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { enTeteCsv, ligneCsv, nomFichier } from "@/lib/export/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** La taille d'une page. C'est le plafond de PostgREST, autant s'y aligner. */
const PAGE = 1000;

/**
 * Un garde-fou, pas une limite d'usage : à 60 726 entreprises on lit 61 pages.
 * Le plafond n'existe que pour qu'une pagination qui ne progresserait plus (une
 * vue qui rend toujours la même page) s'arrête au lieu de tourner jusqu'au
 * délai de la fonction.
 */
const PAGES_MAX = 500;

type Jeu = {
  table: string;
  colonnes: string[];
  entetes: string[];
  /** Tri stable — sans lui, deux pages peuvent se recouvrir ou se sauter. */
  ordre: string;
  fichier: string;
};

const JEUX: Record<string, Jeu> = {
  entreprises: {
    table: "entreprises",
    colonnes: [
      "id", "name", "siret", "siren", "telephone", "email", "site_web_canonique",
      "adresse", "code_postal", "ville", "departement", "note_moyenne",
      "nombre_avis", "nb_employes_exact", "qualifie", "created_at",
    ],
    entetes: [
      "ID", "Nom", "SIRET", "SIREN", "Téléphone", "E-mail", "Site web",
      "Adresse", "Code postal", "Ville", "Département", "Note Google",
      "Nombre d'avis", "Effectif", "Qualifiée", "Créée le",
    ],
    ordre: "id",
    fichier: "entreprises",
  },
  contacts: {
    table: "contacts",
    colonnes: [
      "id", "entreprise_id", "first_name", "last_name", "role_title",
      "email", "tel", "is_decision_maker", "preferred_channel", "created_at",
    ],
    entetes: [
      "ID", "ID entreprise", "Prénom", "Nom", "Fonction",
      "E-mail", "Téléphone", "Décideur", "Canal préféré", "Créé le",
    ],
    ordre: "created_at",
    fichier: "contacts",
  },
};

/** Le pipeline sort en JSON : il porte des objets imbriqués qu'un CSV aplatirait. */
const PIPELINE_COLONNES =
  "id, name, entreprise_id, contact_id, stage_id, montant, mrr, type, priorite, " +
  "prochaine_action, date_prochain_suivi, tags, flags, created_at, updated_at";

export const GET = withAuth({}, async ({ req, cors }) => {
  const jeuDemande = new URL(req.url).searchParams.get("jeu") ?? "";
  const sb = getServiceClient();

  if (jeuDemande === "pipeline") {
    // Les opportunités vivantes seulement : un export du pipeline qui contient
    // les affaires archivées ne décrit plus le pipeline.
    const { data, error } = await sb
      .from("opportunites")
      .select(PIPELINE_COLONNES)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(10_000);

    if (error) return jsonError(error.message, 500, {}, cors);

    return new Response(JSON.stringify(data ?? [], null, 2), {
      headers: {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichier("pipeline", "json")}"`,
      },
    });
  }

  const jeu = JEUX[jeuDemande];
  if (!jeu) return jsonError("jeu_inconnu", 400, { connus: [...Object.keys(JEUX), "pipeline"] }, cors);

  const flux = new ReadableStream<Uint8Array>({
    async start(controle) {
      const encodeur = new TextEncoder();
      controle.enqueue(encodeur.encode(enTeteCsv(jeu.entetes)));

      try {
        for (let page = 0; page < PAGES_MAX; page += 1) {
          const debut = page * PAGE;
          const { data, error } = await sb
            .from(jeu.table)
            .select(jeu.colonnes.join(", "))
            .order(jeu.ordre, { ascending: true })
            .range(debut, debut + PAGE - 1);

          if (error) throw new Error(error.message);
          const lignes = (data ?? []) as unknown as Array<Record<string, unknown>>;
          if (lignes.length === 0) break;

          let bloc = "";
          for (const ligne of lignes) bloc += ligneCsv(jeu.colonnes.map((c) => ligne[c]));
          controle.enqueue(encodeur.encode(bloc));

          // Page incomplète = dernière page. Économise un aller-retour à vide.
          if (lignes.length < PAGE) break;
        }
        controle.close();
      } catch (e: unknown) {
        // L'en-tête est déjà parti : on ne peut plus rendre un code d'erreur.
        // On écrit donc l'incident DANS le fichier — un CSV qui se termine par
        // une ligne d'erreur se remarque, un fichier tronqué en silence non.
        const message = e instanceof Error ? e.message : "erreur inconnue";
        controle.enqueue(encodeur.encode(ligneCsv([`EXPORT INTERROMPU : ${message}`])));
        controle.close();
      }
    },
  });

  return new Response(flux, {
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier(jeu.fichier, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
});
