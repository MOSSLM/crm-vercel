"use client";

/**
 * Figer un lot depuis son téléphone, en trois taps.
 *
 * ── LE COMPTE EST LA PIÈCE CENTRALE, PAS UN ORNEMENT ─────────────────────
 * On ne fait pas défiler 34 633 lignes sur un téléphone — ni ailleurs. Ce que
 * l'humain voit d'une population, c'est son NOMBRE. Ce nombre est donc affiché
 * en grand, rafraîchi à chaque changement de filtre, et REPOSTÉ au serveur avec
 * la demande : `figer_lot_depuis_criteres` refuse de créer quoi que ce soit si
 * la population a bougé entre l'affichage et le tap.
 *
 * C'est ce qui permet d'assouplir la règle « on fige depuis une liste
 * d'identifiants » sans perdre ce qu'elle protégeait : le danger qu'elle
 * nommait était le SILENCE d'une divergence, et ici la divergence parle.
 *
 * ── LE COMPTE EST DIFFÉRÉ, PARCE QU'IL COÛTE ─────────────────────────────
 * Chaque changement de filtre déclenche une requête sur 60 726 fiches. Sans
 * délai, cocher trois cases en tapotant en lancerait trois — dont deux dont
 * personne n'attend le résultat. Le délai est court (400 ms) : il doit effacer
 * le tapotement, pas donner l'impression que l'écran rame.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authedFetch } from "@/utils/authedFetch";

/**
 * Les filtres offerts au pouce. Volontairement plus courts que ceux de
 * l'explorateur — qui expose aussi les états (archivée, masquée, fusionnée),
 * lesquels n'ont rien à faire dans un lot de travail. Restent les trois trous
 * que le lissage sait boucher, la qualité, et le logo.
 *
 * L'état vivant n'est pas une case : il est TOUJOURS joint (`ETAT_DE_BASE`).
 * Le rendre décochable laisserait fabriquer un lot d'archivées, ce que
 * personne ne veut et que personne ne verrait avant de lancer un traitement.
 */
const FILTRES = [
  { cle: "sans_site", libelle: "Sans site", aide: "Aucune URL, ou une page Facebook" },
  { cle: "sans_siret", libelle: "Sans SIRET", aide: "Pas encore rapprochée du registre" },
  { cle: "sans_google", libelle: "Sans fiche Google", aide: "Aucun place_id connu" },
  { cle: "qualite", libelle: "Qualité douteuse", aide: "Un motif de qualité est posé" },
  // Le logo ne conditionne PAS la fabrication d'une démo (`hydrate-logo`
  // compose le nom quand il manque) — mais 738 fiches sur 60 445 en ont un, et
  // celles qui ont un vrai site en portent forcément un qu'on n'a pas encore
  // pris. C'est un tri de travail, pas un critère de qualité.
  { cle: "avec_logo", libelle: "Avec logo", aide: "Un logo est déjà enregistré" },
  { cle: "sans_logo", libelle: "Sans logo", aide: "Aucun logo — combinable avec « sans site »" },
] as const;

/**
 * Les paires qui s'annulent. Cocher « avec logo » ET « sans logo » rend
 * littéralement l'ensemble vide — c'est la lecture correcte, mais personne ne
 * la veut : on décoche donc l'autre plutôt que d'afficher zéro sans expliquer.
 */
const EXCLUSIFS: Record<string, string> = { avec_logo: "sans_logo", sans_logo: "avec_logo" };

/** Toujours joint : sans lui on compterait les archivées et les fusionnées. */
const ETAT_DE_BASE = "vivantes";

const DELAI_COMPTE_MS = 400;

/** Au-delà, ce n'est plus un lot de travail. Même valeur que la route. */
const PLAFOND = 20_000;

export function CreerLot({ onLotCree }: { onLotCree?: () => void }) {
  const [flags, setFlags] = useState<string[]>(["sans_site"]);
  const [nom, setNom] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [compte, setCompte] = useState(false);
  const [figeage, setFigeage] = useState(false);

  // Garde le numéro de la dernière demande : une réponse lente d'un filtre
  // qu'on vient de décocher ne doit pas écraser le compte du filtre courant.
  const demande = useRef(0);

  const compter = useCallback(async (drapeaux: string[]) => {
    const mien = ++demande.current;
    setCompte(true);
    try {
      const params = new URLSearchParams({
        flags: [ETAT_DE_BASE, ...drapeaux].join(","),
        // Une seule ligne suffit : le total voyage sur chacune d'elles.
        limite: "1",
      });
      const r = await authedFetch(`/api/entreprises/explorer?${params}`);
      if (!r.ok) throw new Error(`Comptage impossible (${r.status})`);
      const { total: n } = (await r.json()) as { total: number };
      if (mien === demande.current) setTotal(n);
    } catch {
      if (mien === demande.current) setTotal(null);
    } finally {
      if (mien === demande.current) setCompte(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void compter(flags), DELAI_COMPTE_MS);
    return () => clearTimeout(t);
  }, [flags, compter]);

  const basculer = (cle: string) =>
    setFlags((prec) => {
      if (prec.includes(cle)) return prec.filter((f) => f !== cle);
      const oppose = EXCLUSIFS[cle];
      const sansOppose = oppose ? prec.filter((f) => f !== oppose) : prec;
      return [...sansOppose, cle];
    });

  /** Un nom proposé, jamais imposé : il reste modifiable jusqu'au dernier tap. */
  const nomPropose = () => {
    const libelles = FILTRES.filter((f) => flags.includes(f.cle)).map((f) => f.libelle.toLowerCase());
    const quoi = libelles.length > 0 ? libelles.join(", ") : "toutes vivantes";
    const jour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    return `${quoi} — ${jour}`;
  };

  const figer = async () => {
    if (total === null || total === 0) return;
    setFigeage(true);
    try {
      const r = await authedFetch("/api/entreprises/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim() || nomPropose(),
          criteres: { flags: [ETAT_DE_BASE, ...flags] },
          // La garde. Le serveur refuse si ce nombre n'est plus le bon.
          totalAttendu: total,
        }),
      });

      const corps = (await r.json()) as Record<string, unknown>;

      if (r.status === 409) {
        // La population a bougé : on ne renvoie PAS en forçant. On remet le
        // compte à jour et on laisse l'humain re-décider — c'est tout l'objet
        // de la garde.
        const trouve = Number(corps.totalTrouve ?? 0);
        setTotal(trouve);
        toast.warning("La population a changé", {
          description: `${trouve} fiches maintenant, contre ${total} à l'affichage. Rien n'a été créé.`,
        });
        return;
      }
      if (r.status === 413) {
        toast.error("Lot trop grand", {
          description: `${Number(corps.totalTrouve ?? 0)} fiches pour un plafond de ${PLAFOND}. Resserrez les filtres.`,
        });
        return;
      }
      if (!r.ok) throw new Error(String(corps.error ?? `Échec (${r.status})`));

      toast.success(`Lot figé — ${Number(corps.entreprises ?? 0)} entreprises`);
      setNom("");
      onLotCree?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setFigeage(false);
    }
  };

  const tropGrand = total !== null && total > PLAFOND;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTRES.map((f) => {
          const actif = flags.includes(f.cle);
          return (
            <button
              key={f.cle}
              type="button"
              onClick={() => basculer(f.cle)}
              aria-pressed={actif}
              title={f.aide}
              className={`min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                actif
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {f.libelle}
            </button>
          );
        })}
      </div>

      {/* Le compte, en grand. C'est lui qu'on valide en tapant sur le bouton. */}
      <div className="flex items-baseline gap-2">
        {compte ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-3xl font-semibold tabular-nums">
            {total === null ? "—" : total.toLocaleString("fr-FR")}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {total === 1 ? "entreprise vivante" : "entreprises vivantes"}
        </span>
      </div>

      <div>
        <Label htmlFor="nom-lot" className="text-xs text-muted-foreground">
          Nom du lot
        </Label>
        <Input
          id="nom-lot"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={nomPropose()}
          className="min-h-11"
        />
      </div>

      <Button
        className="min-h-12 w-full"
        onClick={() => void figer()}
        disabled={figeage || compte || total === null || total === 0 || tropGrand}
      >
        {figeage ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="mr-2 h-4 w-4" />
        )}
        {tropGrand
          ? `Trop grand — plafond ${PLAFOND.toLocaleString("fr-FR")}`
          : total === 0
            ? "Aucune entreprise"
            : `Figer ce lot${total !== null ? ` (${total.toLocaleString("fr-FR")})` : ""}`}
      </Button>

      <p className="text-xs text-muted-foreground">
        Un lot est une photo : sa composition ne bouge plus, et un traitement lancé dessus se
        rejoue à l&apos;identique. Les filtres, eux, continuent de vivre.
      </p>
    </div>
  );
}

export default CreerLot;
