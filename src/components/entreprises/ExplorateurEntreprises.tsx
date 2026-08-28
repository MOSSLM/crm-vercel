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
   * Figer la sélection dans un lot nommé — une photo, pas une requête vivante
   * (voir la vision segments/lots). Contrairement à l'attribution, ça ne
   * retire pas les entreprises du résultat courant : un lot n'est qu'une
   * étiquette de plus, elle ne déplace personne.
   */
  const figerEnLot = async () => {
    const nom = nomLot.trim();
    if (!nom || selection.size === 0) return;
    setCreationLot(true);
    try {
      // `entrepriseIds`, pas `entreprise_ids` : le schéma de la route est en
      // camel, et Zod n'a pas de champ à valider quand on lui envoie l'autre —
      // il rendait 400 « Required », et cet écran était le SEUL chemin que le
      // vide de /prospection/lots proposait pour créer un lot.
      const r = await authedFetch("/api/entreprises/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, entrepriseIds: [...selection] }),
      });
      // La route rend `{ lotId, entreprises }` — pas la ligne du lot. On
      // recompose donc l'entrée du menu déroulant avec ce qu'on sait déjà :
      // le nom vient d'ici, la date est maintenant.
      const corps = (await r.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        lotId?: number;
        entreprises?: number;
      };
      if (!r.ok) throw new Error(corps.message ?? corps.error ?? `Erreur ${r.status}`);

      const taille = corps.entreprises ?? selection.size;
      toast.success(`Lot « ${nom} » créé — ${nombre(taille)} entreprise${taille > 1 ? "s" : ""}`);
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

          {/* La barre d'action de masse — n'apparaît qu'avec une sélection. */}
          {selection.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs font-medium text-foreground">
                {nombre(selection.size)} entreprise{selection.size > 1 ? "s" : ""} sélectionnée
                {selection.size > 1 ? "s" : ""}
              </span>
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
              <Input
                value={nomLot}
                onChange={(e) => setNomLot(e.target.value)}
                placeholder="Nom du lot…"
                className="h-8 w-40 text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={figerEnLot}
                disabled={!nomLot.trim() || creationLot || selection.size > 500}
                className="h-8 gap-1.5 text-xs"
              >
                {creationLot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                Figer en lot
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelection(new Set())}
                className="h-8 text-xs"
              >
                Désélectionner
              </Button>
              {selection.size > 200 ? (
                <p className="w-full text-[11px] text-destructive">
                  L&apos;attribution se fait par lots de 200 au maximum
                  {selection.size <= 500 ? " — un lot, lui, accepte jusqu'à 500 entreprises." : "."}
                </p>
              ) : null}
              {selection.size > 500 ? (
                <p className="w-full text-[11px] text-destructive">
                  Un lot se fige avec 500 entreprises au maximum.
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
