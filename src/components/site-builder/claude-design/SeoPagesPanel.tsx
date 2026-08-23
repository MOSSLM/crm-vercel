"use client";

import React from "react";
import type { SitemapPage, SeoMeta } from "@/types";
import { LONGUEURS_SEO, verdictLongueur, type ChampSeo } from "@/lib/site-builder/seo-longueurs";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";

/**
 * Le SEO page par page, dans l'éditeur des designs Claude.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PANNEAU EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le modèle de données portait DÉJÀ un titre et une description par page
 * (`SitemapPage.metaTitle`…), et `buildPageMetadata` les sert depuis toujours.
 * Ce qui manquait, c'est l'endroit où les écrire : le panneau SEO ne vit que
 * dans l'éditeur Relume, et les démos — donc les sites qui deviennent de vrais
 * sites — sont des designs Claude. Toutes leurs pages sortaient avec le titre
 * de repli « {Titre de la page} — {Entreprise} », c'est-à-dire la même formule
 * pour huit pages, ce qu'un moteur lit comme huit pages interchangeables.
 *
 * Les valeurs acceptent les variables `{{ entreprise.ville }}` : le compteur
 * de caractères compte la longueur INTERPOLÉE, la seule que Google voit.
 */

const COULEURS: Record<ReturnType<typeof verdictLongueur>, string> = {
  vide: "var(--text-4)",
  court: "var(--warn, #b45309)",
  bon: "var(--success, #15803d)",
  long: "var(--danger, #b91c1c)",
};

function Compteur({ valeur, variables, champ }: { valeur: string; variables: Record<string, string>; champ: ChampSeo }) {
  const bornes = LONGUEURS_SEO[champ];
  const longueur = interpolateVars(valeur ?? "", variables).length;
  const ideal = bornes ? ` · idéal ${bornes.min ? `${bornes.min}–${bornes.max}` : `≤ ${bornes.max}`}` : "";
  return (
    <span style={{ fontSize: 9, color: COULEURS[verdictLongueur(longueur, bornes)] }}>
      {longueur} car.{ideal}
    </span>
  );
}

function Champ({
  libelle, champ, valeur, gabarit, onChange, variables, lignes,
}: {
  libelle: string;
  champ: ChampSeo;
  valeur: string;
  gabarit?: string;
  onChange: (champ: ChampSeo, valeur: string) => void;
  variables: Record<string, string>;
  lignes?: number;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{libelle}</span>
        <Compteur valeur={valeur} variables={variables} champ={champ} />
      </div>
      <textarea
        value={valeur}
        onChange={(e) => onChange(champ, e.target.value)}
        rows={lignes ?? 2}
        placeholder={gabarit || "…"}
        spellCheck={false}
        style={{
          width: "100%", fontSize: 11.5, lineHeight: 1.4, padding: "6px 8px", resize: "vertical",
          border: "1px solid var(--cd-border, #e5e2da)", borderRadius: 4, background: "var(--bg, #fff)",
          color: "var(--text-1, #111)", fontFamily: "inherit",
        }}
      />
    </div>
  );
}

export function SeoPagesPanel({
  page, seoSite, variables, onChangePage, onChangeSite,
}: {
  /** La page ACTIVE de l'éditeur. Le panneau suit l'onglet, comme les tweaks. */
  page: SitemapPage | null;
  seoSite: SeoMeta;
  variables: Record<string, string>;
  onChangePage: (slug: string, patch: Partial<SitemapPage>) => void;
  onChangeSite: (patch: SeoMeta) => void;
}) {
  const [onglet, setOnglet] = React.useState<"page" | "site">("page");

  const majPage = (champ: ChampSeo, valeur: string) => {
    if (!page) return;
    onChangePage(page.slug, { [champ]: valeur || undefined } as Partial<SitemapPage>);
  };
  const majSite = (champ: ChampSeo, valeur: string) => onChangeSite({ [champ]: valeur || undefined });

  const valeurs: Partial<Record<ChampSeo, string>> = {
    metaTitle: page?.metaTitle ?? "",
    metaDescription: page?.metaDescription ?? "",
    ogTitle: page?.ogTitle ?? "",
    ogDescription: page?.ogDescription ?? "",
  };

  return (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {(["page", "site"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={"cd-btn" + (onglet === o ? " accent" : " outline")}
            style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
          >
            {o === "page" ? "Cette page" : "Défauts du site"}
          </button>
        ))}
      </div>

      {onglet === "page" ? (
        !page ? (
          <p style={{ fontSize: 11, color: "var(--text-3)" }}>Choisis une page dans la barre du haut.</p>
        ) : (
          <>
            <p style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.45, marginBottom: 8 }}>
              <b>{page.title || page.slug}</b> — un titre différent par page. Sans ça les huit pages
              sortent sous la même formule, ce qu&apos;un moteur lit comme huit pages
              interchangeables. Vide = on retombe sur les défauts du site.
            </p>
            <Champ libelle="Titre (meta title)" champ="metaTitle" valeur={valeurs.metaTitle ?? ""} gabarit={seoSite.metaTitle} onChange={majPage} variables={variables} />
            <Champ libelle="Description (meta description)" champ="metaDescription" valeur={valeurs.metaDescription ?? ""} gabarit={seoSite.metaDescription} onChange={majPage} variables={variables} lignes={3} />
            <div style={{ borderTop: "1px dashed var(--cd-border, #e5e2da)", margin: "10px 0 8px" }} />
            <Champ libelle="Titre social (og:title)" champ="ogTitle" valeur={valeurs.ogTitle ?? ""} gabarit={seoSite.ogTitle} onChange={majPage} variables={variables} />
            <Champ libelle="Description sociale (og:description)" champ="ogDescription" valeur={valeurs.ogDescription ?? ""} gabarit={seoSite.ogDescription} onChange={majPage} variables={variables} lignes={3} />
          </>
        )
      ) : (
        <>
          <p style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.45, marginBottom: 8 }}>
            Ce que servent les pages qui n&apos;ont rien de propre. Les variables comme{" "}
            <code style={{ fontSize: 10 }}>{`{{ entreprise.ville }}`}</code> sont remplacées à la publication.
          </p>
          <Champ libelle="Titre par défaut" champ="metaTitle" valeur={seoSite.metaTitle ?? ""} onChange={majSite} variables={variables} />
          <Champ libelle="Description par défaut" champ="metaDescription" valeur={seoSite.metaDescription ?? ""} onChange={majSite} variables={variables} lignes={3} />
          <Champ libelle="Titre social par défaut" champ="ogTitle" valeur={seoSite.ogTitle ?? ""} onChange={majSite} variables={variables} />
          <Champ libelle="Description sociale par défaut" champ="ogDescription" valeur={seoSite.ogDescription ?? ""} onChange={majSite} variables={variables} lignes={3} />
        </>
      )}

      <p style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.45, marginTop: 10 }}>
        Les métadonnées partent en ligne à la <b>republication</b> : elles sont figées dans
        l&apos;instantané, comme le reste du contenu.
      </p>
    </div>
  );
}
