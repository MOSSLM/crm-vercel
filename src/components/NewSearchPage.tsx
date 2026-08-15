"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authedFetch } from "@/utils/authedFetch";
import {
  CrawlResponseSchema,
  JobStatusSchema,
  estStatutTerminal,
  type JobStatus,
  type JobStatusValue,
} from "@/lib/gmaps/contract";

async function downloadResults(jobId: string, format: "csv" | "json") {
  const res = await authedFetch(`/api/gmaps/results/${jobId}?format=${format}`);
  if (!res.ok) {
    toast.error("Téléchargement impossible");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `results-${jobId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const tileSteps = ["0.005", "0.01", "0.02", "0.05", "0.1"] as const;

/**
 * Cadence du suivi. Chaque échec de TRANSPORT (service injoignable, 502/504 de
 * Vercel, réponse illisible) espace la tentative suivante — un hoquet de 15 s ne
 * doit pas donner l'impression que le crawl est mort.
 */
const POLL_INTERVAL_MS = 3000;
const POLL_INTERVAL_MAX_MS = 30_000;
/** Échecs de transport consécutifs avant d'annoncer « suivi interrompu ». */
const MAX_ECHECS_POLL = 5;

/**
 * Accélérateur d'extinction du service de scraping.
 *
 * ⚠️ Ce n'est qu'un ACCÉLÉRATEUR. La couche de référence est côté scraper :
 * `server.js` réarme un minuteur d'inactivité (`IDLE_SHUTDOWN_MS`, 15 min) tant
 * qu'un crawl est en vol, et raccourcit ce délai à `POST_JOB_GRACE_MS` dès qu'un
 * job se termine. Le service s'éteint donc tout seul, même si ce navigateur est
 * fermé ou hors ligne. On n'appelle ceci que lorsque l'utilisateur QUITTE un job
 * DÉJÀ TERMINÉ : jamais pendant un crawl (on tuerait la tâche Fargate en plein
 * travail), jamais tant que les boutons de téléchargement sont à l'écran (ils
 * passent par la Map mémoire du scraper, qui meurt avec la tâche).
 *
 * L'échec HTTP est TRACÉ, pas avalé : `authedFetch` est un `fetch` nu, il résout
 * sur 4xx/5xx, donc sans ce `res.ok` un 500 laissait le service allumé en
 * silence. Pas de toast en revanche : on est en plein démontage, le message
 * s'afficherait sur un écran sans rapport et l'utilisateur n'aurait rien à en
 * faire — le minuteur serveur reste le filet.
 */
async function demanderExtinction(): Promise<void> {
  try {
    // `keepalive` laisse la requête survivre à la destruction du composant (et à
    // l'unload de la page) ; `sendBeacon` ne conviendrait pas, il ne sait pas
    // porter l'en-tête Authorization exigé par /api/gmaps/scale-down.
    const res = await authedFetch(`/api/gmaps/scale-down`, {
      method: "POST",
      keepalive: true,
    });
    if (!res.ok) {
      console.warn(
        `[gmaps] Extinction refusée (HTTP ${res.status}) : ${await messageErreurReponse(res)}. ` +
          "Le minuteur d'inactivité du scraper prendra le relais.",
      );
    }
  } catch (err) {
    console.warn(
      "[gmaps] Extinction injoignable ; le minuteur d'inactivité du scraper prendra le relais.",
      err,
    );
  }
}

/** Extrait un message lisible d'une réponse d'erreur de /api/gmaps/*. */
async function messageErreurReponse(res: Response): Promise<string> {
  const texte = await res.text().catch(() => "");
  try {
    const corps = JSON.parse(texte);
    if (corps && typeof corps.error === "string") return corps.error;
  } catch {
    // Réponse non JSON : on retombe sur le texte brut, tronqué.
  }
  return texte.slice(0, 200) || "réponse vide";
}

declare global {
  interface Window {
    google?: any;
  }
}

const formSchema = z
  .object({
    keyword: z.string().min(1),
    location: z.string().min(1),
    tileStep: z.enum(tileSteps),
    useMaps: z.boolean(),
    useSearch: z.boolean(),
    // ⚠️ `<Input type="number">` rend une CHAÎNE. Avec `z.number()`, Zod rejetait
    // « Expected number, received string » et le formulaire ne partait pas du
    // tout dès que « Recherche Google » était coché — sans message visible.
    // `""` (champ vidé, ou masqué après décochage) doit valoir « absent », pas NaN.
    pagesCount: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().min(1).optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.useSearch && !data.pagesCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pagesCount"],
        message: "Requis quand la recherche Google est activée",
      });
    }
  });

/**
 * Le schéma a désormais une entrée et une sortie DIFFÉRENTES : le champ
 * « nombre de pages » arrive en chaîne du DOM et ressort en nombre. C'est
 * exactement le cas prévu par le 3ᵉ générique de `useForm` — l'ignorer
 * (`useForm<FormValues>`) redonnerait un formulaire mal typé.
 */
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

export const NewSearchPage: React.FC = () => {
  const locationRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusValue | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [stats, setStats] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  /**
   * Suivi injoignable : ce N'EST PAS un échec du job. Le crawl continue côté
   * ECS ; seule notre visibilité dessus est perdue. On l'affiche comme tel et on
   * propose de reprendre, au lieu de peindre un `error` définitif sur un job
   * parfaitement sain.
   */
  const [suiviInterrompu, setSuiviInterrompu] = useState<string | null>(null);
  /** Incrémenté par « Reprendre le suivi » : relance l'effet de polling. */
  const [relanceSuivi, setRelanceSuivi] = useState(0);
  /**
   * Dernier statut connu du job, lisible depuis le nettoyage de démontage (un
   * `useState` y serait figé à sa valeur de montage). Sert à décider si l'on a
   * le droit d'accélérer l'extinction : uniquement sur un état TERMINAL.
   */
  const dernierStatutRef = useRef<JobStatusValue | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      keyword: "",
      location: "",
      tileStep: "0.1",
      useMaps: false,
      useSearch: false,
    },
  });

  const useSearch = watch("useSearch");

  useEffect(() => {
    const load = async () => {
      if (typeof window === "undefined") return;
      if (window.google && window.google.maps && window.google.maps.places) {
        init();
        return;
      }
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=fr`;
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    };
    const init = () => {
      if (!locationRef.current || !window.google?.maps?.places) return;
      const autocomplete = new window.google.maps.places.Autocomplete(
        locationRef.current,
        { types: ["(cities)"] }
      );
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const value = place.formatted_address || place.name || "";
        setValue("location", value);
      });
    };
    load();
  }, [setValue]);

  /**
   * Suivi du job.
   *
   * DEUX FAMILLES D'ÉCHEC, à ne surtout pas confondre :
   *   1. « je n'arrive pas à joindre le service » — coupure réseau, 502/504
   *      passager de Vercel, statut illisible. Le crawl, lui, tourne toujours.
   *      On espace les tentatives (backoff), on affiche « suivi interrompu » et
   *      on propose de reprendre. AUCUNE extinction, AUCUN statut d'erreur :
   *      5 sondages ratés en 15 s tuaient jusqu'ici une tâche ECS saine et
   *      affichaient `error` pour un job qui n'avait jamais échoué.
   *   2. `status: 'error'` RENVOYÉ PAR LE SERVEUR — là seulement, le job a
   *      réellement échoué.
   *
   * Le `setInterval` a laissé place à un `setTimeout` réarmé : un intervalle fixe
   * ne sait pas s'espacer, et empilait les sondages pendant les lenteurs.
   */
  useEffect(() => {
    if (!jobId) return;
    let arrete = false;
    let echecs = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arreterSuivi = () => {
      arrete = true;
      if (timer) clearTimeout(timer);
    };

    /** Échec de TRANSPORT : on n'y touche ni au statut du job, ni au service. */
    const echecTransport = (message: string) => {
      echecs += 1;
      if (echecs >= MAX_ECHECS_POLL) setSuiviInterrompu(message);
    };

    const programmer = () => {
      if (arrete) return;
      // 3 s, puis 6, 12, 24, 30, 30… tant que le service ne répond pas.
      const delai = Math.min(
        POLL_INTERVAL_MS * 2 ** echecs,
        POLL_INTERVAL_MAX_MS,
      );
      timer = setTimeout(sonder, delai);
    };

    const sonder = async () => {
      if (arrete) return;
      try {
        const res = await authedFetch(`/api/gmaps/job/${jobId}`);
        if (!res.ok) {
          echecTransport(
            `Suivi de la recherche interrompu (HTTP ${res.status}). Le crawl continue côté serveur.`,
          );
          programmer();
          return;
        }
        const brut = await res.json();
        const parse = JobStatusSchema.safeParse(brut);
        if (!parse.success) {
          echecTransport(
            "Suivi de la recherche interrompu : le scraper renvoie un statut illisible.",
          );
          programmer();
          return;
        }
        echecs = 0;
        setSuiviInterrompu(null);
        const statut = parse.data;
        dernierStatutRef.current = statut.status;
        setStatus(statut.status);
        setStats(statut);
        setJobError(statut.error);
        if (estStatutTerminal(statut.status)) {
          if (statut.status === "done") toast.success("Recherche terminée");
          else if (statut.status === "partial")
            toast.warning("Recherche terminée partiellement");
          else toast.error(statut.error ?? "La recherche a échoué");
          // On arrête de sonder, mais on N'ÉTEINT PAS : les boutons CSV/JSON
          // viennent d'apparaître et /results/:jobId lit la Map mémoire du
          // scraper, qui meurt avec la tâche. Le serveur nous laisse justement
          // une fenêtre (`POST_JOB_GRACE_MS`) pour télécharger ; l'extinction
          // n'est demandée qu'au démontage, quand l'écran de résultats — donc
          // les boutons — disparaît.
          arreterSuivi();
          return;
        }
        programmer();
      } catch {
        echecTransport(
          "Service de recherche injoignable. Le crawl continue côté serveur.",
        );
        programmer();
      }
    };

    setSuiviInterrompu(null);
    programmer();

    return arreterSuivi;
  }, [jobId, relanceSuivi]);

  /**
   * Démontage / navigation. On n'accélère l'extinction que si le job est
   * TERMINÉ : quitter la page pendant un crawl ne doit plus le tuer (le
   * nettoyage appelait `/api/gmaps/scale-down` précisément quand le job tournait
   * encore, ce qui descendait `desiredCount` à 0 en plein travail). Un crawl
   * abandonné n'est pas perdu pour autant : le minuteur d'inactivité du scraper
   * l'éteindra une fois le travail fini.
   */
  useEffect(() => {
    return () => {
      if (!estStatutTerminal(dernierStatutRef.current)) return;
      void demanderExtinction();
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    setJobError(null);
    setStats(null);
    setSuiviInterrompu(null);
    try {
      const res = await authedFetch("/api/gmaps/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // CONTRAT 3 : le scraper exige `businessTypes`, un tableau NON VIDE.
        // On envoyait `keyword` (chaîne) et il répondait 400 sans exception.
        body: JSON.stringify({
          businessTypes: [values.keyword],
          location: values.location,
          tileStep: parseFloat(values.tileStep),
          useMaps: values.useMaps,
          useSearch: values.useSearch,
          pagesCount: values.pagesCount ?? 0,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Le lancement a échoué (HTTP ${res.status}) : ${await messageErreurReponse(res)}`,
        );
      }
      // Le POST ne renvoie que `{ jobId, status }` : les compteurs viennent du
      // suivi, pas d'ici. Auparavant on lisait `data.status` sur une réponse qui
      // ne contenait qu'un jobId, d'où un statut `undefined` affiché à l'écran.
      const parse = CrawlResponseSchema.safeParse(await res.json());
      if (!parse.success) {
        throw new Error("Le scraper n'a pas renvoyé d'identifiant de job");
      }
      const data = parse.data;
      toast.info("Recherche lancée");
      dernierStatutRef.current = data.status;
      setJobId(data.jobId);
      setStatus(data.status);
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Erreur lors du lancement";
      setJobError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
        </div>
      )}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800">
          <CardHeader className="text-center">
            <CardTitle>Nouvelle Recherche</CardTitle>
            <CardDescription>
              Configurez votre recherche d'entreprises
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="keyword" className="text-gray-700 dark:text-gray-200">
                  Mot-clé
                </Label>
                <Controller
                  control={control}
                  name="keyword"
                  render={({ field }) => (
                    <Input
                      id="keyword"
                      {...field}
                      className="dark:bg-gray-900 dark:text-gray-100"
                      placeholder="ex: Restaurant, Pharmacie..."
                    />
                  )}
                />
                {errors.keyword && (
                  <p className="text-sm text-red-500">{errors.keyword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-gray-700 dark:text-gray-200">
                  Lieu
                </Label>
                <Controller
                  control={control}
                  name="location"
                  render={({ field }) => (
                    <Input
                      id="location"
                      {...field}
                      ref={(el) => {
                        locationRef.current = el;
                        field.ref(el);
                      }}
                      className="dark:bg-gray-900 dark:text-gray-100"
                      placeholder="ex: Paris, Lyon..."
                    />
                  )}
                />
                {errors.location && (
                  <p className="text-sm text-red-500">{errors.location.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tileStep" className="text-gray-700 dark:text-gray-200">
                  Précision
                </Label>
                <Controller
                  control={control}
                  name="tileStep"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="dark:bg-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Sélectionnez la précision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.1">Basique</SelectItem>
                        <SelectItem value="0.05">Moyenne</SelectItem>
                        <SelectItem value="0.02">Élevée</SelectItem>
                        <SelectItem value="0.01">Maximale</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-200">
                  Sources
                </Label>
                <div className="flex items-center justify-between">
                  <span>Google Maps</span>
                  <Controller
                    control={control}
                    name="useMaps"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Recherche Google</span>
                  <Controller
                    control={control}
                    name="useSearch"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>

              {useSearch && (
                <div className="space-y-2">
                  <Label
                    htmlFor="pagesCount"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Nombre de pages
                  </Label>
                  <Controller
                    control={control}
                    name="pagesCount"
                    render={({ field }) => (
                      <Input
                        id="pagesCount"
                        type="number"
                        min={1}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        // `z.input` type ce champ en `unknown` (il accepte la
                        // chaîne du DOM) : le rendu, lui, veut une valeur d'input.
                        value={(field.value as number | string | undefined) ?? ""}
                        // Ceinture et bretelles avec le `z.coerce` du schéma :
                        // on remonte un nombre, pas la chaîne de l'input.
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : e.target.valueAsNumber,
                          )
                        }
                        className="dark:bg-gray-900 dark:text-gray-100"
                      />
                    )}
                  />
                  {errors.pagesCount && (
                    <p className="text-sm text-red-500">
                      {errors.pagesCount.message}
                    </p>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                // Un job est « en vol » tant qu'il n'a pas atteint un état
                // TERMINAL. Ne tester que `!== "done"` bloquait le bouton à vie
                // sur un job en erreur ou partiel.
                disabled={loading || (!!jobId && !estStatutTerminal(status))}
              >
                Lancer la recherche
              </Button>
            </form>

            {jobId && (
              <div className="mt-4 space-y-4 text-center">
                <p>Statut: {status ?? "inconnu"}</p>
                {jobError && (
                  <p className="text-sm text-red-500">{jobError}</p>
                )}
                {suiviInterrompu && (
                  // Avertissement, pas erreur : le job n'a rien de cassé, c'est
                  // notre lien avec lui qui l'est.
                  <div className="space-y-2">
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {suiviInterrompu}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRelanceSuivi((n) => n + 1)}
                    >
                      Reprendre le suivi
                    </Button>
                  </div>
                )}
                {(status === "done" || status === "partial") && (
                  <div className="space-y-4">
                    <div className="space-x-4">
                      <Button
                        type="button"
                        variant="link"
                        className="underline p-0 h-auto"
                        onClick={() => downloadResults(jobId, "csv")}
                      >
                        Télécharger CSV
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        className="underline p-0 h-auto"
                        onClick={() => downloadResults(jobId, "json")}
                      >
                        Télécharger JSON
                      </Button>
                    </div>
                    {stats && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Valeur</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Entreprises trouvées</TableCell>
                            <TableCell>{stats.found}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Nouvelles lignes en base</TableCell>
                            <TableCell>{stats.inserted}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Fiches fusionnées (doublons)</TableCell>
                            <TableCell>{stats.merged}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Pages explorées</TableCell>
                            <TableCell>{stats.pages}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Tuiles parcourues</TableCell>
                            <TableCell>
                              {stats.tilesDone} / {stats.tilesTotal}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
