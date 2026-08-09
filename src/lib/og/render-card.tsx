import "server-only";
import type React from "react";
import { ImageResponse } from "next/og";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOgFonts } from "@/lib/og/fonts";
import { putOgAsset, pruneOgAssets } from "@/lib/og/storage";
import { versJpegSousLimite, CIBLE_CARTE_OCTETS } from "@/lib/images/vers-jpeg";

/**
 * Le socle commun des cartes de partage : rendu satori, dépôt, invalidation.
 *
 * Deux gabarits s'appuient dessus — `demo-card` (le lien démo) et `rapport-card`
 * (le rapport d'audit). Ils ne partagent aucun pixel mais toute la plomberie :
 * chargement des polices, conversion en PNG, hachage, dépôt dans le bucket,
 * écriture de la colonne, nettoyage des anciennes versions. Écrire cette
 * plomberie deux fois, c'était garantir qu'elle diverge à la première correction.
 *
 * `next/og` est livré avec Next — aucune dépendance à installer.
 */

/** Le format que réclament OpenGraph et Twitter `summary_large_image`. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export type PublishCardResult =
  | { ok: true; url: string; bytes: number }
  | { ok: false; error: string };

/** Rend un élément satori en PNG. Jette si satori échoue (police, image illisible). */
export async function renderCardPng(
  element: React.ReactElement,
  opts: { width?: number; height?: number } = {},
): Promise<Uint8Array> {
  const fonts = await loadOgFonts();
  const response = new ImageResponse(element, {
    width: opts.width ?? OG_WIDTH,
    height: opts.height ?? OG_HEIGHT,
    ...(fonts ? { fonts } : {}),
  });
  const buf = await response.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Rend, dépose sous un nom haché, écrit la colonne, nettoie les vieilles
 * versions. Ne lève jamais : l'appelant est soit une route qui doit répondre
 * quelque chose, soit un cron qui traite un lot.
 *
 * `column` et `table` sont paramétrés parce que la carte du démo vit sur `sites`
 * et celle du rapport sur `entreprises_rapport_public` — même mécanique, deux
 * destinations.
 */
export async function publishCard(
  supabase: SupabaseClient,
  opts: {
    element: React.ReactElement;
    /** Dossier dans le bucket : l'id du site, ou celui de l'entreprise. */
    prefix: string;
    /** Nom de base du fichier (`card`, `rapport`, …). */
    name: string;
    /** Où écrire l'URL obtenue. Omis ⇒ on ne fait que déposer. */
    persist?: { table: string; column: string; match: Record<string, unknown>; stampColumn?: string };
    width?: number;
    height?: number;
    /** URLs à ne pas supprimer au nettoyage (les captures encore utilisées). */
    keep?: readonly (string | null | undefined)[];
  },
): Promise<PublishCardResult> {
  let png: Uint8Array;
  try {
    png = await renderCardPng(opts.element, { width: opts.width, height: opts.height });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "rendu impossible";
    console.warn(`[og] rendu de la carte ${opts.prefix}/${opts.name} échoué : ${reason}`);
    return { ok: false, error: reason };
  }

  // Conversion en JPEG : voir `vers-jpeg.ts`. Sans elle, WhatsApp rétrograde la
  // grande carte en vignette carrée minuscule.
  let jpeg: { bytes: Buffer; qualite: number };
  try {
    jpeg = await versJpegSousLimite(png);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "conversion impossible";
    console.warn(`[og] carte ${opts.prefix}/${opts.name} non convertie : ${reason}`);
    return { ok: false, error: reason };
  }

  if (jpeg.bytes.length > CIBLE_CARTE_OCTETS) {
    console.warn(
      `[og] carte ${opts.prefix}/${opts.name} : ${Math.round(jpeg.bytes.length / 1024)} Ko ` +
        `même en qualité ${jpeg.qualite} — au-delà de la cible, WhatsApp peut la rétrograder.`,
    );
  }

  const put = await putOgAsset(supabase, {
    prefix: opts.prefix,
    name: opts.name,
    ext: "jpg",
    contentType: "image/jpeg",
    bytes: jpeg.bytes,
  });
  if (!put.ok) return { ok: false, error: put.error };

  if (opts.persist) {
    const patch: Record<string, unknown> = { [opts.persist.column]: put.publicUrl };
    if (opts.persist.stampColumn) patch[opts.persist.stampColumn] = new Date().toISOString();
    const { error } = await supabase.from(opts.persist.table).update(patch).match(opts.persist.match);
    // Colonne absente (migration non appliquée) : l'image existe et l'appelant a
    // son URL. On journalise et on rend quand même — c'est la règle du dépôt.
    if (error) console.warn(`[og] ${opts.persist.column} non enregistrée : ${error.message}`);
  }

  // Best-effort, jamais bloquant, et surtout jamais sur la version courante.
  void pruneOgAssets(supabase, opts.prefix, [put.publicUrl, ...(opts.keep ?? [])]).catch(() => {});

  return { ok: true, url: put.publicUrl, bytes: jpeg.bytes.length };
}
