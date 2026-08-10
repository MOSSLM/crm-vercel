import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/**
 * Widget d'embed façon Calendly — trois modes :
 *
 * 1) Inline (dans la page) :
 *    <div class="sama-rdv" data-url="https://app…/rdv/jean/appel-30min"></div>
 *    <script src="https://app…/api/public/scheduling/embed.js" async></script>
 *
 * 2) Bouton flottant (coin de l'écran, ouvre une popup) :
 *    <script src="…/embed.js" async
 *      data-button-url="https://app…/rdv/jean/appel-30min"
 *      data-button-text="Prendre rendez-vous"
 *      data-button-color="#2F7AE0"
 *      data-button-position="right"></script>
 *
 * 3) Popup au clic (sur n'importe quel élément) :
 *    <a href="#" data-sama-rdv-popup="https://app…/rdv/jean/appel-30min">Réserver</a>
 *    <script src="…/embed.js" async></script>
 *    (ou en JS : window.SamaRdv.popup(url))
 *
 * L'iframe inline s'auto-redimensionne via postMessage (`sama-rdv:height`).
 */
export async function GET(req: Request) {
  const appUrl = getAppUrl();
  const js = `(function () {
  var ORIGIN = ${JSON.stringify(appUrl)};
  var currentScript = document.currentScript;

  function withEmbedParam(url) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "embed=1";
  }

  /* ---------- Popup (modale + iframe) ---------- */
  var modal = null;
  function ensureModal() {
    if (modal) return modal;
    var overlay = document.createElement("div");
    overlay.setAttribute("data-sama-rdv-overlay", "1");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;" +
      "justify-content:center;background:rgba(18, 40, 68,.55);padding:16px;";
    var box = document.createElement("div");
    box.style.cssText =
      "position:relative;width:100%;max-width:520px;height:min(720px,92vh);" +
      "background:transparent;border-radius:16px;overflow:hidden;";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Fermer");
    close.innerHTML = "&#10005;";
    close.style.cssText =
      "position:absolute;top:8px;right:8px;z-index:2;width:32px;height:32px;" +
      "border:0;border-radius:999px;background:rgba(255,255,255,.92);color:#122844;" +
      "font-size:14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2);";
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:0;background:transparent;";
    iframe.setAttribute("title", "Prendre rendez-vous");
    box.appendChild(close);
    box.appendChild(iframe);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function hide() {
      overlay.style.display = "none";
      iframe.src = "about:blank";
      document.documentElement.style.overflow = "";
    }
    close.addEventListener("click", hide);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) hide();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.style.display !== "none") hide();
    });

    modal = {
      open: function (url) {
        iframe.src = withEmbedParam(url);
        overlay.style.display = "flex";
        document.documentElement.style.overflow = "hidden";
      },
      close: hide,
    };
    return modal;
  }
  function popup(url) {
    if (!url) return;
    ensureModal().open(url);
  }

  /* ---------- Inline ---------- */
  function mountInline(el) {
    if (el.getAttribute("data-sama-rdv-mounted")) return;
    el.setAttribute("data-sama-rdv-mounted", "1");
    var url = el.getAttribute("data-url") || "";
    if (!url) return;
    var iframe = document.createElement("iframe");
    iframe.src = withEmbedParam(url);
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

  /* ---------- Bouton flottant (config sur la balise script) ---------- */
  function mountFloatingButton() {
    if (!currentScript) return;
    var url = currentScript.getAttribute("data-button-url");
    if (!url) return;
    if (document.querySelector("[data-sama-rdv-fab]")) return;
    var text = currentScript.getAttribute("data-button-text") || "Prendre rendez-vous";
    var color = currentScript.getAttribute("data-button-color") || "#2F7AE0";
    var position = currentScript.getAttribute("data-button-position") === "left" ? "left" : "right";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-sama-rdv-fab", "1");
    btn.textContent = text;
    btn.style.cssText =
      "position:fixed;bottom:20px;" + position + ":20px;z-index:2147482000;" +
      "padding:12px 20px;border:0;border-radius:999px;background:" + color + ";" +
      "color:#fff;font:600 14px/1 Arial,Helvetica,sans-serif;cursor:pointer;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.25);";
    btn.addEventListener("click", function () {
      popup(url);
    });
    var mount = function () { document.body.appendChild(btn); };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }

  /* ---------- Popup au clic ([data-sama-rdv-popup]) ---------- */
  document.addEventListener("click", function (e) {
    var target = e.target && e.target.closest && e.target.closest("[data-sama-rdv-popup]");
    if (!target) return;
    e.preventDefault();
    popup(target.getAttribute("data-sama-rdv-popup"));
  });

  function scan() {
    var nodes = document.querySelectorAll(".sama-rdv:not([data-sama-rdv-mounted])");
    for (var i = 0; i < nodes.length; i++) mountInline(nodes[i]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
  mountFloatingButton();
  window.SamaRdv = { scan: scan, popup: popup };
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
