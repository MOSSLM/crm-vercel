"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2, X, Copy, Check, Scan } from "lucide-react";

/**
 * Rend un graphe Mermaid en SVG, aux couleurs du CRM.
 *
 * Mermaid pèse plusieurs mégaoctets : il est importé dynamiquement, donc il
 * n'entre dans le bundle que des pages qui affichent un schéma. La palette est
 * lue sur les variables CSS du thème actif, si bien qu'un basculement clair /
 * sombre re-dessine les schémas au lieu de les laisser illisibles.
 */

let mermaidModule: typeof import("mermaid").default | null = null;
let renderCounter = 0;

async function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  return mermaidModule;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** La palette Mermaid, dérivée des jetons de thème du CRM. */
function themeVariables() {
  const foreground = cssVar("--foreground", "#122844");
  const muted = cssVar("--muted", "#F1F2F4");
  const mutedForeground = cssVar("--muted-foreground", "#5F7396");
  const card = cssVar("--card", cssVar("--background", "#FFFFFF"));
  const border = cssVar("--border-strong", "rgba(18, 40, 68, 0.22)");
  const primary = cssVar("--primary", "#2F7AE0");

  return {
    background: "transparent",
    primaryColor: card,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: muted,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: muted,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    lineColor: mutedForeground,
    textColor: foreground,
    mainBkg: card,
    nodeBorder: border,
    clusterBkg: muted,
    clusterBorder: border,
    edgeLabelBackground: cssVar("--background", "#F8F8F9"),
    nodeTextColor: foreground,
    titleColor: foreground,
    fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: "14px",
    /* Les losanges de décision reprennent la couleur d'accent du CRM. */
    labelBackground: cssVar("--background", "#F8F8F9"),
    primaryBorderColorHover: primary,
  };
}

type Props = {
  /** Le source Mermaid, tel qu'il est stocké dans src/lib/architecture. */
  source: string;
  /** Utilisé pour nommer le SVG et pour le message d'erreur. */
  title: string;
};

export function MermaidDiagram({ source, title }: Props) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const render = useCallback(async () => {
    const mermaid = await loadMermaid();
    const renderId = `mermaid-${reactId}-${renderCounter++}`;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: themeVariables(),
      flowchart: {
        htmlLabels: true,
        useMaxWidth: false,
        curve: "basis",
        nodeSpacing: 42,
        rankSpacing: 58,
        padding: 14,
      },
    });

    try {
      const { svg: out } = await mermaid.render(renderId, source);
      // La taille naturelle vit dans le viewBox : elle sert à dimensionner le
      // conteneur (un `transform: scale` ne change pas la place occupée) et à
      // calculer l'ajustement à la largeur.
      const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(out);
      setNatural(box ? { w: parseFloat(box[1]), h: parseFloat(box[2]) } : null);
      setSvg(out);
      setError(null);
    } catch (e) {
      // Mermaid laisse parfois un noeud de mesure orphelin dans le DOM
      // quand le parsing échoue — on le retire pour ne pas polluer la page.
      document.getElementById(renderId)?.remove();
      document.getElementById(`d${renderId}`)?.remove();
      setSvg(null);
      setNatural(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [source, reactId]);

  /**
   * Ajuste à la largeur disponible. Certains schémas font 3 400 px de large :
   * les afficher à 100 % n'offre qu'un fragment et une barre de défilement.
   * On ne grossit jamais au-delà de 100 % — un petit schéma reste petit.
   */
  const fitToWidth = useCallback(() => {
    const frame = hostRef.current?.parentElement;
    if (!frame || !natural?.w) return;
    /* On mesure le cadre, pas la zone de défilement : mesurer cette dernière
       ferait osciller le zoom au rythme de l'apparition de sa propre barre. */
    const available = frame.clientWidth - 32 /* padding */ - 14 /* barre */;
    if (available <= 0) return;
    setZoom(Math.min(1, Math.round((available / natural.w) * 100) / 100));
  }, [natural]);

  // Au premier rendu et à chaque redimensionnement, on recadre.
  useLayoutEffect(() => {
    if (!natural) return;
    fitToWidth();
    const frame = hostRef.current?.parentElement;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitToWidth());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [natural, fitToWidth]);

  useEffect(() => {
    let cancelled = false;
    void render().then(() => {
      if (cancelled) return;
    });

    // Le thème se change en ajoutant/retirant `.dark` sur <html> : on redessine.
    const observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme-preset"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [render]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* presse-papiers indisponible : on ne casse pas la page pour autant */
    }
  };

  const canvas = (
    <div
      ref={hostRef}
      className="mermaid-canvas overflow-auto p-4"
      style={{ maxHeight: fullscreen ? "calc(100vh - 7rem)" : "70vh" }}
    >
      {error ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            Le schéma « {title} » n&apos;a pas pu être dessiné.
          </p>
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {error}
          </pre>
          <pre className="overflow-auto rounded-md border border-border bg-card p-3 text-xs">
            {source}
          </pre>
        </div>
      ) : svg ? (
        /* `scale` ne réserve pas de place : le conteneur porte donc lui-même
           les dimensions mises à l'échelle, sinon le défilement est faux. */
        <div
          className="overflow-hidden"
          style={
            natural
              ? { width: natural.w * zoom, height: natural.h * zoom }
              : undefined
          }
        >
          <div
            className="origin-top-left"
            style={{ transform: `scale(${zoom})`, width: natural?.w, height: natural?.h }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Dessin du schéma…
        </div>
      )}
    </div>
  );

  const controls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dézoomer"
        title="Dézoomer"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-11 text-center font-mono text-xs tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.15) * 100) / 100))}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Zoomer"
        title="Zoomer"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={fitToWidth}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Ajuster à la largeur"
        title="Ajuster à la largeur"
      >
        <Scan className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onClick={copySource}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Copier le source Mermaid"
        title="Copier le source Mermaid"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => setFullscreen((f) => !f)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
        title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
      >
        {fullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );

  if (fullscreen) {
    return (
      <>
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          « {title} » est affiché en plein écran.
        </div>
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{title}</h2>
            {controls}
          </div>
          <div className="flex-1 overflow-hidden">{canvas}</div>
        </div>
      </>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
        {controls}
      </div>
      {canvas}
    </div>
  );
}
