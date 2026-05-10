"use client";

import React from "react";
import { Loader2, Monitor, Tablet, Smartphone, RefreshCw, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FieldRenderer } from "@/components/site-builder/editors/FieldRenderer";
import type { SectionField } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";

type Device = "desktop" | "tablet" | "mobile";

interface Props {
  code: string;
  sectionId: string | null;
  schema?: Record<string, unknown> | null;
}

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const DEFAULT_EXAMPLE_DATA = {
  title: "Titre de la section",
  subtitle: "Sous-titre ou description de la section",
  cta: "Prendre rendez-vous",
  image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop",
  items: [
    { title: "Service 1", description: "Description du service 1" },
    { title: "Service 2", description: "Description du service 2" },
    { title: "Service 3", description: "Description du service 3" },
  ],
};

const DEFAULT_VARIABLES: Record<string, string> = {
  "entreprise.nom": "Acme Corp",
  "entreprise.telephone": "01 23 45 67 89",
  "entreprise.email": "contact@acme.fr",
  "entreprise.adresse": "12 rue de la Paix",
  "entreprise.ville": "Paris",
  "entreprise.code_postal": "75001",
  "entreprise.description": "Nous sommes une entreprise innovante spécialisée dans les solutions digitales.",
  "entreprise.annee_creation": "2015",
  "entreprise.note_moyenne": "4.8",
  "entreprise.nombre_avis": "127",
  "entreprise.logo_url": "https://via.placeholder.com/200x60?text=LOGO",
};

export default function SectionPreview({ code, sectionId, schema }: Props) {
  const [device, setDevice] = React.useState<Device>("desktop");
  const [compiling, setCompiling] = React.useState(false);
  const [srcDoc, setSrcDoc] = React.useState<string>("");
  const [iframeHeight, setIframeHeight] = React.useState(720);
  const [compileError, setCompileError] = React.useState<string | null>(null);
  const [exampleData, setExampleData] = React.useState<Record<string, unknown>>(DEFAULT_EXAMPLE_DATA);
  const [exampleDataStr, setExampleDataStr] = React.useState(
    JSON.stringify(DEFAULT_EXAMPLE_DATA, null, 2)
  );
  const [showDataEditor, setShowDataEditor] = React.useState(false);
  const [showDesignPanel, setShowDesignPanel] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Reset height when srcDoc changes so a fresh measurement always happens.
  React.useEffect(() => {
    setIframeHeight(720);
  }, [srcDoc]);

  // Listen for height reports from inside the iframe.
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { __siteBuilder?: string; height?: number };
      if (data?.__siteBuilder === "iframe-height" && typeof data.height === "number" && data.height > 0) {
        setIframeHeight(Math.ceil(data.height) + 2);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const schemaSettings = React.useMemo(() => {
    if (!schema) return null;
    const settings = (schema as { settings?: unknown }).settings;
    if (!Array.isArray(settings)) return null;
    return settings as SectionField[];
  }, [schema]);

  // Sync exampleDataStr → exampleData
  const handleDataStrChange = (val: string) => {
    setExampleDataStr(val);
    try {
      const parsed = JSON.parse(val);
      setExampleData(parsed);
    } catch {
      /* keep last valid */
    }
  };

  // Update one field in exampleData from the design panel
  const handleFieldChange = (id: string, value: unknown) => {
    setExampleData((prev) => {
      const next = { ...prev, [id]: value };
      setExampleDataStr(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const compile = React.useCallback(
    (sourceCode: string, data: Record<string, unknown>) => {
      if (!sourceCode.trim()) {
        setSrcDoc("");
        return;
      }
      setCompiling(true);
      setCompileError(null);
      try {
        const html = buildPreviewHTML(sourceCode, data, DEFAULT_VARIABLES);
        setSrcDoc(html);
      } catch (e: unknown) {
        setCompileError(e instanceof Error ? e.message : "Erreur de compilation");
      } finally {
        setCompiling(false);
      }
    },
    []
  );

  // Debounced recompile on code or data change
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      compile(code, exampleData);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, exampleData, compile]);

  if (!sectionId) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-zinc-900 text-zinc-600">
        <p className="text-sm">Prévisualisation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs text-zinc-500 flex-1">Preview</span>
        {compiling && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
        {schemaSettings && (
          <Button
            size="icon"
            variant="ghost"
            className={`h-6 w-6 ${showDesignPanel ? "text-blue-400" : "text-zinc-500"} hover:text-white`}
            onClick={() => { setShowDesignPanel((v) => !v); setShowDataEditor(false); }}
            title="Panneau design"
          >
            <Sliders className="h-3 w-3" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${showDataEditor ? "text-blue-400" : "text-zinc-500"} hover:text-white`}
          onClick={() => { setShowDataEditor((v) => !v); setShowDesignPanel(false); }}
          title="Éditer les données d'exemple (JSON)"
        >
          <span className="text-[10px] font-mono">{"{ }"}</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-500 hover:text-white"
          onClick={() => compile(code, exampleData)}
          title="Rafraîchir"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <div className="flex border border-zinc-700 rounded overflow-hidden">
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
            <button
              key={d}
              className={`p-1 ${device === d ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              onClick={() => setDevice(d)}
              title={d}
            >
              {d === "desktop" ? (
                <Monitor className="h-3 w-3" />
              ) : d === "tablet" ? (
                <Tablet className="h-3 w-3" />
              ) : (
                <Smartphone className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Design panel */}
      {showDesignPanel && schemaSettings && (
        <div className="border-b border-zinc-800 bg-zinc-950 flex-shrink-0 max-h-56 overflow-y-auto">
          <div className="px-2 pt-1 pb-0.5 text-[10px] text-zinc-500 uppercase tracking-wider sticky top-0 bg-zinc-950">
            Données — Design
          </div>
          <div className="px-2 pb-2 space-y-2">
            {schemaSettings.map((field, i) => (
              <FieldRenderer
                key={"id" in field ? (field as { id: string }).id : i}
                field={field}
                value={"id" in field ? exampleData[(field as { id: string }).id] : undefined}
                onChange={(val) => "id" in field && handleFieldChange((field as { id: string }).id, val)}
                styleGuide={DEFAULT_STYLE_GUIDE}
              />
            ))}
          </div>
        </div>
      )}

      {/* Data editor panel (JSON) */}
      {showDataEditor && (
        <div className="border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
          <div className="px-2 pt-1 pb-0.5 text-[10px] text-zinc-500 uppercase tracking-wider">
            Données d'exemple (JSON)
          </div>
          <Textarea
            value={exampleDataStr}
            onChange={(e) => handleDataStrChange(e.target.value)}
            className="font-mono text-xs bg-zinc-950 border-0 text-zinc-300 resize-none h-32 rounded-none focus-visible:ring-0"
            spellCheck={false}
          />
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 min-h-0 overflow-auto flex justify-center bg-zinc-800 p-3">
        {compileError ? (
          <div className="w-full bg-red-950/50 border border-red-800 rounded p-3 text-xs font-mono text-red-300 whitespace-pre-wrap">
            {compileError}
          </div>
        ) : (
          <div
            className="bg-white shadow-xl transition-all duration-300 h-fit"
            style={{
              width: DEVICE_WIDTHS[device],
              minWidth: device !== "desktop" ? DEVICE_WIDTHS[device] : undefined,
              maxWidth: "100%",
            }}
          >
            {srcDoc ? (
              <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                scrolling="no"
                className="w-full border-0 block"
                style={{ height: iframeHeight, overflow: "hidden" }}
                title={`Preview ${sectionId}`}
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Compilation…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildPreviewHTML(
  code: string,
  exampleData: Record<string, unknown>,
  variables: Record<string, string>
): string {
  // Extract export default name BEFORE stripping keywords
  const exportDefaultFnMatch = code.match(/export\s+default\s+function\s+([A-Z]\w*)/);
  const exportDefaultName = exportDefaultFnMatch ? exportDefaultFnMatch[1] : null;

  // Strip/replace imports and exports for iframe preview (Babel runs in non-module mode)
  const processedCode = code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")   // multi-brace imports
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, "")                   // side-effect imports
    .replace(/^['"]use client['"]\s*;?\s*$/gm, "")
    .replace(/^export\s+type\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "") // export type { ... }
    .replace(/^export\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "")        // export { ... }
    .replace(/^export\s+type\s+([\w]+)/gm, "type $1")                     // export type Foo → type Foo
    .replace(/export\s+default\s+function\s+/g, "function ")
    .replace(/export\s+default\s+class\s+/g, "class ")
    .replace(/\nexport\s+default\s+(\w+)\s*;/g, "\n// exported: $1")
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, "$1 ");     // export const → const

  // Detect the component to render: export default fn > export default id > first PascalCase
  const fnMatch =
    processedCode.match(/^function\s+([A-Z]\w*)/m) ||
    processedCode.match(/^const\s+([A-Z]\w*)\s*=/m);
  const componentName = fnMatch ? fnMatch[1] : null;
  const exportedMatch = processedCode.match(/\/\/ exported:\s+(\w+)/);
  const renderName = exportDefaultName || (exportedMatch ? exportedMatch[1] : componentName);

  const renderCall = renderName
    ? `try {
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(${renderName}, {
            tokens: {},
            data: window.__exampleData,
            variables: window.__variables
          })
        );
      } catch(err) {
        document.getElementById('root').innerHTML =
          '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' +
          err.message + '\\n' + (err.stack || '') + '</pre>';
      }`
    : `document.getElementById('root').innerHTML = '<p style="padding:16px;color:#e74c3c;">Impossible de détecter le composant à rendre.</p>';`;

  // JSON-encode so it's safely embedded in a plain <script> tag (no </script> escaping issues)
  const componentSrc = JSON.stringify(`${processedCode}\n${renderCall}`);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>html, body { margin: 0; height: auto; min-height: 0; } body { overflow-x: hidden; } * { box-sizing: border-box; }<\/style>
<\/head>
<body>
  <div id="root"><\/div>
  <script>
    window.__exampleData = ${JSON.stringify(exampleData)};
    window.__variables = ${JSON.stringify(variables)};
    window.__componentSrc = ${componentSrc};
  <\/script>
  <script>
    // Filter cross-origin CDN noise; real errors are caught below
    window.addEventListener('error', function(e) {
      if (!e.message || e.message === 'Script error.') return;
      var root = document.getElementById('root');
      if (root && !root.firstChild) {
        root.innerHTML = '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' + e.message + '<\/pre>';
      }
    });

    function runComponent() {
      try {
        var result = Babel.transform(window.__componentSrc, {
          presets: ['react', 'typescript'],
          filename: 'component.tsx'
        });
        // Inject as inline script — same opaque origin as the iframe, so errors show properly
        var s = document.createElement('script');
        s.textContent = result.code;
        document.head.appendChild(s);
      } catch(err) {
        document.getElementById('root').innerHTML =
          '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' +
          (err.message || String(err)) + '<\/pre>';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runComponent);
    } else {
      runComponent();
    }
  <\/script>
  <script>
    (function(){
      var last=0;
      function nat(){
        var s=document.createElement('style');
        s.textContent='.min-h-screen{min-height:0!important}.h-screen{height:auto!important}html,body{height:auto!important;min-height:0!important}';
        document.head.appendChild(s);
        var h=Math.max(
          document.body?document.body.scrollHeight:0,
          document.documentElement?document.documentElement.scrollHeight:0
        );
        document.head.removeChild(s);
        return h;
      }
      function rpt(){
        var h=nat();
        if(h>0&&Math.abs(h-last)>1){
          last=h;
          try{parent.postMessage({__siteBuilder:'iframe-height',height:h},'*')}catch(e){}
        }
      }
      function init(){
        [50,200,500,1200,2500,4000].forEach(function(d){setTimeout(rpt,d)});
        if(window.ResizeObserver){
          var ro=new ResizeObserver(function(){setTimeout(rpt,16)});
          var r=document.getElementById('root');
          if(r){ro.observe(r)}
          else if(document.body){
            var mo=new MutationObserver(function(){
              var r2=document.getElementById('root');
              if(r2){ro.observe(r2);mo.disconnect()}
            });
            mo.observe(document.body,{childList:true});
          }
        }
      }
      if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init)}else{init()}
    })();
  <\/script>
<\/body>
<\/html>`;
}
