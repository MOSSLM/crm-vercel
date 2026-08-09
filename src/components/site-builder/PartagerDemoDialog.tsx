"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";
import { demoShareUrl, isDraftShareUrl, type DemoLike } from "@/lib/site-builder/demo-share-url";

/**
 * Le dialogue « Partager » — et le déclencheur de toute la chaîne d'images.
 *
 * IL APPARTIENT AU MÊME LOT QUE LA CARTE OG, pour deux raisons qui n'ont rien de
 * cosmétique :
 *
 * 1. **Il fabrique la carte au bon moment.** La capture du démo prend plusieurs
 *    secondes ; la faire à la publication ferait tomber `deploy-batch` en
 *    timeout. Ici, l'opérateur regarde son écran, l'attente lui sert (elle lui
 *    montre ce que le prospect verra), et l'image est sur le CDN avant même
 *    qu'il ouvre WhatsApp.
 *
 * 2. **Il est la vérification.** Sans lui, personne ne voit jamais la vignette
 *    avant de l'envoyer — et un défaut de preview sociale ne se constate que
 *    dans une vraie conversation, c'est-à-dire trop tard.
 *
 * D'où le parti pris d'afficher **la vraie image OG**, pas une maquette qui lui
 * ressemble : une maquette fidèle mentirait précisément le jour où la
 * génération échoue.
 */

export interface PartagerDemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demo: DemoLike;
  companyName?: string | null;
  /** Téléphone du prospect : active le bouton WhatsApp quand il est présent. */
  phone?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
}

type CardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; warnings: string[] }
  | { status: "error"; message: string };

export function PartagerDemoDialog({
  open,
  onOpenChange,
  demo,
  companyName,
  phone,
  entrepriseId,
  opportuniteId,
}: PartagerDemoDialogProps) {
  const [card, setCard] = useState<CardState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const shareUrl = demoShareUrl(demo);
  const isDraft = isDraftShareUrl(demo);

  // Une seule préparation par ouverture : sans ce garde, le double montage du
  // mode strict de React lancerait deux captures pour rien.
  const preparedFor = useRef<string | null>(null);

  const prepare = useCallback(
    async (force: boolean) => {
      setCard({ status: "loading" });
      try {
        const res = await authedFetch(
          `/api/og/demo/${demo.id}/prepare${force ? "?force=1" : ""}`,
          { method: "POST" },
        );
        const body = (await res.json().catch(() => ({}))) as {
          url?: string;
          warnings?: string[];
          error?: string;
        };
        if (!res.ok || !body.url) throw new Error(body.error || `Erreur ${res.status}`);
        setCard({ status: "ready", url: body.url, warnings: body.warnings ?? [] });
      } catch (e) {
        setCard({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue" });
      }
    },
    [demo.id],
  );

  useEffect(() => {
    if (!open) {
      preparedFor.current = null;
      setCopied(false);
      return;
    }
    if (preparedFor.current === demo.id) return;
    preparedFor.current = demo.id;
    void prepare(false);
  }, [open, demo.id, prepare]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible — sélectionnez le lien à la main.");
    }
  };

  const openWhatsApp = async () => {
    const message = defaultMessage(companyName, shareUrl);
    const cleaned = (phone ?? "").replace(/[^0-9+]/g, "").replace("+", "");
    window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`, "_blank", "noopener");

    // Trace best-effort : l'échange doit apparaître dans l'historique du
    // contact, mais un journal en panne ne doit pas retenir l'envoi.
    void authedFetch("/api/messages/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "whatsapp",
        entreprise_id: entrepriseId ?? null,
        opportunite_id: opportuniteId ?? null,
        subject: "Envoi du site démo",
        body_text: message,
      }),
    }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Partager le site démo</DialogTitle>
          <DialogDescription>
            Voici exactement ce que verra le prospect quand il recevra le lien.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CardPreview state={card} onRetry={() => prepare(true)} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Lien à envoyer</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs"
              />
              <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
            {isDraft && (
              // Dire lequel des deux hôtes est partagé : c'est le lien d'aperçu
              // qui n'avait aucune preview sociale, et l'opérateur doit savoir
              // qu'il envoie un brouillon plutôt qu'un site déployé.
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Site non déployé — c&apos;est le lien d&apos;aperçu qui part. Il se déplie
                correctement, mais l&apos;adresse n&apos;est pas au nom de l&apos;entreprise.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={openWhatsApp} disabled={!phone}>
              Ouvrir WhatsApp
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                Ouvrir le site
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => prepare(true)}
              disabled={card.status === "loading"}
            >
              Régénérer la vignette
            </Button>
          </div>
          {!phone && (
            <p className="text-xs text-muted-foreground">
              Aucun numéro sur cette fiche — copiez le lien pour l&apos;envoyer autrement.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CardPreview({ state, onRetry }: { state: CardState; onRetry: () => void }) {
  // Rapport 1200×630 tenu quel que soit l'état, pour que le dialogue ne saute
  // pas au moment où l'image arrive.
  const frame =
    "relative w-full overflow-hidden rounded-lg border bg-muted/30 aspect-[1200/630]";

  if (state.status === "ready") {
    return (
      <div className="space-y-2">
        <div className={frame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.url} alt="Aperçu de la vignette de partage" className="h-full w-full object-cover" />
        </div>
        {state.warnings.length > 0 && (
          <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
            {state.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={`${frame} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
        <p className="text-sm text-muted-foreground">
          Vignette indisponible — {state.message}
        </p>
        <p className="text-xs text-muted-foreground">
          Le lien reste envoyable : WhatsApp affichera le titre et la description.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className={`${frame} flex items-center justify-center`}>
      <span className="animate-pulse text-sm text-muted-foreground">
        Fabrication de la vignette…
      </span>
    </div>
  );
}

/** Message par défaut. L'opérateur le retouche dans WhatsApp avant d'envoyer. */
function defaultMessage(companyName: string | null | undefined, url: string): string {
  const name = companyName?.trim();
  return (
    `Bonjour${name ? ` ${name}` : ""},\n\n` +
    `Nous avons construit un site de démonstration pour votre entreprise — ` +
    `il est déjà en ligne, vous pouvez le regarder ici :\n${url}\n\n` +
    `Aucune inscription, aucun engagement. Dites-moi ce que vous en pensez.`
  );
}
