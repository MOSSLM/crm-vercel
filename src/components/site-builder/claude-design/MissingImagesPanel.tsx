"use client";

import React from "react";
import { toast } from "sonner";
import { ImageOff, Download, ChevronDown } from "lucide-react";
import {
  collectDesignPlaceholders,
  countPlaceholders,
  toCsv,
  toJson,
  toText,
  type DesignExportPage,
} from "@/lib/site-builder/claude-design/collect-image-placeholders";

type Format = "txt" | "csv" | "json";

const FORMATS: { id: Format; label: string; ext: string; mime: string }[] = [
  { id: "txt", label: "Texte (.txt)", ext: "txt", mime: "text/plain" },
  { id: "csv", label: "Tableur (.csv)", ext: "csv", mime: "text/csv" },
  { id: "json", label: "JSON (.json)", ext: "json", mime: "application/json" },
];

function slugifyName(name: string): string {
  return (name || "design").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "design";
}

function download(content: string, mime: string, filename: string) {
  // Prepend a BOM so Excel opens the UTF-8 accents correctly.
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Right-inspector card that lists how many `.ph` image slots across the whole
 * design still need a real photo, and exports their descriptions (TXT / CSV /
 * JSON) so they can be pasted into an image generator.
 */
export function MissingImagesPanel({ designName, pages }: { designName: string; pages: DesignExportPage[] }) {
  const [open, setOpen] = React.useState(false);

  const grouped = React.useMemo(() => collectDesignPlaceholders(pages), [pages]);
  const total = React.useMemo(() => countPlaceholders(grouped), [grouped]);

  const handleExport = (fmt: Format) => {
    setOpen(false);
    if (total === 0) {
      toast.info("Aucune zone image à compléter dans ce design.");
      return;
    }
    const meta = FORMATS.find((f) => f.id === fmt)!;
    const content = fmt === "csv" ? toCsv(grouped) : fmt === "json" ? toJson(designName, grouped) : toText(designName, grouped);
    download(content, meta.mime, `images-a-creer-${slugifyName(designName)}.${meta.ext}`);
    toast.success(`${total} description(s) exportée(s)`);
  };

  return (
    <div className="cd-missimg">
      <div className="cd-missimg-hd">
        <span className="cd-missimg-ic"><ImageOff className="ico-sm" /></span>
        <div className="cd-grow">
          <b>Images à créer</b>
          <span>{total === 0 ? "Toutes les zones image sont remplies" : `${total} zone(s) image sans photo`}</span>
        </div>
        {total > 0 ? <span className="cd-missimg-count">{total}</span> : null}
      </div>

      <div className="cd-missimg-pick">
        <button className="cd-btn outline" disabled={total === 0} onClick={() => setOpen((o) => !o)}>
          <Download className="ico-sm" />Exporter les descriptions<ChevronDown className="ico-xs" style={{ marginLeft: "auto" }} />
        </button>
        {open ? (
          <>
            <div className="cd-pop-backdrop" onClick={() => setOpen(false)} />
            <div className="cd-pop cd-missimg-pop">
              <div className="cd-pop-hd">Format d’export</div>
              {FORMATS.map((f) => (
                <button key={f.id} className="cd-company-row" onClick={() => handleExport(f.id)}>
                  <Download className="ico-xs" />
                  <div className="cd-grow"><b>{f.label}</b></div>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {total > 0 ? (
        <p className="cd-missimg-hint">
          Chaque zone exporte sa description (le texte « Photo — … »). Colle-la dans un générateur d’images, puis reviens
          cliquer la zone pour poser l’image.
        </p>
      ) : null}
    </div>
  );
}

export default MissingImagesPanel;
