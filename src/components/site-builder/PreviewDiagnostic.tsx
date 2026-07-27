import React from "react";
import type { DraftSiteProbe } from "@/lib/site-resolver";

/**
 * Failure page for a draft preview, rendered in place of a bare 404. Names the
 * cause and, from the probe, what to do about it — including direct links to
 * the pages that DO exist, since any path on this subdomain routes back into
 * the same design.
 *
 * Shown to whoever holds the preview URL: holding it already grants read
 * access to the whole design, so naming the cause leaks nothing new.
 */

/** Why the preview failed, as reported by the code that failed — never inferred. */
export type PreviewFailureKind =
  | "site-missing"
  | "query-failed"
  | "no-sections"
  | "page-missing";

interface Verdict {
  title: string;
  advice: React.ReactNode;
}

function verdictFor(
  probe: DraftSiteProbe | null,
  kind: PreviewFailureKind,
  reason: string,
): Verdict {
  // A failed query is always the headline: the rest of what we know about the
  // design was read by other queries and would otherwise blame the design for a
  // schema problem (the "no page matches" verdict a missing column used to get).
  if (kind === "query-failed" || (probe && probe.queryErrors.length > 0)) {
    return {
      title: "La base de données de cet environnement n'est pas à jour.",
      advice: (
        <>
          Une requête a échoué sur une colonne absente : une migration SQL du dossier{" "}
          <code>/sql</code> n&apos;a pas été appliquée sur cette base. Exécutez{" "}
          <code>sql/RATTRAPAGE_colonnes_sites.sql</code> dans l&apos;éditeur SQL Supabase
          (idempotent : <code>add column if not exists</code>), puis rechargez cette page.
          {probe?.projectRef && (
            <div style={{ marginTop: 10 }}>
              À exécuter dans le projet Supabase{" "}
              <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                {probe.projectRef}
              </strong>{" "}
              — celui que ce serveur interroge. Une erreur{" "}
              <code>relation &quot;public.sites&quot; does not exist</code> signifie que
              l&apos;éditeur SQL est ouvert sur un autre projet.
            </div>
          )}
        </>
      ),
    };
  }

  if (!probe) {
    return {
      title: reason,
      advice:
        "Le diagnostic complémentaire n'a pas pu interroger la base — la raison ci-dessus est la seule information disponible.",
    };
  }

  if (probe.legacyTemplateName) {
    return {
      title: `Cet identifiant est celui du template « ${probe.legacyTemplateName} » de l'ancienne galerie (/site-templates).`,
      advice:
        "Ces templates n'ont pas d'aperçu par sous-domaine : ils ne deviennent un site qu'après « Utiliser ». " +
        "Pour un aperçu partageable, ouvrez le design dans le Site Builder Claude Design et utilisez son bouton Aperçu — " +
        "l'URL générée portera l'identifiant du site, pas celui du template de galerie.",
    };
  }

  if (!probe.siteExists) {
    return {
      title: "Aucun design ne porte cet identifiant dans la base.",
      advice:
        "Le design a été supprimé, ou ce lien a été généré avant un échec de création. " +
        "Rouvrez la galerie des designs (/site-builder/claude), ouvrez le design voulu dans l'éditeur " +
        "et régénérez le lien avec son bouton Aperçu.",
    };
  }

  const name = probe.siteName ? `« ${probe.siteName} »` : "Ce design";

  if (probe.visibleSlugs.length === 0 && probe.hiddenSlugs.length === 0) {
    return {
      title: `${name} existe mais ne contient aucune section enregistrée.`,
      advice:
        "L'import ne s'est pas terminé : la fiche du design a été créée, pas ses pages. " +
        "Réimportez le design (ZIP), puis rouvrez cet aperçu.",
    };
  }

  if (probe.visibleSlugs.length === 0) {
    return {
      title: `${name} existe mais toutes ses pages sont masquées (${probe.hiddenSlugs.join(", ")}).`,
      advice: "Réaffichez au moins une page dans l'éditeur, puis rouvrez cet aperçu.",
    };
  }

  return {
    title: `${name} existe et a des pages affichables, mais aucune ne correspond à l'adresse demandée.`,
    advice: (
      <>
        Pages disponibles sur ce sous-domaine :
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {probe.visibleSlugs.map((slug) => (
            <li key={slug} style={{ margin: "2px 0" }}>
              <a href={slug} style={{ color: "#1d4ed8", textDecoration: "underline" }}>
                {slug}
              </a>
            </li>
          ))}
        </ul>
      </>
    ),
  };
}

export function PreviewDiagnostic({
  siteId,
  kind,
  reason,
  probe,
}: {
  siteId: string;
  kind: PreviewFailureKind;
  reason: string;
  probe: DraftSiteProbe | null;
}) {
  const verdict = verdictFor(probe, kind, reason);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "40px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#9ca3af" }}>
          APERÇU INDISPONIBLE
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: "8px 0 20px", lineHeight: 1.35 }}>
          {verdict.title}
        </h1>

        <div
          style={{
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            borderRadius: 10,
            padding: "14px 16px",
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "#374151",
          }}
        >
          {verdict.advice}
        </div>

        {probe && probe.queryErrors.length > 0 && (
          <div
            style={{
              marginTop: 14,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#991b1b",
            }}
          >
            Erreurs de requête (migration SQL probablement non appliquée sur cet environnement) :
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {probe.queryErrors.map((err) => (
                <li key={err} style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl style={{ margin: "20px 0 0", fontSize: 12.5, color: "#6b7280", lineHeight: 1.6 }}>
          <dt style={{ fontWeight: 600, color: "#374151" }}>Détail technique</dt>
          <dd style={{ margin: "0 0 10px" }}>{reason}</dd>
          <dt style={{ fontWeight: 600, color: "#374151" }}>Identifiant du design</dt>
          <dd style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {siteId}
          </dd>
        </dl>
      </div>
    </div>
  );
}
