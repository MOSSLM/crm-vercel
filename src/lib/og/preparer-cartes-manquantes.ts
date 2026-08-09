import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDemoCard } from "@/lib/og/build-demo-card";
import { UNDEFINED_COLUMN } from "@/lib/schema-drift";

/**
 * Fabriquer à l'avance les cartes de partage qui manquent.
 *
 * POURQUOI CE FILET EST LA SEULE PROTECTION DES ENVOIS AUTOMATIQUES.
 *
 * Le chemin manuel prépare la carte au bon moment : l'opérateur ouvre le
 * dialogue « Partager » ou copie le lien, et la fabrication a lieu avant
 * l'envoi. Les séquences automatiques, elles, n'ouvrent aucun dialogue.
 *
 * Et le rattrapage à la volée N'EXISTE PAS, contrairement à ce qu'affirmait une
 * version antérieure de ce commentaire : la route de secours met 20 à 45
 * secondes à fabriquer une carte (deux captures, chacune avec appel de chauffe),
 * là où un robot d'unfurl abandonne après quelques secondes. Il repart sans
 * vignette — et met ce vide en cache. Une carte absente au moment de l'envoi
 * est donc une carte définitivement absente pour ce destinataire.
 *
 * D'où deux corrections par rapport à la première version :
 *
 *   1. **Toutes les démos, pas seulement les déployées.** Le filtre
 *      `is_published` excluait exactement les liens sans autre protection : sur
 *      ce parc, AUCUN site n'est déployé, et le filet ne couvrait donc rien.
 *
 *   2. **Rotation sur échec.** Prendre les premières lignes sans mémoriser les
 *      tentatives faisait reboucler indéfiniment sur les mêmes sites en échec —
 *      les suivants n'étaient jamais atteints. `og_generated_at` sert de date de
 *      DERNIÈRE TENTATIVE, réussie ou non : les jamais tentées passent d'abord,
 *      puis les plus anciennes.
 */

export interface PreparerResult {
  preparees: number;
  echecs: number;
  /** Combien de démos attendent encore leur carte, après ce passage. */
  restantes: number | null;
}

/** Sites traités simultanément. Chacun lance déjà deux captures en parallèle. */
const CONCURRENCE = 3;

export async function preparerCartesManquantes(
  sb: SupabaseClient,
  opts: { limite?: number; budgetMs?: number } = {},
): Promise<PreparerResult> {
  const limite = opts.limite ?? 6;
  const budget = opts.budgetMs ?? 45_000;
  const debut = Date.now();

  if (budget <= 0) return { preparees: 0, echecs: 0, restantes: null };

  const { data, error, count } = await sb
    .from("sites")
    .select("id, og_generated_at", { count: "exact" })
    .is("og_image_url", null)
    .not("enterprise_id", "is", null)
    .neq("is_template", true)
    // Jamais tentées d'abord, puis les tentatives les plus anciennes : c'est ce
    // qui empêche trois sites en échec de monopoliser tous les passages.
    .order("og_generated_at", { ascending: true, nullsFirst: true })
    .limit(limite);

  // Colonne absente (migration non appliquée) : le filet s'éteint sans bruit.
  if (error) {
    if (error.code !== UNDEFINED_COLUMN) {
      console.warn(`[og] filet cartes manquantes : ${error.message}`);
    }
    return { preparees: 0, echecs: 0, restantes: null };
  }

  const sites = (data ?? []) as Array<{ id: string }>;
  let preparees = 0;
  let echecs = 0;

  // Par paquets : une carte demande deux captures de ~20 s à un service tiers.
  // En série, un passage n'en traiterait qu'une seule ; toutes d'un coup, on
  // se ferait limiter.
  for (let i = 0; i < sites.length; i += CONCURRENCE) {
    if (Date.now() - debut > budget) break;
    const paquet = sites.slice(i, i + CONCURRENCE);
    const resultats = await Promise.all(
      paquet.map(async (site) => {
        const res = await buildDemoCard(sb, site.id).catch(() => null);
        // La date de tentative est posée MÊME EN ÉCHEC : c'est elle qui fait
        // tourner la file. Sans ça, un site injoignable serait retenté à chaque
        // passage et bloquerait tous les autres.
        if (!res?.ok) {
          await sb
            .from("sites")
            .update({ og_generated_at: new Date().toISOString() })
            .eq("id", site.id)
            .then(undefined, () => undefined);
        }
        return res?.ok === true;
      }),
    );
    for (const ok of resultats) ok ? preparees++ : echecs++;
  }

  return {
    preparees,
    echecs,
    restantes: typeof count === "number" ? Math.max(0, count - preparees) : null,
  };
}
