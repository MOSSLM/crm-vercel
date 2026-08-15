"use client";

import React from "react";
import Script from "next/script";
import {
  chaineCookie,
  decisionDeLUrl,
  decisionDuCookie,
  estCapture,
} from "@/lib/analytics/trafic-interne";

/**
 * Google Analytics (GA4) + Microsoft Clarity for everything served under the
 * `(public)` route group: published sites (`/site/**`), draft previews
 * (`/preview/**`) and audit reports (`/rapport/**`) — i.e. every page a
 * prospect can be sent a link to. This is what turns "on a envoyé la démo"
 * into "le prospect l'a ouverte" : GA4's automatic pageview already carries
 * the hostname (`{label}.{SITE_DOMAIN}` or `{uuid}.{SITE_DOMAIN}`), so each
 * demo's opens show up on its own, without a bespoke event per site.
 *
 * Both are opt-in via env var and silently absent otherwise — no keys, no
 * scripts, same pattern as PAGESPEED_API_KEY. Never added to the CRM's own
 * layout: that's internal tooling, not a page we send prospects a link to.
 *
 * ── Le trafic maison ne passe pas d'ici ──────────────────────────────────
 *
 * C'est le SEUL point de mesure du parc, donc le seul endroit où l'exclusion
 * du trafic interne a besoin d'exister : ce qui n'est pas émis ici n'apparaît
 * ni dans GA4, ni dans l'export BigQuery qui en découle, ni dans Clarity, ni
 * donc dans le radar et les scores d'intention. Un filtre posé plus loin
 * aurait dû être recopié dans chaque lecture, et aurait laissé les visites
 * dans les outils tiers. Voir src/lib/analytics/trafic-interne.ts pour le
 * détail des deux marqueurs (paramètre d'URL, puis cookie de deux ans).
 *
 * Le composant est CLIENT depuis cette exclusion, et il fallait qu'il le soit :
 * lire le cookie côté serveur rendrait dynamique le rendu de chaque page de
 * chaque site publié, alors qu'elles sont statiques et servies depuis le cache.
 * Le prix est d'un tick — les deux tags sont `afterInteractive`, donc ils
 * partaient déjà après l'hydratation.
 */
export function PublicAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

  // `null` = pas encore tranché (rendu serveur et première passe client). On
  // n'émet RIEN tant qu'on ne sait pas : se tromper dans ce sens coûte une
  // visite non comptée, se tromper dans l'autre coûte un faux lead chaud.
  const [interne, setInterne] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const { search, hostname, protocol } = window.location;
    const choix = decisionDeLUrl(search);
    if (choix === null) {
      setInterne(decisionDuCookie(document.cookie));
      return;
    }
    // Une capture de vignette n'est pas quelqu'un : elle ne mesure pas, mais
    // elle ne laisse pas non plus de trace dans le navigateur du poste.
    if (!estCapture(search)) {
      document.cookie = chaineCookie(choix, hostname, { secure: protocol === "https:" });
    }
    setInterne(choix);
  }, []);

  if (interne !== false) return null;

  return (
    <>
      {gaId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
          </Script>
        </>
      )}
      {clarityId && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarityId}");`}
        </Script>
      )}
    </>
  );
}
