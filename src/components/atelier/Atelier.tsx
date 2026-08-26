"use client";

/**
 * L'atelier — faire avancer le travail depuis un téléphone.
 *
 * ── CE QU'IL EST, ET CE QU'IL N'EST PAS ──────────────────────────────────
 * Ce n'est pas une version mobile du CRM : c'est le poste de commande des
 * traitements de MASSE, ceux qu'on lance sur une population et qui tournent
 * sans nous. Choisir une population, la figer, lancer la file, la voir avancer.
 * Le travail fiche par fiche reste dans le pipeline marketing, où il a sa place.
 *
 * ── L'HONNÊTETÉ SUR CE QUI NE PEUT PAS BOUGER ────────────────────────────
 * Onze des trente-trois bots du registre sont des scripts locaux : Playwright,
 * un profil Chrome persistant, des CAPTCHA qui ne se résolvent qu'à l'œil, et
 * Chromium qui ne tient pas dans une fonction Vercel. Ce n'est pas une dette à
 * rembourser, c'est la raison pour laquelle ils fonctionnent.
 *
 * L'atelier ne prétend donc pas les déplacer. Il les COMPTE, et le dit en
 * clair : ce qui part maintenant, et ce qui attendra le bureau. C'est ce qui
 * transforme une absence en avance prise — on rentre en sachant exactement quoi
 * lancer, au lieu de découvrir la file en ouvrant son portable.
 *
 * ── LE POUCE COMMANDE TOUT ───────────────────────────────────────────────
 * Aucun tableau : des cartes. Toutes les cibles font au moins 44 px. La page
 * ouvre sur « créer un lot » replié, parce que l'usage le plus fréquent est de
 * regarder où en sont les lots, pas d'en créer un de plus.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Laptop,
  Loader2,
  FileText,
  PackagePlus,
  Play,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authedFetch } from "@/utils/authedFetch";
import type { BilanTick } from "@/lib/lissage/moteur";
import { CreerLot } from "./CreerLot";
import {
  AXES,
  avancement,
  manque,
  prochainGeste,
  type Couverture,
} from "@/lib/lots/couverture";

type AttenteLissage = {
  serveur: number;
  local: number;
  humain: number;
  passesOuvertes: number;
};

type Reponse = { lots: Couverture[]; lissage: AttenteLissage | null };

const nb = (n: number) => n.toLocaleString("fr-FR");

/** La barre d'avancement d'un lot. Sept axes résumés en une longueur. */
function Jauge({ part }: { part: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.round(part * 100)}%` }}
      />
    </div>
  );
}

function CarteLot({
  lot,
  onLance,
}: {
  lot: Couverture;
  onLance: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [lancement, setLancement] = useState(false);
  const [plaquettes, setPlaquettes] = useState(false);
  const geste = prochainGeste(lot);
  const part = avancement(lot);

  /**
   * Lance une passe de lissage SUR CE LOT. Aucun identifiant ne circule : la
   * route lit `lots_entreprises` elle-même (troisième porte de
   * `/api/lissage/passes`). C'est ce qui rend le geste possible en 4G, quelle
   * que soit la taille du lot.
   */
  const lancerLissage = async () => {
    setLancement(true);
    try {
      const r = await authedFetch("/api/lissage/passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.lotId }),
      });
      const corps = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(corps.message ?? corps.error ?? `Échec (${r.status})`));

      const ajoutes = Number(corps.ajoutes ?? 0);
      const dispo = Number(corps.total_disponible ?? ajoutes);
      toast.success(`Passe créée — ${nb(ajoutes)} fiches en file`, {
        description:
          dispo > ajoutes
            ? `Le lot en compte ${nb(dispo)} : le reste attendra une passe suivante.`
            : undefined,
      });
      onLance();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Passe impossible");
    } finally {
      setLancement(false);
    }
  };

  /**
   * Prépare les plaquettes du lot — le LIEN, pas le PDF. Le PDF passe par
   * Puppeteer et reste au bureau ; le lien, lui, relit les prix du jour à
   * chaque ouverture, ce qu'un fichier ne fait pas.
   */
  const preparerPlaquettes = async () => {
    setPlaquettes(true);
    try {
      const r = await authedFetch("/api/atelier/plaquettes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.lotId }),
      });
      const corps = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(corps.error ?? `Échec (${r.status})`));

      const preparees = Number(corps.preparees ?? 0);
      const restantes = Number(corps.restantes ?? 0);
      if (preparees === 0 && restantes === 0) {
        toast.info("Toutes les plaquettes de ce lot sont déjà prêtes");
      } else {
        toast.success(`${nb(preparees)} plaquette${preparees > 1 ? "s" : ""} préparée${preparees > 1 ? "s" : ""}`, {
          description: restantes > 0 ? `${nb(restantes)} restent à préparer.` : undefined,
        });
      }
      onLance();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Préparation impossible");
    } finally {
      setPlaquettes(false);
    }
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={ouvert}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{lot.nom}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{nb(lot.total)}</span>
          </div>
          <Jauge part={part} />
          <p className="truncate text-xs text-muted-foreground">
            {geste ? `Prochain : ${geste.geste}` : "Complet sur les sept axes"}
          </p>
        </div>
        {ouvert ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {ouvert && (
        <div className="space-y-3 border-t px-3 py-3">
          {/* Les sept axes, dans l'ordre du plan — c'est cet ordre qui permet de
              désigner LE prochain geste plutôt que d'afficher sept trous. */}
          <ul className="space-y-1">
            {AXES.map((axe) => {
              const trou = manque(lot, axe.cle);
              return (
                <li key={axe.cle} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className={trou === 0 ? "text-muted-foreground" : ""}>{axe.colonne}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {trou === 0 ? "complet" : `${nb(trou)} à faire`}
                  </span>
                </li>
              );
            })}
          </ul>

          <Button
            className="min-h-11 w-full"
            variant="secondary"
            onClick={() => void lancerLissage()}
            disabled={lancement || lot.total === 0}
          >
            {lancement ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Mettre ce lot en file de lissage
          </Button>

          <Button
            className="min-h-11 w-full"
            variant="outline"
            onClick={() => void preparerPlaquettes()}
            disabled={plaquettes || lot.total === 0}
          >
            {plaquettes ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Préparer les plaquettes
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Le lissage cherche le SIRET, les données publiques et le constat de présence web. Les
            plaquettes préparées ici sont des LIENS — ils relisent les prix du jour à chaque
            ouverture ; le PDF, lui, se fabrique au bureau. Les démos et les audits se font fiche
            par fiche, depuis le pipeline.
          </p>
        </div>
      )}
    </div>
  );
}

export function Atelier() {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [avance, setAvance] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await authedFetch("/api/atelier");
      if (!r.ok) {
        const corps = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(corps.error ?? `Atelier indisponible (${r.status})`));
      }
      setDonnees((await r.json()) as Reponse);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : "Atelier indisponible");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Fait tourner la file côté serveur — le seul bouton qui produise du travail. */
  const avancerLaFile = async () => {
    setAvance(true);
    try {
      const r = await authedFetch("/api/lissage/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const bilan = (await r.json()) as BilanTick;
      if (!r.ok) {
        const e = bilan as unknown as Record<string, unknown>;
        throw new Error(String(e.message ?? e.error ?? `Échec (${r.status})`));
      }

      // UN TICK PREND UN LOT ET S'ARRÊTE — c'est ce qui le rend borné. Sans le
      // reste, « 0 prise » ne se distingue pas de « tout est fini » : on appuie,
      // rien ne bouge, et l'écran se tait. Le moteur rend déjà les deux, on les
      // dit.
      const prises = Number(bilan.prises ?? 0);
      const reste = bilan.reste?.serveur ?? 0;
      if (prises === 0) {
        toast.info(
          reste > 0
            ? `Rien pris ce tour — ${nb(reste)} encore en attente côté serveur`
            : "La file est vide côté serveur",
        );
      } else {
        toast.success(`${nb(prises)} fiches prises, ${nb(Number(bilan.complets ?? 0))} terminées`, {
          description: reste > 0 ? `${nb(reste)} restent à avancer d'ici.` : undefined,
        });
      }

      // Les pannes d'outil sont de VRAIES pannes (le moteur range les réponses
      // ordinaires dans `remarques`) : elles méritent d'être vues.
      for (const panne of (bilan.pannes ?? []).slice(0, 3)) toast.error(panne);

      await charger();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Avancement impossible");
    } finally {
      setAvance(false);
    }
  };

  const lissage = donnees?.lissage ?? null;
  const lots = donnees?.lots ?? [];

  return (
    <div className="mobile-safe-pb space-y-4 px-3 py-4 md:px-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">L&apos;atelier</h1>
          <p className="text-sm text-muted-foreground">
            Choisir une population, la figer, la faire avancer.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => void charger()}
          aria-label="Rafraîchir"
        >
          <RefreshCw className={`h-4 w-4 ${chargement ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ── Ce qui peut partir maintenant, et ce qui attendra le bureau ── */}
      {lissage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">La file de lissage</CardTitle>
            <CardDescription>
              {lissage.passesOuvertes === 0
                ? "Aucune passe ouverte."
                : `${nb(lissage.passesOuvertes)} passe${lissage.passesOuvertes > 1 ? "s" : ""} ouverte${lissage.passesOuvertes > 1 ? "s" : ""}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border px-2 py-2">
                <div className="text-xl font-semibold tabular-nums">{nb(lissage.serveur)}</div>
                <div className="text-[11px] text-muted-foreground">d&apos;ici</div>
              </div>
              <div className="rounded-lg border px-2 py-2">
                <div className="text-xl font-semibold tabular-nums">{nb(lissage.local)}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <Laptop className="h-3 w-3" />
                  au bureau
                </div>
              </div>
              <div className="rounded-lg border px-2 py-2">
                <div className="text-xl font-semibold tabular-nums">{nb(lissage.humain)}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <UserRound className="h-3 w-3" />
                  à l&apos;œil
                </div>
              </div>
            </div>

            <Button
              className="min-h-12 w-full"
              onClick={() => void avancerLaFile()}
              disabled={avance || lissage.serveur === 0}
            >
              {avance ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {lissage.serveur === 0
                ? "Rien à avancer d'ici"
                : `Avancer la file (${nb(lissage.serveur)})`}
            </Button>

            {/* L'honnêteté, écrite : ces lignes-là ne partiront pas d'ici, et
                savoir combien elles sont est ce qui prépare la séance au bureau. */}
            {lissage.local > 0 && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Laptop className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {nb(lissage.local)} étape{lissage.local > 1 ? "s" : ""} attend
                  {lissage.local > 1 ? "ent" : ""} la machine : recherche Google pilotée, profil
                  Chrome persistant, CAPTCHA. Au bureau,{" "}
                  <code className="rounded bg-muted px-1">node scripts/lissage/runner.mjs --boucle</code>{" "}
                  les prend.
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Créer un lot, replié par défaut ── */}
      <Card>
        <CardHeader className="pb-2">
          <button
            type="button"
            onClick={() => setCreation((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
            aria-expanded={creation}
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="h-4 w-4" />
              Nouveau lot
            </CardTitle>
            {creation ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CardHeader>
        {creation && (
          <CardContent>
            <CreerLot
              onLotCree={() => {
                setCreation(false);
                void charger();
              }}
            />
          </CardContent>
        )}
      </Card>

      {/* ── Les lots ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            Les lots
            {lots.length > 0 && <Badge variant="secondary">{lots.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chargement ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lecture…
            </div>
          ) : erreur ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{erreur}</p>
          ) : lots.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun lot. Créez-en un depuis les filtres ci-dessus.
            </p>
          ) : (
            <div className="space-y-2">
              {lots.map((lot) => (
                <CarteLot key={lot.lotId} lot={lot} onLance={() => void charger()} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        <Link href="/entreprises/lots" className="underline underline-offset-2">
          Vue complète des lots
        </Link>
      </p>
    </div>
  );
}

export default Atelier;
