"use client";

/**
 * « Recevoir les notifications sur cet appareil ».
 *
 * SUR CET APPAREIL, et le libellé le dit exprès : un abonnement push est lié au
 * navigateur, pas au compte. Activer sur le téléphone n'active pas sur le
 * portable, et l'inverse. Un intitulé qui laisserait croire à un réglage de
 * compte produirait la plainte classique — « je l'ai activé, je ne reçois
 * rien » — depuis l'autre machine.
 *
 * CHAQUE ÉTAT DIT QUOI FAIRE. Un bouton grisé sans explication est une impasse :
 * sur iPhone, la vraie réponse est « ajoutez d'abord l'app à l'écran d'accueil »,
 * et sur un refus c'est « rouvrez les réglages du site ». Ni l'un ni l'autre ne
 * se devine.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { abonner, desabonner, lireEtat, type EtatPush } from "@/lib/push/client";

/** Détecte un iOS hors app installée : le seul cas où « indisponible » a une suite. */
function estIOSNonInstalle(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installe =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installe;
}

export function BasculePush() {
  const [etat, setEtat] = useState<EtatPush | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let abandonne = false;
    void lireEtat().then((e) => {
      if (!abandonne) setEtat(e);
    });
    return () => {
      abandonne = true;
    };
  }, []);

  const basculer = useCallback(async () => {
    setOccupe(true);
    try {
      const suivant = etat === "actif" ? await desabonner() : await abonner();
      setEtat(suivant);
      if (suivant === "actif") toast.success("Notifications activées sur cet appareil");
      else if (suivant === "refuse") {
        toast.error("Notifications bloquées par le navigateur", {
          description: "À rouvrir dans les réglages du site — l'application ne peut plus le demander.",
        });
      } else if (suivant === "indisponible") {
        toast.error("Notifications indisponibles ici");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Abonnement impossible");
    } finally {
      setOccupe(false);
    }
  }, [etat]);

  // Tant qu'on ne sait pas, on n'affiche rien : une bascule qui change de
  // position une demi-seconde après l'ouverture se lit comme un bogue.
  if (etat === null) return null;

  if (etat === "indisponible") {
    if (!estIOSNonInstalle()) return null;
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Pour recevoir les notifications sur iPhone, ajoutez d&apos;abord Sama à l&apos;écran
          d&apos;accueil : bouton Partager, puis « Sur l&apos;écran d&apos;accueil ».
        </span>
      </p>
    );
  }

  if (etat === "refuse") {
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Les notifications sont bloquées pour ce site. Seuls les réglages du navigateur
          peuvent les rétablir.
        </span>
      </p>
    );
  }

  return (
    <Button
      variant={etat === "actif" ? "secondary" : "outline"}
      size="sm"
      className="w-full justify-start"
      onClick={basculer}
      disabled={occupe}
    >
      {occupe ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : etat === "actif" ? (
        <Bell className="mr-2 h-3.5 w-3.5" />
      ) : (
        <BellOff className="mr-2 h-3.5 w-3.5" />
      )}
      {etat === "actif"
        ? "Notifications actives sur cet appareil"
        : "Recevoir les notifications sur cet appareil"}
    </Button>
  );
}

export default BasculePush;
