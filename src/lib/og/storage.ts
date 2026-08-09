import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dépôt des images de partage (carte OG, captures) dans le stockage public.
 *
 * LE POINT QUI JUSTIFIE CE MODULE : le nom du fichier porte un hash de son
 * contenu.
 *
 * WhatsApp met en cache les vignettes PAR URL, et agressivement. Un chemin fixe
 * — `og/{siteId}/card.png` — servi avec `Cache-Control: immutable` serait
 * définitivement figé dès la première génération : l'opérateur corrige le site,
 * republie, régénère la carte… et la conversation continue d'afficher l'ancienne
 * vignette, pour toujours. Le symptôme ressemble à « le correctif n'a pas
 * marché », ce qui est le pire des diagnostics possibles.
 *
 * Avec un nom haché, chaque contenu distinct a son URL, `immutable` redevient
 * exact, et les messages déjà envoyés continuent d'afficher la carte qu'ils
 * annonçaient — ce qui est le comportement souhaitable.
 *
 * Effet de bord assumé : les anciennes cartes restent dans le bucket. Elles
 * pèsent quelques centaines de kilo-octets par démo ; `pruneOgAssets` les retire
 * au-delà d'un âge donné, sans jamais toucher la version courante.
 */

export const OG_BUCKET = "site-builder-assets";

/** Huit octets de SHA-256 : assez pour un nom de fichier, court à lire en base. */
export function contentHash(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return createHash("sha256").update(view).digest("hex").slice(0, 16);
}

export type PutOgAssetResult =
  | { ok: true; publicUrl: string; path: string; bytes: number }
  | { ok: false; error: string };

/**
 * Dépose `bytes` sous `og/{prefix}/{name}-{hash}.{ext}` et renvoie l'URL
 * publique. Ne lève jamais : les appelants traitent des lots et une image
 * manquante n'est pas une panne.
 *
 * `upsert: true` alors que le chemin est déjà unique par contenu : c'est ce qui
 * rend l'opération rejouable. Deux générations concurrentes du même site
 * produisent le même hash, donc le même chemin, donc le second dépôt écrase des
 * octets identiques au lieu d'échouer.
 */
export async function putOgAsset(
  supabase: SupabaseClient,
  opts: {
    prefix: string;
    name: string;
    ext: string;
    contentType: string;
    bytes: ArrayBuffer | Uint8Array;
  },
): Promise<PutOgAssetResult> {
  const view = opts.bytes instanceof Uint8Array ? opts.bytes : new Uint8Array(opts.bytes);
  const hash = contentHash(view);
  const path = `og/${opts.prefix}/${opts.name}-${hash}.${opts.ext}`;

  const { error } = await supabase.storage.from(OG_BUCKET).upload(path, view, {
    contentType: opts.contentType,
    upsert: true,
    // Exact parce que le chemin change avec le contenu (voir l'en-tête).
    cacheControl: "31536000, immutable",
  });
  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from(OG_BUCKET).getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl, path, bytes: view.length };
}

/**
 * Retire les images de partage d'un préfixe plus vieilles que `maxAgeDays`,
 * SAUF celles dont l'URL est encore référencée (`keep`).
 *
 * Appelé au fil de l'eau par la génération, jamais en balayage global : un
 * nettoyage qui se trompe supprimerait la vignette d'un message déjà envoyé.
 */
export async function pruneOgAssets(
  supabase: SupabaseClient,
  prefix: string,
  keep: readonly (string | null | undefined)[],
  maxAgeDays = 90,
): Promise<number> {
  const { data, error } = await supabase.storage.from(OG_BUCKET).list(`og/${prefix}`, { limit: 100 });
  if (error || !data) return 0;

  const kept = new Set(keep.filter(Boolean).map((u) => (u as string).split("/").pop()));
  const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000;

  const stale = data
    .filter((f) => !kept.has(f.name))
    .filter((f) => {
      const at = f.created_at ? Date.parse(f.created_at) : NaN;
      return Number.isFinite(at) && at < cutoff;
    })
    .map((f) => `og/${prefix}/${f.name}`);

  if (stale.length === 0) return 0;
  const { error: rmError } = await supabase.storage.from(OG_BUCKET).remove(stale);
  return rmError ? 0 : stale.length;
}
