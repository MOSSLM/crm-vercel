import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/**
 * Widget d'embed façon Calendly : un <script> + une div data-* suffisent pour
 * intégrer la page de réservation sur n'importe quel site.
 *
 *   <div class="sama-rdv" data-url="https://app…/rdv/jean/appel-30min"></div>
 *   <script src="https://app…/api/public/scheduling/embed.js" async></script>
 *
 * L'iframe s'auto-redimensionne via postMessage (message `sama-rdv:height`
 * émis par la page /rdv en mode embed).
 */
export async function GET(req: Request) {
  const appUrl = getAppUrl();
  const js = `(function () {
  var ORIGIN = ${JSON.stringify(appUrl)};
  function mount(el) {
    if (el.getAttribute("data-sama-rdv-mounted")) return;
    el.setAttribute("data-sama-rdv-mounted", "1");
    var url = el.getAttribute("data-url") || "";
    if (!url) return;
    var src = url + (url.indexOf("?") === -1 ? "?" : "&") + "embed=1";
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.minHeight = (el.getAttribute("data-min-height") || "680") + "px";
    iframe.style.borderRadius = "12px";
    iframe.style.background = "transparent";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("title", "Prendre rendez-vous");
    el.appendChild(iframe);
    window.addEventListener("message", function (event) {
      if (event.origin !== ORIGIN) return;
      var data = event.data || {};
      if (data.type === "sama-rdv:height" && event.source === iframe.contentWindow) {
        iframe.style.minHeight = Math.max(320, data.height | 0) + "px";
      }
    });
  }
  function scan() {
    var nodes = document.querySelectorAll(".sama-rdv:not([data-sama-rdv-mounted])");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
  window.SamaRdv = { scan: scan };
})();`;

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      ...corsHeadersFor(req, { allowAny: true }),
    },
  });
}
