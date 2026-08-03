"use client";
// LogoField — le logo se dépose, il ne se colle plus.
//
// Avant, le logo n'existait que sous forme d'URL : il fallait l'héberger
// ailleurs, puis recopier l'adresse. Or dans 90 % des cas le logo est un fichier
// posé sur le bureau. Ce champ accepte donc les deux : glisser-déposer (ou
// Finder) pour importer le fichier dans la médiathèque du CRM, et un champ URL
// replié pour les cas où l'adresse est déjà connue.
//
// L'import passe par `/api/media` : mêmes optimisations (WebP, redimensionnement)
// et même stockage que la médiathèque, donc rien de spécifique à maintenir ici.

import React from "react";
import { toast } from "sonner";
import { ImageOff, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 15 * 1024 * 1024;

export interface LogoFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Rattache l'image à l'entreprise dans la médiathèque, quand on la connaît. */
  entrepriseId?: number | null;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
}

/**
 * Envoie le fichier à la médiathèque et rend l'URL publique produite.
 * `null` en cas d'échec — le message d'erreur est déjà affiché.
 */
async function uploadLogo(file: File, entrepriseId?: number | null): Promise<string | null> {
  if (file.size > MAX_BYTES) {
    toast.error("Fichier trop lourd (15 Mo maximum).");
    return null;
  }
  if (file.type && !file.type.startsWith("image/")) {
    toast.error("Ce fichier n'est pas une image.");
    return null;
  }

  const body = new FormData();
  body.append("files", file);
  // `company` range l'image dans la bibliothèque de l'entreprise ; sans
  // entreprise connue, l'API exige un autre type.
  body.append("image_type", entrepriseId != null ? "company" : "stock");
  if (entrepriseId != null) body.append("entreprise_id", String(entrepriseId));
  body.append("tags", "logo");

  try {
    const res = await authedFetch("/api/media", { method: "POST", body });
    const payload = (await res.json().catch(() => ({}))) as {
      inserted?: { public_url?: string }[];
      failures?: { error?: string }[];
      error?: string;
    };
    const url = payload.inserted?.[0]?.public_url;
    if (!res.ok || !url) {
      toast.error(payload.failures?.[0]?.error || payload.error || "Import impossible.");
      return null;
    }
    return url;
  } catch {
    toast.error("Import impossible.");
    return null;
  }
}

export const LogoField: React.FC<LogoFieldProps> = ({
  label,
  value,
  onChange,
  entrepriseId,
  required,
  invalid,
  hint,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [showUrl, setShowUrl] = React.useState(false);
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => setBroken(false), [value]);

  const take = React.useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setBusy(true);
      try {
        const url = await uploadLogo(file, entrepriseId);
        if (url) {
          onChange(url);
          toast.success("Logo importé.");
        }
      } finally {
        setBusy(false);
      }
    },
    [entrepriseId, onChange],
  );

  return (
    <div className="space-y-1" data-invalid={invalid ? "true" : undefined}>
      <Label className="text-xs" style={{ color: invalid ? "var(--danger)" : "var(--text-3)" }}>
        {label}
        {required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
      </Label>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Déposer ou choisir ${label.toLowerCase()}`}
        className={
          "flex items-center gap-3 rounded-md border border-dashed p-2 text-left transition-colors " +
          (dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50")
        }
        style={invalid ? { borderColor: "var(--danger)" } : undefined}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer.files?.[0]);
        }}
      >
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={label}
            className="h-12 w-12 shrink-0 rounded border bg-background object-contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
            {broken ? <ImageOff className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          </span>
        )}

        <span className="min-w-0 flex-1 text-xs">
          {busy ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Import en cours…
            </span>
          ) : value ? (
            <>
              <span className="block truncate font-medium">
                {broken ? "Image introuvable" : "Logo en place"}
              </span>
              <span className="block truncate text-muted-foreground">{value}</span>
            </>
          ) : (
            <>
              <span className="block font-medium">Glisse le logo ici</span>
              <span className="block text-muted-foreground">ou clique pour l&apos;ouvrir depuis ton Mac</span>
            </>
          )}
        </span>

        {value && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            title="Retirer le logo"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          void take(file);
        }}
      />

      <div className="flex items-center justify-between gap-2">
        {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : <span />}
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:underline"
          onClick={() => setShowUrl((v) => !v)}
        >
          <Link2 className="h-3 w-3" />
          {showUrl ? "Masquer l’URL" : "Coller une URL"}
        </button>
      </div>

      {showUrl && (
        <Input
          value={value}
          placeholder="https://…/logo.png"
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
