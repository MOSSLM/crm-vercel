"use client";

import React from "react";
import { toast } from "sonner";
import { ArrowLeft, Headset, Loader2 } from "lucide-react";
import type { Company, Form } from "@/types";
import { authedFetch } from "@/utils/authedFetch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { choisirFormulaire, formulairesEligibles } from "@/lib/rdv/formulaire";
import type { CompteRendu, ContexteEntreprise } from "@/lib/rdv/types";
import { SelecteurEntreprise, noterRecente } from "./SelecteurEntreprise";
import { ContexteEntrepriseVue } from "./ContexteEntrepriseVue";
import { FormulaireCompteRendu } from "./FormulaireCompteRendu";

/** Ouvre le cockpit depuis n'importe où (fiche entreprise, page Mes RDV…). */
export const COCKPIT_RDV_EVENT = "cockpit-rdv:ouvrir";

export interface OuvertureCockpit {
  entrepriseId?: number;
  compteRenduId?: string;
  bookingId?: string;
}

export function ouvrirCockpitRdv(detail: OuvertureCockpit = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COCKPIT_RDV_EVENT, { detail }));
}

type Onglet = "contexte" | "formulaire";

export function CockpitRdv({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [entrepriseId, setEntrepriseId] = React.useState<number | null>(null);
  const [contexte, setContexte] = React.useState<ContexteEntreprise | null>(null);
  const [formulaires, setFormulaires] = React.useState<Form[]>([]);
  const [compteRendu, setCompteRendu] = React.useState<CompteRendu | null>(null);
  const [onglet, setOnglet] = React.useState<Onglet>("contexte");
  const [chargement, setChargement] = React.useState(false);
  const [ouvertureDemandee, setOuvertureDemandee] = React.useState<OuvertureCockpit>({});

  // Les grilles disponibles ne dépendent pas de l'entreprise : une seule fois,
  // à la première ouverture, et gardées ensuite.
  React.useEffect(() => {
    if (!open || formulaires.length > 0) return;
    let annule = false;
    void (async () => {
      try {
        const res = await authedFetch("/api/forms");
        if (!res.ok) return;
        const toutes = (await res.json()) as Form[];
        if (!annule) setFormulaires(formulairesEligibles(toutes));
      } catch {
        // Sans grille, le cockpit reste utile : contexte, historique, liens.
      }
    })();
    return () => {
      annule = true;
    };
  }, [open, formulaires.length]);

  // Ouverture ciblée sur une entreprise (depuis sa fiche, depuis Mes RDV).
  React.useEffect(() => {
    const onOuvrir = (e: Event) => {
      const detail = (e as CustomEvent<OuvertureCockpit>).detail ?? {};
      setOuvertureDemandee(detail);
      if (detail.entrepriseId) {
        setEntrepriseId(detail.entrepriseId);
        noterRecente(detail.entrepriseId);
      }
      onOpenChange(true);
    };
    window.addEventListener(COCKPIT_RDV_EVENT, onOuvrir);
    return () => window.removeEventListener(COCKPIT_RDV_EVENT, onOuvrir);
  }, [onOpenChange]);

  const chargerContexte = React.useCallback(async (id: number) => {
    setChargement(true);
    try {
      const res = await authedFetch(`/api/rdv/contexte?entreprise_id=${id}`);
      if (!res.ok) throw new Error(await res.text());
      setContexte((await res.json()) as ContexteEntreprise);
    } catch {
      toast.error("Impossible de charger le contexte de cette entreprise");
      setContexte(null);
    } finally {
      setChargement(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open || entrepriseId == null) return;
    void chargerContexte(entrepriseId);
  }, [open, entrepriseId, chargerContexte]);

  // Une ouverture qui vise un compte rendu précis bascule directement dessus,
  // sans passer par l'onglet contexte.
  React.useEffect(() => {
    if (!contexte || !ouvertureDemandee.compteRenduId) return;
    const vise = contexte.comptesRendus.find((cr) => cr.id === ouvertureDemandee.compteRenduId);
    if (vise) {
      setCompteRendu(vise);
      setOnglet("formulaire");
    }
    setOuvertureDemandee((d) => ({ ...d, compteRenduId: undefined }));
  }, [contexte, ouvertureDemandee.compteRenduId]);

  // Seul l'identifiant compte ici : le cockpit recharge le contexte complet de
  // l'entreprise juste après. Le sélecteur renvoie donc la projection réduite de
  // la recherche serveur, pas une `Company` entière.
  const choisirEntreprise = (entreprise: { id: number }) => {
    setEntrepriseId(entreprise.id);
    setCompteRendu(null);
    setOnglet("contexte");
  };

  const revenirAuChoix = () => {
    setEntrepriseId(null);
    setContexte(null);
    setCompteRendu(null);
    setOnglet("contexte");
  };

  /**
   * Ouvre le formulaire. On reprend le brouillon en cours plutôt que d'en créer
   * un second : un appel interrompu et repris cinq minutes plus tard, c'est le
   * même échange, pas deux.
   */
  const ouvrirFormulaire = async () => {
    if (!contexte) return;
    setOnglet("formulaire");
    if (compteRendu) return;

    const brouillon = contexte.comptesRendus.find((cr) => cr.statut === "brouillon");
    if (brouillon) {
      setCompteRendu(brouillon);
      return;
    }

    const grille = choisirFormulaire(formulaires, { entrepriseId: contexte.entreprise.id });
    try {
      const res = await authedFetch("/api/rdv/comptes-rendus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise_id: contexte.entreprise.id,
          form_id: grille?.id ?? null,
          booking_id: ouvertureDemandee.bookingId ?? null,
          opportunite_id: contexte.opportunites[0]?.id ?? null,
          canal: ouvertureDemandee.bookingId ? "rdv" : "appel",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCompteRendu((await res.json()) as CompteRendu);
    } catch {
      toast.error("Impossible d'ouvrir le compte rendu");
      setOnglet("contexte");
    }
  };

  const ouvrirCompteRenduExistant = (id: string) => {
    const vise = contexte?.comptesRendus.find((cr) => cr.id === id);
    if (!vise) return;
    setCompteRendu(vise);
    setOnglet("formulaire");
  };

  // Une modification du compte rendu doit se voir dans l'historique sans
  // recharger tout le contexte : on remplace la ligne en place.
  const majCompteRendu = React.useCallback((frais: CompteRendu) => {
    setCompteRendu(frais);
    setContexte((prec) => {
      if (!prec) return prec;
      const connu = prec.comptesRendus.some((cr) => cr.id === frais.id);
      return {
        ...prec,
        comptesRendus: connu
          ? prec.comptesRendus.map((cr) => (cr.id === frais.id ? frais : cr))
          : [frais, ...prec.comptesRendus],
      };
    });
  }, []);

  const titre = contexte?.entreprise.name ?? "Cockpit RDV";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            {entrepriseId != null && (
              <button
                type="button"
                onClick={revenirAuChoix}
                aria-label="Changer d'entreprise"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{titre}</SheetTitle>
              <SheetDescription className="truncate text-xs">
                {contexte
                  ? [contexte.entreprise.ville, contexte.entreprise.premiers_tags]
                      .filter(Boolean)
                      .join(" · ") || "Prospect"
                  : "Choisis l'entreprise qui appelle"}
              </SheetDescription>
            </div>
          </div>

          {entrepriseId != null && (
            <div className="mt-2 flex gap-1 rounded-lg bg-[var(--bg-2)] p-0.5">
              <BoutonOnglet actif={onglet === "contexte"} onClick={() => setOnglet("contexte")}>
                Contexte
              </BoutonOnglet>
              <BoutonOnglet actif={onglet === "formulaire"} onClick={() => void ouvrirFormulaire()}>
                Compte rendu
              </BoutonOnglet>
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {entrepriseId == null ? (
            <SelecteurEntreprise onChoisir={choisirEntreprise} />
          ) : chargement && !contexte ? (
            <div className="flex h-40 items-center justify-center text-[var(--text-3)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !contexte ? (
            <p className="py-8 text-center text-sm text-[var(--text-3)]">
              Contexte indisponible.{" "}
              <button
                type="button"
                onClick={() => void chargerContexte(entrepriseId)}
                className="underline"
              >
                Réessayer
              </button>
            </p>
          ) : onglet === "contexte" ? (
            <ContexteEntrepriseVue
              contexte={contexte}
              onOuvrirCompteRendu={ouvrirCompteRenduExistant}
            />
          ) : compteRendu ? (
            <FormulaireCompteRendu
              compteRendu={compteRendu}
              formulaires={formulaires}
              onMaj={majCompteRendu}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-[var(--text-3)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BoutonOnglet({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        actif ? "bg-background shadow-sm" : "text-[var(--text-3)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Le bouton permanent de la barre du haut.
 *
 * Il est toujours là, sur toutes les pages du Studio : quand un prospect
 * appelle, il n'y a pas de « d'abord j'ouvre la bonne page ». Un clic, ou
 * Ctrl/⌘ + J.
 */
export function CockpitRdvBouton() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((prec) => !prec);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cockpit RDV"
        title="Cockpit RDV — un prospect appelle (⌘J)"
        className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Headset className="h-4 w-4" />
        <span className="hidden lg:inline">Cockpit</span>
      </button>
      <CockpitRdv open={open} onOpenChange={setOpen} />
    </>
  );
}

export default CockpitRdv;
