"use client";

/**
 * Générateur d'embed façon Calendly — trois types au choix :
 *   Inline (dans la page), Bouton flottant (popup), Popup au clic.
 * Génère le snippet prêt à coller, avec options (cible, texte, couleur,
 * position) et aperçu de la page réservée.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppWindow, Copy, ExternalLink, MousePointerClick, PanelBottom } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventType } from "@/lib/scheduling/types";
import { getAppUrlClient } from "./shared";

type EmbedKind = "inline" | "floating" | "popup";

const KINDS: { id: EmbedKind; label: string; description: string; icon: typeof AppWindow }[] = [
  {
    id: "inline",
    label: "Inline",
    description: "Le calendrier s'affiche directement dans la page.",
    icon: AppWindow,
  },
  {
    id: "floating",
    label: "Bouton flottant",
    description: "Un bouton fixe en bas de l'écran ouvre la réservation en popup.",
    icon: PanelBottom,
  },
  {
    id: "popup",
    label: "Popup au clic",
    description: "N'importe quel bouton ou lien de votre site ouvre la popup.",
    icon: MousePointerClick,
  },
];

export default function EmbedGenerator({
  publicUrl,
  eventTypes,
  brandColor,
}: {
  publicUrl: string;
  eventTypes: EventType[];
  brandColor: string;
}) {
  const activeTypes = eventTypes.filter((et) => et.is_active);
  const [kind, setKind] = useState<EmbedKind>("inline");
  const [targetSlug, setTargetSlug] = useState<string>(activeTypes[0]?.slug ?? "");
  const [buttonText, setButtonText] = useState("Prendre rendez-vous");
  const [buttonColor, setButtonColor] = useState(brandColor || "#E2552B");
  const [position, setPosition] = useState<"right" | "left">("right");

  const embedJsUrl = `${getAppUrlClient()}/api/public/scheduling/embed.js`;
  const targetUrl = targetSlug ? `${publicUrl}/${targetSlug}` : publicUrl;

  const snippet = useMemo(() => {
    switch (kind) {
      case "floating":
        return (
          `<script src="${embedJsUrl}" async\n` +
          `  data-button-url="${targetUrl}"\n` +
          `  data-button-text="${buttonText.replace(/"/g, "&quot;")}"\n` +
          `  data-button-color="${buttonColor}"\n` +
          `  data-button-position="${position}"></script>`
        );
      case "popup":
        return (
          `<button type="button" data-sama-rdv-popup="${targetUrl}">` +
          `${buttonText}</button>\n` +
          `<script src="${embedJsUrl}" async></script>`
        );
      case "inline":
      default:
        return (
          `<div class="sama-rdv" data-url="${targetUrl}"></div>\n` +
          `<script src="${embedJsUrl}" async></script>`
        );
    }
  }, [kind, targetUrl, embedJsUrl, buttonText, buttonColor, position]);

  return (
    <div className="space-y-4">
      {/* Cible */}
      <div>
        <Label>Quoi intégrer ?</Label>
        <select
          value={targetSlug}
          onChange={(e) => setTargetSlug(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">Ma page complète (tous les types)</option>
          {activeTypes.map((et) => (
            <option key={et.id} value={et.slug}>
              {et.title} ({et.duration_minutes} min)
            </option>
          ))}
        </select>
      </div>

      {/* Type d'embed */}
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={
              "rounded-xl border p-3 text-left transition " +
              (kind === k.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-muted/60")
            }
          >
            <k.icon
              className={"h-5 w-5 " + (kind === k.id ? "text-primary" : "text-muted-foreground")}
            />
            <p className="mt-1.5 text-sm font-medium">{k.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{k.description}</p>
          </button>
        ))}
      </div>

      {/* Options selon le type */}
      {kind !== "inline" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="embed-text">Texte du bouton</Label>
            <Input
              id="embed-text"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
            />
          </div>
          {kind === "floating" ? (
            <>
              <div>
                <Label htmlFor="embed-color">Couleur</Label>
                <input
                  id="embed-color"
                  type="color"
                  className="mt-0.5 h-9 w-full cursor-pointer rounded border bg-transparent"
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                />
              </div>
              <div>
                <Label>Position</Label>
                <div className="mt-1 flex gap-1 rounded-lg border p-0.5">
                  {(["left", "right"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosition(p)}
                      className={
                        "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition " +
                        (position === p
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {p === "left" ? "En bas à gauche" : "En bas à droite"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Snippet */}
      <div>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
          {snippet}
        </pre>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(snippet);
              toast.success("Snippet d'intégration copié");
            }}
          >
            <Copy className="mr-1 h-4 w-4" /> Copier le snippet
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={targetUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Aperçu de la page intégrée
            </a>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {kind === "popup"
            ? "L'attribut data-sama-rdv-popup fonctionne sur n'importe quel élément (bouton, lien, image…)."
            : kind === "floating"
              ? "Le bouton apparaît sur toutes les pages où le script est présent."
              : "L'iframe s'adapte automatiquement à la hauteur du contenu."}{" "}
          Préremplissage possible en ajoutant <code className="rounded bg-muted px-1">?name=&amp;email=</code> à
          l&apos;URL.
        </p>
      </div>
    </div>
  );
}
