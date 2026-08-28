"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, RotateCcw, Loader2, SlidersHorizontal, UserPlus, Archive } from "lucide-react";
import { toast } from "sonner";
import { authedFetch } from "@/utils/authedFetch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  type FiltresExplorateur,
  type ReponseExplorateur,
  type TriExplorateur,
  TRIS,
  LABELS_SITE,
  LABELS_DEMO,
  LABELS_CA,
  LABELS_AVIS,
  LABELS_EFFECTIF,
  LABELS_SOURCE,
  LABELS_COHORTE,
  LABELS_CMS,
  ORDRE_SITE,
  ORDRE_DEMO,
  ORDRE_CA,
  ORDRE_AVIS,
  ORDRE_EFFECTIF,
  libelle,
  filtresActifs,
} from "@/lib/entreprises/explorateur";
import { PanneauFiltres } from "./PanneauFiltres";
import { TableauEntreprises } from "./TableauEntreprises";
import { Anneau, Barres, nombre, type Part } from "./graphes";

/**
 * L'explorateur d'entreprises : filtrer, voir la forme du résultat, agir.
 *
 * TROIS PARTIS PRIS.
 *
 * · UN SEUL ALLER-RETOUR. Total, répartitions et page arrivent ensemble, de la
 *   même fonction SQL, donc sur exactement le même ensemble. Deux appels
 *   séparés auraient laissé les camemberts décrire une sélection et le tableau
 *   une autre, le temps qu'ils se rattrapent.
 *
 * · LES GRAPHES SONT DES FILTRES. Cliquer une part coche le filtre
 *   correspondant. Une répartition qu'on ne peut pas cliquer force à retrouver
 *   la même case ailleurs — et personne ne le fait.
 *
 * · L'ANCIEN AFFICHAGE RESTE PENDANT LE CHARGEMENT. Sans filtre, la requête
 *   balaie 60 000 fiches et met environ deux secondes ; avec un filtre, deux
 *   cents millisecondes. Vider l'écran à chaque frappe le ferait clignoter.
 */

const TAILLES = [25, 50, 100];

const FILTRES_VIDES: FiltresExplorateur = { masquees: "exclure", archivees: "exclure" };

type Referentiel = {
  departements: { cle: string; libelle: string; n: number }[];
  agents: { id: string; nom: string; role: string }[];
  lots: { id: number; nom: string; taille: number; cree_le: string }[];
};

export function ExplorateurEntreprises() {
  const [filtres, setFiltres] = useState<FiltresExplorateur>(FILTRES_VIDES);
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(25);
  const [tri, setTri] = useState<TriExplorateur>("nom");
  const [sens, setSens] = useState<"asc" | "desc">("asc");

  const [donnees, setDonnees] = useState<ReponseExplorateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [referentiel, setReferentiel] = useState<Referentiel>({ departements: [], agents: [], lots: [] });

  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [agentChoisi, setAgentChoisi] = useState("");
  const [attribution, setAttribution] = useState(false);
  const [panneauMobile, setPanneauMobile] = useState(false);
  const [nomLot, setNomLot] = useState("");
  const [creationLot, setCreationLot] = useState(false);

  // Une requête en vol est annulée dès qu'une autre part : sans ça, la réponse
  // d'un filtre abandonné peut arriver après celle du filtre courant et
  // l'écraser.
  const enVol = useRef<AbortController | null>(null);

  const charger = useCallback(async () => {
    enVol.current?.abort();
    const controleur = new AbortController();
    enVol.current = controleur;
    setChargement(true);

    try {
      const reponse = await authedFetch("/api/entreprises/explorateur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filtres: { ...filtres, q: recherche.trim() || undefined },
          page,
          taille,
          tri,
          sens,
        }),
        signal: controleur.signal,
      });

      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(corps.error ?? `Erreur ${reponse.status}`);
      }

      setDonnees((await reponse.json()) as ReponseExplorateur);
      setErreur(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErreur(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      if (enVol.current === controleur) setChargement(false);
    }
  }, [filtres, recherche, page, taille, tri, sens]);

  // Le débounce ne sert qu'à la frappe : cocher une case doit répondre tout de
  // suite, taper trois lettres ne doit pas déclencher trois balayages.
  useEffect(() => {
    const delai = setTimeout(() => void charger(), 260);
    return () => clearTimeout(delai);
  }, [charger]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await authedFetch("/api/entreprises/explorateur/referentiel");
        if (r.ok) setReferentiel((await r.json()) as Referentiel);
      } catch {
        /* les menus resteront vides, le reste de l'écran fonctionne */
      }
    })();
  }, []);

  /** Tout changement de filtre ramène en page 1 : rester en page 40 d'un
   *  résultat qui n'en compte plus que 3 afficherait une page vide. */
  const majFiltres = useCallback((patch: Partial<FiltresExplorateur>) => {
    setFiltres((f) => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  /** Le geste des graphes : cliquer une part ajoute ou retire sa valeur. */
  const basculerListe = useCallback(
    (cle: keyof FiltresExplorateur, valeur: string) => {
      setFiltres((f) => {
        const actuel = (f[cle] as string[] | undefined) ?? [];
        const suivant = actuel.includes(valeur)
          ? actuel.filter((v) => v !== valeur)
          : [...actuel, valeur];
        return { ...f, [cle]: suivant.length ? suivant : undefined };
      });
      setPage(1);
    },
    [],
  );

  const reinitialiser = () => {
    setFiltres(FILTRES_VIDES);
    setRecherche("");
    setPage(1);
    setTri("nom");
    setSens("asc");
    setSelection(new Set());
  };

  const facettes = donnees?.facettes ?? null;
  const nbFiltres = filtresActifs(filtres) + (recherche.trim() ? 1 : 0);

  /** Transforme un dictionnaire de compteurs en parts ordonnées et libellées. */
  const parts = useCallback(
    (source: Record<string, number> | undefined, ordre: string[], labels: Record<string, string>): Part[] =>
      ordre
        .filter((cle) => (source?.[cle] ?? 0) > 0)
        .map((cle) => ({ cle, libelle: libelle(labels, cle), n: source?.[cle] ?? 0 })),
    [],
  );

  const partsSources = useMemo<Part[]>(() => {
    const s = facettes?.sources ?? {};
    return Object.keys(s)
      .sort((a, b) => s[b] - s[a])
      .map((cle) => ({ cle, libelle: libelle(LABELS_SOURCE, cle), n: s[cle] }));
  }, [facettes]);

  const partsCohortes = useMemo<Part[]>(() => {
    const s = facettes?.cohorte ?? {};
    return Object.keys(s)
      .sort((a, b) => s[b] - s[a])
      .map((cle) => ({ cle, libelle: libelle(LABELS_COHORTE, cle), n: s[cle] }));
  }, [facettes]);

  const partsTechnologie = useMemo<Part[]>(() => {
    const s = facettes?.technologie ?? {};
    return Object.keys(s)
      .sort((a, b) => s[b] - s[a])
      .map((cle) => ({ cle, libelle: libelle(LABELS_CMS, cle), n: s[cle] }));
  }, [facettes]);

  /**
   * Ce qui empêche de figer, ou null. Une seule décision, lue par le bouton,
   * son infobulle et la phrase sous la barre : sans ça, les trois se
   * contrediraient au premier changement de plafond.
   */
  const lotImpossible = useMemo<string | null>(() => {
    if (selection.size > 0) {
      return selection.size > 500
        ? "Un lot se fige avec 500 entreprises cochées au maximum. Sans rien cocher, on peut en figer 20 000 d'un coup."
        : null;
    }
    const total = donnees?.total ?? 0;
    if (total === 0) return "Ce résultat est vide.";
    if (total > 20_000)
      return `${nombre(total)} entreprises : au-delà de 20 000, ce n'est plus un lot de travail mais un backfill. Resserre les filtres.`;
    if (nbFiltres === 0)
      return "Sans aucun filtre, le lot prendrait tout le parc. Choisis au moins un critère.";
    return null;
  }, [selection.size, donnees?.total, nbFiltres]);

  const attribuer = async () => {
    if (!agentChoisi || selection.size === 0) return;
    setAttribution(true);
    try {
      const r = await authedFetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_ids: [...selection], agent_id: agentChoisi }),
      });
      const corps = (await r.json().catch(() => ({}))) as {
        error?: string;
        assigned?: unknown[];
        failed?: unknown[];
      };
      if (!r.ok) throw new Error(corps.error ?? `Erreur ${r.status}`);

      const reussies = corps.assigned?.length ?? selection.size;
      const echouees = corps.failed?.length ?? 0;
      toast.success(
        `${reussies} entreprise${reussies > 1 ? "s" : ""} attribuée${reussies > 1 ? "s" : ""}` +
          (echouees > 0 ? ` — ${echouees} en échec` : ""),
      );
      setSelection(new Set());
      void charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'attribution a échoué");
    } finally {
      setAttribution(false);
    }
  };

  /**
   * Figer en lot — DEUX PORTES, et c'est la sélection qui choisit laquelle.
   *
   * Sans rien de coché, on fige TOUT LE RÉSULTAT : les filtres partent au
   * serveur, qui les résout par le même `explorateur_base_sql` que l'affichage,
   * et le compte affiché part avec eux comme garde. C'est ce qui rend un lot de
   * 34 633 fiches possible — cocher cent pages ne l'était pas.
   *
   * Avec une sélection, on fige CE QUI EST COCHÉ, en transportant les
   * identifiants. Les deux ne sont pas redondantes : la seconde sert à retirer
   * trois fiches d'un résultat qu'on a lu, et aucun jeu de filtres n'exprime
   * « ces trois-là ».
   *
   * Un lot ne retire personne du résultat courant, contrairement à
   * l'attribution : c'est une étiquette de plus, elle ne déplace rien.
   */
  const figerEnLot = async () => {
    const nom = nomLot.trim();
    if (!nom) return;

    const surSelection = selection.size > 0;
    const attendu = surSelection ? selection.size : (donnees?.total ?? 0);
    if (attendu === 0) return;

    setCreationLot(true);
    try {
      // La porte se reconnaît au champ envoyé, pas à un drapeau de mode.
      const corpsEnvoye = surSelection
        ? { nom, entrepriseIds: [...selection] }
        : { nom, filtres: { ...filtres, q: recherche.trim() || undefined }, totalAttendu: attendu };

      const r = await authedFetch("/api/entreprises/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpsEnvoye),
      });
      const corps = (await r.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        lotId?: number;
        entreprises?: number;
        totalTrouve?: number;
      };

      if (!r.ok) {
        // 409 : le monde a bougé entre l'affichage et le clic. Rien n'a été
        // créé, et l'écran doit le dire avec les DEUX nombres — « réessayez »
        // seul laisserait croire à une panne réseau.
        if (r.status === 409) {
          toast.error("La population a changé depuis l'affichage", {
            description: `L'écran annonçait ${nombre(attendu)} entreprises, il y en a maintenant ${nombre(corps.totalTrouve ?? 0)}. Rien n'a été créé — on rafraîchit, et tu revalides.`,
          });
          void charger();
          return;
        }
        if (r.status === 413) {
          toast.error("Ce lot serait trop grand", {
            description: `${nombre(corps.totalTrouve ?? attendu)} entreprises. Au-delà de 20 000, ce n'est plus un lot de travail : resserre les filtres.`,
          });
          return;
        }
        throw new Error(corps.message ?? corps.error ?? `Erreur ${r.status}`);
      }

      const taille = corps.entreprises ?? attendu;
      toast.success(`Lot « ${nom} » figé — ${nombre(taille)} entreprise${taille > 1 ? "s" : ""}`, {
        description: surSelection ? undefined : "Il est mesuré dans Prospection → Lots.",
      });
      if (corps.lotId !== undefined) {
        setReferentiel((ref) => ({
          ...ref,
          lots: [{ id: corps.lotId as number, nom, taille, cree_le: new Date().toISOString() }, ...ref.lots],
        }));
      }
      setNomLot("");
      setSelection(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La création du lot a échoué");
    } finally {
      setCreationLot(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------------------------------------------------------------- */}
      <header className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Explorateur d&apos;entreprises</h1>
            <p className="text-xs text-muted-foreground">
              {donnees ? (
                <>
                  <span className="font-medium text-foreground">{nombre(donnees.total)}</span>{" "}
                  entreprise{donnees.total > 1 ? "s" : ""}
                  {nbFiltres > 0 ? ` · ${nbFiltres} filtre${nbFiltres > 1 ? "s" : ""}` : " · aucun filtre"}
                </>
              ) : (
                "Chargement…"
              )}
            </p>
          </div>

          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(1);
              }}
              placeholder="Nom, ville, code postal, SIRET, e-mail, téléphone…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Trier
            <select
              value={tri}
              onChange={(e) => {
                setTri(e.target.value as TriExplorateur);
                setPage(1);
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              {TRIS.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSens((s) => (s === "asc" ? "desc" : "asc"))}
              className="h-8 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-muted"
              title={sens === "asc" ? "Ordre croissant" : "Ordre décroissant"}
            >
              {sens === "asc" ? "↑" : "↓"}
            </button>
          </label>

          <select
            value={taille}
            onChange={(e) => {
              setTaille(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label="Entreprises par page"
          >
            {TAILLES.map((t) => (
              <option key={t} value={t}>
                {t} / page
              </option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            onClick={reinitialiser}
            disabled={nbFiltres === 0}
            className="h-8 gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanneauMobile((p) => !p)}
            className="h-8 gap-1.5 text-xs lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtres{nbFiltres > 0 ? ` (${nbFiltres})` : ""}
          </Button>
        </div>
      </header>

      {erreur ? (
        <div className="mx-5 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {erreur}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-5 py-4">
        <aside
          className={[
            "w-[290px] shrink-0 overflow-y-auto pr-1",
            panneauMobile ? "block" : "hidden lg:block",
          ].join(" ")}
        >
          <PanneauFiltres
            filtres={filtres}
            facettes={facettes}
            departements={referentiel.departements}
            lots={referentiel.lots}
            onChange={majFiltres}
          />
        </aside>

        <main className="min-w-0 flex-1 space-y-4 overflow-y-auto">
          {/* Les répartitions — cliquables, elles filtrent. */}
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            <Anneau
              titre="État du site"
              aide="L'ambre marque les entreprises dont on a vérifié qu'elles n'ont pas de site : ce sont les meilleures cibles."
              parts={parts(facettes?.site, ORDRE_SITE, LABELS_SITE)}
              actifs={filtres.site ?? []}
              onCliquer={(cle) => basculerListe("site", cle)}
            />
            <Anneau
              titre="Site de démo"
              parts={parts(facettes?.demo, ORDRE_DEMO, LABELS_DEMO)}
              actifs={filtres.demo ?? []}
              onCliquer={(cle) => basculerListe("demo", cle)}
            />
            <Anneau
              titre="Avis Google"
              parts={parts(facettes?.avis, ORDRE_AVIS, LABELS_AVIS)}
              actifs={filtres.avis ?? []}
              onCliquer={(cle) => basculerListe("avis", cle)}
            />
            <Anneau
              titre="Chiffre d'affaires"
              aide="Le gris dit « on ne sait pas », pas « zéro » : la donnée manque sur l'immense majorité des fiches."
              parts={parts(facettes?.ca, ORDRE_CA, LABELS_CA)}
              actifs={filtres.ca ?? []}
              onCliquer={(cle) => basculerListe("ca", cle)}
            />
            <Anneau
              titre="Effectif"
              parts={parts(facettes?.effectif, ORDRE_EFFECTIF, LABELS_EFFECTIF)}
              actifs={filtres.effectif ?? []}
              onCliquer={(cle) => basculerListe("effectif", cle)}
            />
            <Anneau
              titre="Sources"
              parts={partsSources}
              actifs={filtres.sources ?? []}
              onCliquer={(cle) => basculerListe("sources", cle)}
            />
            <Anneau
              titre="Cohorte de démarchage"
              parts={partsCohortes}
              actifs={filtres.cohortes ?? []}
              onCliquer={(cle) => basculerListe("cohortes", cle)}
            />
            <Anneau
              titre="Technologie"
              aide="Détectée dans le HTML du site actuel. « Non analysé / non reconnu » couvre les deux cas — vérifier dans le tableau."
              parts={partsTechnologie}
              actifs={filtres.technologies ?? []}
              onCliquer={(cle) => basculerListe("technologies", cle)}
            />
            <Barres
              titre="Départements (15 premiers)"
              parts={(facettes?.departements ?? []).map((d) => ({
                cle: d.cle,
                libelle: d.cle,
                n: d.n,
              }))}
              actifs={filtres.departements ?? []}
              onCliquer={(cle) => basculerListe("departements", cle)}
            />
            <Barres
              titre="Villes (15 premières)"
              parts={(facettes?.villes ?? []).map((v) => ({ cle: v.cle, libelle: v.cle, n: v.n }))}
              actifs={filtres.villes ?? []}
              onCliquer={(cle) => basculerListe("villes", cle)}
            />
          </section>

          {/*
            LA BARRE D'ACTION. Elle n'apparaissait qu'avec une sélection, et
            c'est ce qui rendait un lot de 34 633 fiches impossible : il fallait
            cocher cent pages. Elle est maintenant là dès qu'il y a un résultat,
            parce que le geste par défaut n'est pas « figer ce que j'ai coché »
            mais « figer ce que je regarde ».

            L'attribution, elle, reste réservée à une sélection : mettre 34 633
            fiches dans le pipeline d'un agent n'est pas un geste qu'on veut
            rendre facile.
          */}
          {(donnees?.total ?? 0) > 0 || selection.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs font-medium text-foreground">
                {selection.size > 0 ? (
                  <>
                    {nombre(selection.size)} entreprise{selection.size > 1 ? "s" : ""} sélectionnée
                    {selection.size > 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    {nombre(donnees?.total ?? 0)} entreprise{(donnees?.total ?? 0) > 1 ? "s" : ""} dans
                    ce résultat
                  </>
                )}
              </span>

              {selection.size > 0 ? (
                <>
                  <select
                    value={agentChoisi}
                    onChange={(e) => setAgentChoisi(e.target.value)}
                    className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                    aria-label="Agent à qui attribuer"
                  >
                    <option value="">Choisir un agent…</option>
                    {referentiel.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nom} ({a.role})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={attribuer}
                    disabled={!agentChoisi || attribution || selection.size > 200}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {attribution ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Mettre dans le pipeline
                  </Button>
                  <span className="h-5 w-px shrink-0 bg-border" />
                </>
              ) : null}

              <Input
                value={nomLot}
                onChange={(e) => setNomLot(e.target.value)}
                placeholder="Nom du lot…"
                className={`h-8 w-40 text-xs${selection.size > 0 ? "" : " ml-auto"}`}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={figerEnLot}
                disabled={!nomLot.trim() || creationLot || lotImpossible !== null}
                title={lotImpossible ?? undefined}
                className="h-8 gap-1.5 text-xs"
              >
                {creationLot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                {selection.size > 0 ? "Figer la sélection" : "Figer ce résultat"}
              </Button>

              {selection.size > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelection(new Set())}
                  className="h-8 text-xs"
                >
                  Désélectionner
                </Button>
              ) : null}

              {selection.size > 200 && selection.size <= 500 ? (
                <p className="w-full text-[11px] text-destructive">
                  L&apos;attribution se fait par lots de 200 au maximum — un lot, lui, accepte
                  jusqu&apos;à 500 entreprises cochées.
                </p>
              ) : null}
              {lotImpossible ? (
                <p className="w-full text-[11px] text-destructive">{lotImpossible}</p>
              ) : null}
              {selection.size === 0 && !lotImpossible ? (
                <p className="w-full text-[11px] text-muted-foreground">
                  Le lot fige la population entière du résultat, pas la page — les filtres sont
                  rejoués en base, et le compte ci-dessus est revérifié avant que quoi que ce soit
                  ne soit créé.
                </p>
              ) : null}
            </div>
          ) : null}

          <TableauEntreprises
            lignes={donnees?.lignes ?? []}
            chargement={chargement}
            selection={selection}
            onSelection={setSelection}
            page={page}
            taille={taille}
            total={donnees?.total ?? 0}
            onPage={setPage}
          />
        </main>
      </div>
    </div>
  );
}
