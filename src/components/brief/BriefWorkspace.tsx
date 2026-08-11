"use client";

/**
 * L'atelier de brief — ce qu'on remplit PENDANT l'appel de RDV.
 *
 * IL REMPLACE UN FORMULAIRE QU'ON DONNAIT AU CLIENT. La carte « Personnaliser
 * mon site » de l'espace client demandait à un artisan qui venait de payer de
 * rédiger lui-même son brief et de téléverser ses photos. Personne ne le
 * faisait, et la production restait bloquée sans que ce blocage ait un nom.
 * La collecte revient donc à l'agent, au seul moment où le client parle
 * volontiers : l'appel.
 *
 * TROIS CHOIX DE CONSTRUCTION, tous dictés par ce moment-là :
 *
 * 1. **Les notes ne quittent jamais l'écran.** Elles sont dans une colonne à
 *    part, visibles à chaque étape. Un client ne répond pas dans l'ordre du
 *    questionnaire : il part sur une anecdote de chantier pendant qu'on lui
 *    demande son SIRET. Sans champ libre en permanence, ça se perd.
 *
 * 2. **Rien n'est obligatoire, rien ne bloque.** Aucune étape ne refuse de
 *    passer à la suivante. Le compteur dit ce qui manque, il n'interdit pas
 *    d'avancer — un formulaire qui se braque au téléphone se remplit après
 *    l'appel, de mémoire, c'est-à-dire mal.
 *
 * 3. **L'enregistrement est continu et silencieux.** Pas de bouton « valider »
 *    qu'on oublie de cliquer avant de raccrocher. Ce qui est tapé est
 *    enregistré ; le seul geste explicite est « brief complet », qui dit à la
 *    production qu'elle peut démarrer.
 *
 * Le pré-remplissage venu du CRM est PROPOSÉ, jamais appliqué d'office : un
 * téléphone récupéré sur Google et un téléphone confirmé au client n'ont pas la
 * même valeur, et le second est celui qui ira sur le site.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Loader2,
  Quote,
  StickyNote,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authedFetch } from "@/utils/authedFetch";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import {
  ETAPES,
  avancementEtape,
  estRemplie,
  manquants,
  type Champ,
  type Reponse,
  type Reponses,
} from "@/lib/brief/formulaire";

interface Asset {
  id: string;
  public_url: string;
  filename: string;
}

interface Chargement {
  site: {
    id: string;
    name: string;
    entreprise_id: number | null;
    published_subdomain: string | null;
    paywall_enabled: boolean;
    build_stage: string;
  };
  entreprise: { name?: string | null } | null;
  brief: {
    reponses: Reponses;
    notes: string | null;
    etape: number;
    statut: "en_cours" | "complet";
    maj_le: string;
  } | null;
  prefill: Record<string, string>;
}

type EtatSauvegarde = "repos" | "en_cours" | "enregistre" | "erreur";

/** Délai d'inactivité avant enregistrement. Assez court pour qu'un raccrochage
 *  brutal ne coûte rien, assez long pour ne pas écrire à chaque touche. */
const DEBOUNCE_MS = 900;

export function BriefWorkspace({ siteId }: { siteId: string }) {
  const [data, setData] = useState<Chargement | null>(null);
  const [indisponible, setIndisponible] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const [reponses, setReponses] = useState<Reponses>({});
  const [notes, setNotes] = useState("");
  const [etape, setEtape] = useState(0);
  const [statut, setStatut] = useState<"en_cours" | "complet">("en_cours");
  const [sauvegarde, setSauvegarde] = useState<EtatSauvegarde>("repos");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [televersement, setTeleversement] = useState(false);
  const fichierRef = useRef<HTMLInputElement | null>(null);

  // Le contenu à enregistrer, tenu hors du rendu : le minuteur de debounce est
  // créé une fois et lirait sinon un état figé à sa création.
  const aEnvoyer = useRef<{ reponses: Reponses; notes: string; etape: number }>({
    reponses: {},
    notes: "",
    etape: 0,
  });
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chargerAssets = useCallback(async () => {
    const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`);
    if (res.ok) {
      const d = (await res.json()) as Asset[];
      setAssets(Array.isArray(d) ? d : []);
    }
  }, [siteId]);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/site-builder/sites/${siteId}/brief`);
        const body = (await res.json()) as Chargement & { disponible?: boolean; motif?: string };
        if (annule) return;
        if (body.disponible === false) {
          setIndisponible(body.motif ?? "Brief indisponible.");
          return;
        }
        if (!res.ok) throw new Error("Chargement impossible");
        setData(body);
        const b = body.brief;
        setReponses(b?.reponses ?? {});
        setNotes(b?.notes ?? "");
        setEtape(Math.min(Math.max(b?.etape ?? 0, 0), ETAPES.length - 1));
        setStatut(b?.statut ?? "en_cours");
        aEnvoyer.current = {
          reponses: b?.reponses ?? {},
          notes: b?.notes ?? "",
          etape: b?.etape ?? 0,
        };
      } catch {
        if (!annule) toast.error("Impossible de charger le brief.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    void chargerAssets();
    return () => {
      annule = true;
    };
  }, [siteId, chargerAssets]);

  const enregistrer = useCallback(
    async (extra?: { statut?: "en_cours" | "complet" }) => {
      setSauvegarde("en_cours");
      try {
        const res = await authedFetch(`/api/site-builder/sites/${siteId}/brief`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...aEnvoyer.current, ...extra }),
        });
        if (!res.ok) throw new Error();
        setSauvegarde("enregistre");
      } catch {
        setSauvegarde("erreur");
      }
    },
    [siteId],
  );

  const programmer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => void enregistrer(), DEBOUNCE_MS);
  }, [enregistrer]);

  // Un onglet fermé au milieu d'un appel ne doit pas emporter les dernières
  // secondes de saisie : on vide le minuteur avant de partir.
  useEffect(() => {
    const avant = () => {
      if (minuteur.current) {
        clearTimeout(minuteur.current);
        void enregistrer();
      }
    };
    window.addEventListener("beforeunload", avant);
    return () => {
      window.removeEventListener("beforeunload", avant);
      avant();
    };
  }, [enregistrer]);

  const majReponse = (cle: string, valeur: Reponse) => {
    setReponses((prev) => {
      const suivant = { ...prev, [cle]: valeur };
      aEnvoyer.current.reponses = suivant;
      return suivant;
    });
    setSauvegarde("repos");
    programmer();
  };

  const majNotes = (valeur: string) => {
    setNotes(valeur);
    aEnvoyer.current.notes = valeur;
    setSauvegarde("repos");
    programmer();
  };

  const allerA = (index: number) => {
    const borne = Math.min(Math.max(index, 0), ETAPES.length - 1);
    setEtape(borne);
    aEnvoyer.current.etape = borne;
    void enregistrer();
  };

  const basculerStatut = async () => {
    const suivant = statut === "complet" ? "en_cours" : "complet";
    setStatut(suivant);
    await enregistrer({ statut: suivant });
    toast.success(
      suivant === "complet"
        ? "Brief marqué complet — la production peut démarrer."
        : "Brief rouvert.",
    );
  };

  const televerser = async (fichiers: FileList | null) => {
    if (!fichiers || fichiers.length === 0) return;
    setTeleversement(true);
    let ok = 0;
    for (const f of Array.from(fichiers)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) ok += 1;
    }
    await chargerAssets();
    setTeleversement(false);
    if (fichierRef.current) fichierRef.current.value = "";
    if (ok > 0) toast.success(`${ok} fichier${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""}.`);
    else toast.error("Le téléversement a échoué.");
  };

  const restants = useMemo(() => manquants(reponses), [reponses]);

  if (chargement) {
    return <div className="p-8 text-sm text-muted-foreground">Chargement du brief…</div>;
  }

  if (indisponible) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <b>Brief indisponible.</b> {indisponible}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">Site introuvable.</div>;
  }

  const courante = ETAPES[etape];
  const nom = data.entreprise?.name ?? data.site.name;
  const lienSite = demoShareUrl({
    id: data.site.id,
    published_subdomain: data.site.published_subdomain,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* En-tête : qui, où en est-on, et l'état de l'enregistrement */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{nom}</h1>
            {statut === "complet" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Brief complet
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Brief de reprise</span>
            <a
              href={lienSite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              Voir la démo <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <IndicateurSauvegarde etat={sauvegarde} />
          <Button
            size="sm"
            variant={statut === "complet" ? "outline" : "default"}
            onClick={() => void basculerStatut()}
          >
            {statut === "complet" ? "Rouvrir le brief" : "Marquer le brief complet"}
          </Button>
        </div>
      </header>

      {/* Fil des étapes */}
      <nav className="flex gap-1 overflow-x-auto border-b bg-muted/30 px-6 py-2">
        {ETAPES.map((e, i) => {
          const av = avancementEtape(e, reponses);
          const fini = av.total > 0 && av.fait === av.total;
          return (
            <button
              key={e.cle}
              type="button"
              onClick={() => allerA(i)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                i === etape
                  ? "bg-background font-medium shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                  fini
                    ? "bg-emerald-500 text-white"
                    : i === etape
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted-foreground/20"
                }`}
              >
                {fini ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {e.titre}
              {av.total > 0 && !fini && (
                <span className="text-[10px] opacity-60">
                  {av.fait}/{av.total}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Corps : questions à gauche, notes à droite */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-h-0 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold">{courante.titre}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{courante.intention}</p>

            <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
              {courante.champs.map((champ) => (
                <div
                  key={champ.cle}
                  className={champ.pleineLargeur || champ.type === "fichiers" ? "sm:col-span-2" : ""}
                >
                  <ChampBrief
                    champ={champ}
                    valeur={reponses[champ.cle]}
                    suggestion={data.prefill[champ.cle]}
                    onChange={(v) => majReponse(champ.cle, v)}
                    assets={champ.type === "fichiers" ? assets : undefined}
                    televersement={televersement}
                    onTeleverser={() => fichierRef.current?.click()}
                  />
                </div>
              ))}
            </div>

            <input
              ref={fichierRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void televerser(e.target.files)}
            />

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between border-t pt-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => allerA(etape - 1)}
                disabled={etape === 0}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Étape {etape + 1} sur {ETAPES.length}
              </span>
              {etape < ETAPES.length - 1 ? (
                <Button size="sm" onClick={() => allerA(etape + 1)}>
                  Suivant <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => void basculerStatut()}>
                  Terminer
                </Button>
              )}
            </div>
          </div>
        </main>

        {/* Notes — toujours là, quelle que soit l'étape */}
        <aside className="flex min-h-0 flex-col border-t bg-muted/20 lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> Notes d&apos;appel
            </div>
            <Textarea
              value={notes}
              onChange={(e) => majNotes(e.target.value)}
              placeholder="Ce qu'il dit et qui n'entre dans aucune case : son histoire, ses objections, ce qui le fait hésiter…"
              className="min-h-[220px] resize-y bg-background text-sm"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground">
              Il manque {restants.length === 0 ? "— rien" : `${restants.length} réponse${restants.length > 1 ? "s" : ""}`}
            </div>
            {restants.length === 0 ? (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Tout ce dont la production a besoin est là.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {restants.map((m) => (
                  <li key={`${m.etape}-${m.label}`} className="text-xs text-muted-foreground">
                    <span className="opacity-50">{m.etape} · </span>
                    {m.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t px-4 py-3">
            <Link
              href={
                data.site.entreprise_id
                  ? `/espace-agent/entreprises/${data.site.entreprise_id}`
                  : "/site-builder/claude"
              }
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Retour à la fiche
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function IndicateurSauvegarde({ etat }: { etat: EtatSauvegarde }) {
  if (etat === "en_cours")
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
      </span>
    );
  if (etat === "enregistre")
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3 text-emerald-500" /> Enregistré
      </span>
    );
  if (etat === "erreur")
    return <span className="text-xs text-red-600">Enregistrement impossible</span>;
  return null;
}

function ChampBrief({
  champ,
  valeur,
  suggestion,
  onChange,
  assets,
  televersement,
  onTeleverser,
}: {
  champ: Champ;
  valeur: Reponse | undefined;
  suggestion?: string;
  onChange: (v: Reponse) => void;
  assets?: Asset[];
  televersement?: boolean;
  onTeleverser?: () => void;
}) {
  const rempli = estRemplie(valeur);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-sm font-medium">{champ.label}</label>
        {champ.requis && !rempli && (
          <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
            à obtenir
          </span>
        )}
      </div>

      {/* Le souffleur : la phrase à dire, pas la description du champ. */}
      {champ.souffleur && (
        <p className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
          {champ.souffleur}
        </p>
      )}

      <Corps champ={champ} valeur={valeur} onChange={onChange} assets={assets} televersement={televersement} onTeleverser={onTeleverser} />

      {/* La suggestion du CRM, proposée tant que le champ est vide. */}
      {!rempli && suggestion && champ.type !== "fichiers" && (
        <button
          type="button"
          onClick={() => onChange(champ.type === "liste" ? [suggestion] : suggestion)}
          className="text-left text-[11px] text-blue-600 hover:underline"
          title="Reprendre la valeur connue du CRM"
        >
          Connu du CRM : « {suggestion} » — utiliser
        </button>
      )}
    </div>
  );
}

function Corps({
  champ,
  valeur,
  onChange,
  assets,
  televersement,
  onTeleverser,
}: {
  champ: Champ;
  valeur: Reponse | undefined;
  onChange: (v: Reponse) => void;
  assets?: Asset[];
  televersement?: boolean;
  onTeleverser?: () => void;
}) {
  switch (champ.type) {
    case "long":
      return (
        <Textarea
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={champ.placeholder}
          className="min-h-[80px] resize-y text-sm"
        />
      );

    case "liste":
      // Une ligne = un élément. Plus rapide à remplir en parlant qu'un champ à
      // pastilles, qui demande un geste de validation par entrée.
      return (
        <Textarea
          value={Array.isArray(valeur) ? valeur.join("\n") : ""}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          placeholder={champ.placeholder ?? "Un par ligne"}
          className="min-h-[80px] resize-y text-sm"
        />
      );

    case "choix":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(champ.options ?? []).map((o) => {
            const actif = valeur === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(actif ? "" : o)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  actif
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );

    case "oui_non":
      return (
        <div className="flex gap-1.5">
          {[
            { l: "Oui", v: true },
            { l: "Non", v: false },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => onChange(valeur === o.v ? null : o.v)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                valeur === o.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      );

    case "date":
      return (
        <Input
          type="date"
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      );

    case "fichiers":
      return (
        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={onTeleverser} disabled={televersement}>
            {televersement ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Téléversement…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-3.5 w-3.5" /> Ajouter des fichiers
              </>
            )}
          </Button>
          {assets && assets.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {assets.map((a) => (
                <a
                  key={a.id}
                  href={a.public_url}
                  target="_blank"
                  rel="noreferrer"
                  title={a.filename}
                  className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.public_url}
                    alt={a.filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" /> Rien pour l&apos;instant. Le client peut aussi
              déposer depuis son espace.
            </div>
          )}
        </div>
      );

    default:
      return (
        <Input
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={champ.placeholder}
          className="text-sm"
        />
      );
  }
}
