import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDemoCard } from "@/lib/og/build-demo-card";
import { UNDEFINED_COLUMN } from "@/lib/schema-drift";

/**
 * Le filet des cartes de partage.
 *
 * Le chemin normal fabrique la carte à l'ouverture du dialogue « Partager »,
 * juste avant l'envoi. Mais tous les envois ne passent pas par un humain : les
 * séquences automatiques envoient le lien sans que personne n'ouvre de dialogue.
 * Sans ce filet, ces liens-là s'affichent nus — c'est-à-dire exactement le
 * défaut qu'on corrige, sur la moitié des envois.
 *
 * Volontairement minuscule (quelques sites par tick) : c'est un rattrapage, pas
 * un balayage de parc. Les captures coûtent des secondes, et le cron a d'abord
 * un lot d'analyses à traiter.
 */

export interface PreparerResult {
  preparees: number;
  echecs: number;
}

export async function preparerCartesManquantes(
  sb: SupabaseClient,
  opts: { limite?: number; budgetMs?: number } = {},
): Promise<PreparerResult> {
  const limite = opts.limite ?? 3;
  const budget = opts.budgetMs ?? 8_000;
  const debut = Date.now();

  if (budget <= 0) return { preparees: 0, echecs: 0 };

  const { data, error } = await sb
    .from("sites")
    .select("id")
    .eq("is_published", true)
    .is("og_image_url", null)
    .limit(limite);

  // `og_image_url` est nommée dans le FILTRE autant que dans le select :
  // `selectDroppingMissingColumns` ne peut rien pour cette requête, et c'est
  // très bien. Migration non appliquée ⇒ le filet s'éteint sans bruit, ce qui
  // est exactement la dégradation voulue pour un rattrapage optionnel.
  if (error) {
    if (error.code !== UNDEFINED_COLUMN) {
      console.warn(`[og] filet cartes manquantes : ${error.message}`);
    }
    return { preparees: 0, echecs: 0 };
  }

  let preparees = 0;
  let echecs = 0;
  for (const site of (data ?? []) as Array<{ id: string }>) {
    if (Date.now() - debut > budget) break;
    const res = await buildDemoCard(sb, site.id).catch(() => null);
    if (res?.ok) preparees++;
    else echecs++;
  }
  return { preparees, echecs };
}
