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
//
// Une URL collée est aspirée elle aussi, via `/api/media/from-url`. Sans ça, la
// démo affichait une image servie par le site du prospect : elle disparaissait
// le jour où il le refaisait. Ce qu'on montre est servi par nous.

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
  /**
   * Tient dans une cellule de tableau : une seule ligne, vignette réduite, ni
   * libellé ni aide (la colonne les porte déjà). Le comportement ne change pas —
   * même dépôt, même import, même bascule URL. Un second composant « logo
   * compact » aurait dérivé du premier au premier correctif.
   */
  compact?: boolean;
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

/**
 * Aspire une URL distante dans la médiathèque et rend l'URL publique produite.
 * `null` si l'adresse ne donne pas une image — le message est déjà affiché.
 */
async function absorbUrl(url: string, entrepriseId?: number | null): Promise<string | null> {
  try {
    const res = await authedFetch("/api/media/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        entreprise_id: entrepriseId ?? null,
        image_type: entrepriseId != null ? "company" : "stock",
        tags: ["logo"],
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { public_url?: string; error?: string };
    if (!res.ok || !payload.public_url) {
      toast.error(payload.error || "Cette adresse ne donne pas d'image.");
      return null;
    }
    return payload.public_url;
  } catch {
    toast.error("Cette adresse ne donne pas d'image.");
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
  compact,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [showUrl, setShowUrl] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  // L'URL se saisit librement puis s'aspire à la validation : aspirer à chaque
  // frappe déclencherait un téléchargement par caractère tapé.
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setBroken(false), [value]);
  React.useEffect(() => setDraft(value), [value]);

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

  /**
   * Valide l'URL saisie : on l'aspire, et c'est l'adresse produite chez nous
   * qui est retenue. Une adresse qui ne donne pas d'image ne remplace rien.
   */
  const commitUrl = React.useCallback(async () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    if (!next) {
      onChange("");
      return;
    }
    if (!/^https?:\/\//i.test(next)) {
      toast.error("L'adresse doit commencer par http:// ou https://");
      return;
    }
    setBusy(true);
    try {
      const hosted = await absorbUrl(next, entrepriseId);
      if (hosted) {
        onChange(hosted);
        setShowUrl(false);
        toast.success("Logo importé.");
      } else {
        setDraft(value);
      }
    } finally {
      setBusy(false);
    }
  }, [draft, value, entrepriseId, onChange]);

  const thumb = compact ? "h-7 w-7" : "h-12 w-12";

  return (
    <div className="space-y-1" data-invalid={invalid ? "true" : undefined}>
      {!compact && (
        <Label className="text-xs" style={{ color: invalid ? "var(--danger)" : "var(--text-3)" }}>
          {label}
          {required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
        </Label>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={`Déposer ou choisir ${label.toLowerCase()}`}
        className={
          "flex items-center rounded-md border border-dashed text-left transition-colors " +
          (compact ? "gap-2 p-1 " : "gap-3 p-2 ") +
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
            className={`${thumb} shrink-0 rounded border bg-background object-contain`}
            onError={() => setBroken(true)}
          />
        ) : (
          <span
            className={`${thumb} flex shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground`}
          >
            {broken ? <ImageOff className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          </span>
        )}

        <span className="min-w-0 flex-1 text-xs">
          {busy ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {compact ? "Import…" : "Import en cours…"}
            </span>
          ) : value ? (
            <>
              <span className="block truncate font-medium">
                {broken ? "Image introuvable" : "Logo en place"}
              </span>
              {/* L'URL complète ne tient pas dans une cellule de tableau. */}
              {!compact && <span className="block truncate text-muted-foreground">{value}</span>}
            </>
          ) : compact ? (
            <span className="block truncate text-muted-foreground">Déposer ou choisir…</span>
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
        {hint && !compact ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:underline"
          title={compact ? (showUrl ? "Masquer l’URL" : "Coller une URL") : undefined}
          onClick={() => setShowUrl((v) => !v)}
        >
          <Link2 className="h-3 w-3" />
          {compact ? "URL" : showUrl ? "Masquer l’URL" : "Coller une URL"}
        </button>
      </div>

      {showUrl && (
        <Input
          value={draft}
          placeholder="https://…/logo.png"
          disabled={busy}
          className={compact ? "h-7 text-xs" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitUrl()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitUrl();
            } else if (e.key === "Escape") {
              setDraft(value);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
