import React from "react";
import Script from "next/script";

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
 */
export function PublicAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

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
