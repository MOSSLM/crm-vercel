"use client";

/**
 * Le fil d'activité d'une entreprise — la réponse à « qu'est-ce qui s'est passé
 * avec eux ? », en un écran.
 *
 * ORDRE DE LECTURE, délibéré comme celui du dossier : le plus récent en haut,
 * groupé par jour. On arrive sur une fiche pour savoir où on en est, pas pour
 * relire l'historique depuis le début.
 *
 * ── POURQUOI ÇA OUVRE SUR « ÉCHANGES » ET NON SUR « TOUT » ───────────────
 * Un simple déplacement de carte dans le pipeline écrit trois lignes en base
 * (`activity_log`, `pipeline_events`, `opportunite_etapes_journal`). Ouvrir sur
 * « tout » noierait les deux appels de la semaine sous quinze lignes de
 * machine. On classe donc plutôt qu'on ne masque : « Échanges » ne montre que
 * les contacts avec un humain, « Tout » rend le fil brut, sans rien perdre.
 * Le détail du raisonnement est dans `lib/fil-activite.ts`.
 *
 * ── CE QUI N'EST PAS FAIT ICI, ET POURQUOI ───────────────────────────────
 * Aucune déduplication. Deux lignes qui se ressemblent viennent de deux tables
 * qui disent des choses légèrement différentes ; les fondre reviendrait à
 * décider laquelle ment. Le fil est la référence : il montre ce qui est écrit,
 * et `source` dit toujours où aller vérifier.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  FileInput,
  GitBranch,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Settings2,
  StickyNote,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authedFetch } from "@/utils/authedFetch";
import {
  LIBELLE_CANAL,
  LIBELLE_SOURCE,
  type CanalFil,
  type EvenementFil,
  type FiltreFil,
  type ReponseFil,
} from "@/lib/fil-activite";

const ICONE_CANAL: Record<CanalFil, LucideIcon> = {
  appel: Phone,
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  rdv: CalendarCheck,
  note: StickyNote,
  etape: GitBranch,
  formulaire: FileInput,
  systeme: Settings2,
};

/** Le ton de chaque canal. Volontairement sourd pour `etape` et `systeme` :
 *  ces lignes sont du contexte, pas de l'information. */
const TON_CANAL: Record<CanalFil, string> = {
  appel: "text-emerald-600 dark:text-emerald-400",
  email: "text-blue-600 dark:text-blue-400",
  sms: "text-violet-600 dark:text-violet-400",
  whatsapp: "text-green-600 dark:text-green-400",
  rdv: "text-amber-600 dark:text-amber-400",
  note: "text-slate-600 dark:text-slate-300",
  formulaire: "text-cyan-600 dark:text-cyan-400",
  etape: "text-muted-foreground",
  systeme: "text-muted-foreground",
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** « Aujourd'hui » et « Hier » plutôt que la date : c'est ainsi qu'on en parle. */
function libelleJour(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (memeJour(d, auj)) return "Aujourd'hui";
  const hier = new Date(auj);
  hier.setDate(hier.getDate() - 1);
  if (memeJour(d, hier)) return "Hier";
  return JOUR.format(d);
}

/** Le temps écoulé, en une unité. Deux unités (« 3 mois et 4 jours ») n'aident
 *  jamais à décider s'il faut relancer. */
function depuis(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const jours = Math.floor(ms / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  if (jours < 31) return `il y a ${jours} j`;
  const mois = Math.floor(jours / 30);
  if (mois < 12) return `il y a ${mois} mois`;
  return `il y a ${Math.floor(mois / 12)} an${mois >= 24 ? "s" : ""}`;
}

function LigneFil({ ev }: { ev: EvenementFil }) {
  const Icone = ICONE_CANAL[ev.canal] ?? Settings2;
  const discret = ev.canal === "etape" || ev.canal === "systeme";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Le trait de continuité. `last:hidden` pour qu'il ne pende pas sous le
          dernier point du groupe. */}
      <span
        aria-hidden
        className="absolute left-[13px] top-7 bottom-0 w-px bg-border last:hidden"
      />
      <span
        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background ${TON_CANAL[ev.canal] ?? ""}`}
      >
        <Icone className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-sm ${discret ? "text-muted-foreground" : "font-medium"}`}>
            {ev.titre}
          </span>
          {ev.sens === "entrant" && (
            <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="reçu" />
          )}
          {ev.sens === "sortant" && (
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="envoyé" />
          )}
          <span className="text-xs text-muted-foreground">{HEURE.format(new Date(ev.survenu_le))}</span>
        </div>

        {ev.detail && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground line-clamp-3">
            {ev.detail}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
            {LIBELLE_CANAL[ev.canal] ?? ev.canal}
          </Badge>
          {ev.acteur_nom && <span>{ev.acteur_nom}</span>}
          <span className="opacity-60">· {LIBELLE_SOURCE[ev.source] ?? ev.source}</span>
        </div>
      </div>
    </li>
  );
}

export function FilActivite({ entrepriseId }: { entrepriseId: number }) {
  const [filtre, setFiltre] = useState<FiltreFil>("echanges");
  const [evenements, setEvenements] = useState<EvenementFil[]>([]);
  const [suite, setSuite] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [chargePlus, setChargePlus] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    async (curseur: string | null, mode: FiltreFil) => {
      const params = new URLSearchParams({ filtre: mode, limite: "50" });
      if (curseur) params.set("avant", curseur);
      const r = await authedFetch(`/api/entreprises/${entrepriseId}/fil?${params}`);
      if (!r.ok) throw new Error(`Fil indisponible (${r.status})`);
      return (await r.json()) as ReponseFil;
    },
    [entrepriseId],
  );

  // Le changement de filtre repart de zéro : le curseur d'une vue ne veut rien
  // dire dans l'autre, puisque les deux ne contiennent pas les mêmes lignes.
  useEffect(() => {
    let abandonne = false;
    setChargement(true);
    setErreur(null);
    charger(null, filtre)
      .then((rep) => {
        if (abandonne) return;
        setEvenements(rep.evenements);
        setSuite(rep.suite);
      })
      .catch((e: unknown) => {
        if (!abandonne) setErreur(e instanceof Error ? e.message : "Fil indisponible");
      })
      .finally(() => {
        if (!abandonne) setChargement(false);
      });
    return () => {
      abandonne = true;
    };
  }, [charger, filtre]);

  const encorePlus = useCallback(async () => {
    if (!suite || chargePlus) return;
    setChargePlus(true);
    try {
      const rep = await charger(suite, filtre);
      setEvenements((prec) => [...prec, ...rep.evenements]);
      setSuite(rep.suite);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : "Fil indisponible");
    } finally {
      setChargePlus(false);
    }
  }, [charger, chargePlus, filtre, suite]);

  // Le groupement par jour se fait à l'affichage et non en base : la coupure
  // dépend du fuseau du lecteur, que le serveur ne connaît pas.
  const groupes: Array<{ jour: string; lignes: EvenementFil[] }> = [];
  for (const ev of evenements) {
    const jour = libelleJour(ev.survenu_le);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.lignes.push(ev);
    else groupes.push({ jour, lignes: [ev] });
  }

  const dernierContact = evenements[0]?.survenu_le ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Fil d&apos;activité
            {dernierContact && (
              <span className="text-sm font-normal text-muted-foreground">
                — dernier {depuis(dernierContact)}
              </span>
            )}
          </CardTitle>

          {/* Deux boutons plutôt qu'un Select : le basculement est fréquent et
              doit tenir en un tap, y compris au pouce. */}
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Filtre du fil">
            {(["echanges", "tout"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFiltre(mode)}
                aria-pressed={filtre === mode}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  filtre === mode
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "echanges" ? "Échanges" : "Tout"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {chargement ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du fil…
          </div>
        ) : erreur ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{erreur}</p>
        ) : evenements.length === 0 ? (
          <div className="py-8 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {filtre === "echanges"
                ? "Aucun échange enregistré avec cette entreprise."
                : "Rien n'a encore été enregistré pour cette entreprise."}
            </p>
            {filtre === "echanges" && (
              <Button variant="link" size="sm" className="mt-1" onClick={() => setFiltre("tout")}>
                Voir aussi les traces système
              </Button>
            )}
          </div>
        ) : (
          <>
            {groupes.map((groupe) => (
              <section key={groupe.jour} className="mb-4 last:mb-0">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {groupe.jour}
                </h4>
                <ul className="ml-0.5">
                  {groupe.lignes.map((ev) => (
                    <LigneFil key={ev.cle} ev={ev} />
                  ))}
                </ul>
              </section>
            ))}

            {suite && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={encorePlus}
                disabled={chargePlus}
              >
                {chargePlus ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Chargement…
                  </>
                ) : (
                  "Charger la suite"
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default FilActivite;
