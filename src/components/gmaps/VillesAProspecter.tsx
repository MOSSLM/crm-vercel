"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { SuggestionsSchema, type SuggestionVille } from "@/lib/gmaps/contract";
import { lieuDeRecherche } from "@/lib/gmaps/prospection";
import { fetchContours, projeter, type DeptGeometry } from "@/lib/carte/geo";
import { CONTOURS_URL } from "@/lib/carte/departements";
import { placerEtiquettes, type EtiquetteCommune } from "@/lib/carte/communes";

/**
 * Où aller chercher ensuite.
 *
 * Le formulaire de recherche part d'une page blanche : il faut savoir de
 * mémoire quelle ville n'a pas encore été ratissée, et cette mémoire n'existe
 * pas — 34 875 communes, 484 de plus de 20 000 habitants, et un historique de
 * recherches que personne ne relit. Ces cartes répondent à la question à la
 * place de l'opérateur, à partir de ce qu'on a déjà : la population des
 * communes, les fiches en base, et les recherches déjà lancées.
 *
 * UN CLIC LANCE UNE RECHERCHE, ET C'EST TOUT L'INTÉRÊT
 * Le mode est celui du 80/20 : trois zones parmi les plus écartées, pas la
 * ville entière. On enfile ainsi dix villes en une soirée plutôt qu'une seule ;
 * les zones sautées restent en mémoire, et la passe complète se relance depuis
 * la carte qui porte alors la mention « survolée ».
 */

/**
 * Réglages d'un survol. Fixes et ANNONCÉS sur l'écran, plutôt que repris du
 * formulaire : une carte dont le comportement dépend d'un champ qu'on a rempli
 * plus haut ne se clique pas en confiance.
 *
 * `tileStep` 0,05° découpe une ville moyenne en cinq ou six zones — assez pour
 * que trois d'entre elles tombent loin les unes des autres. À 0,1° la plupart
 * des villes tiennent dans une seule zone, et le mode rapide n'aurait plus rien
 * à choisir.
 */
const SURVOL = { tileStep: 0.05, zones: 3 } as const;

/**
 * Villes affichées d'un coup.
 *
 * Ce n'est PAS la taille du classement : la route rend les quelques centaines
 * de villes qui manquent, l'écran n'en montre que douze à la fois. Lancer l'une
 * d'elles la retire de la liste, et la suivante du classement prend sa place
 * sans aller redemander quoi que ce soit.
 */
const TAILLE_PAGE = 12;

export type DemandeRecherche = {
  motCle: string;
  lieu: string;
  tileStep: number;
  tuilesMax: number;
};

export function VillesAProspecter({
  onLancer,
  lieuxEnFile,
}: {
  onLancer: (demande: DemandeRecherche) => void;
  /** Lieux déjà envoyés au scraper depuis cet écran, pour ne pas les relancer. */
  lieuxEnFile: ReadonlySet<string>;
}) {
  const [tag, setTag] = React.useState<string | null>(null);
  const [donnees, setDonnees] = React.useState<ReturnType<typeof SuggestionsSchema.parse> | null>(
    null,
  );
  const [chargement, setChargement] = React.useState(true);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [survol, setSurvol] = React.useState<string | null>(null);
  const [relance, setRelance] = React.useState(0);
  const [page, setPage] = React.useState(0);
  /**
   * Villes lancées depuis cet écran. Elles quittent le classement TOUT DE
   * SUITE : leurs fiches n'arriveront en base que dans plusieurs minutes, et
   * d'ici là un recalcul les reproposerait exactement comme avant.
   */
  const [lancees, setLancees] = React.useState<ReadonlySet<string>>(new Set());

  React.useEffect(() => {
    const controleur = new AbortController();
    setChargement(true);
    setErreur(null);
    const url = `/api/gmaps/suggestions${tag ? `?metier=${encodeURIComponent(tag)}` : ""}`;
    authedFetch(url, { signal: controleur.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parse = SuggestionsSchema.safeParse(await res.json());
        if (!parse.success) throw new Error("réponse illisible");
        setDonnees(parse.data);
        setChargement(false);
      })
      .catch((err) => {
        if (controleur.signal.aborted) return;
        setErreur(
          err instanceof Error ? err.message : "impossible de calculer les suggestions",
        );
        setChargement(false);
      });
    return () => controleur.abort();
  }, [tag, relance]);

  const metierCourant = donnees?.metier ?? null;

  /**
   * Le classement moins ce qui est déjà parti au scraper. C'est cette liste
   * qui glisse : retirer une ville décale toutes les suivantes d'un cran, donc
   * la place libérée en haut est reprise par le rang suivant, et la dernière
   * case de la page se remplit avec la treizième.
   */
  const disponibles = React.useMemo(() => {
    if (!donnees) return [];
    return donnees.villes.filter(
      (v) => !lancees.has(v.code) && !lieuxEnFile.has(lieuDeRecherche(v)),
    );
  }, [donnees, lancees, lieuxEnFile]);

  const pages = Math.max(1, Math.ceil(disponibles.length / TAILLE_PAGE));
  // La liste raccourcit à chaque lancement : sans ce recadrage, vider la
  // dernière page laisserait l'écran sur une page qui n'existe plus.
  const pageSure = Math.min(page, pages - 1);
  const fenetre = disponibles.slice(pageSure * TAILLE_PAGE, (pageSure + 1) * TAILLE_PAGE);

  React.useEffect(() => {
    if (page !== pageSure) setPage(pageSure);
  }, [page, pageSure]);

  /** Changer de métier change tout le classement : on repart de la première page. */
  React.useEffect(() => {
    setPage(0);
  }, [tag]);

  return (
    <section className="rprosp">
      <header className="rprosp-tete">
        <div className="rprosp-titre">
          <span className="carte-kicker">Où chercher ensuite</span>
          <h2>Villes peuplées, fiches manquantes</h2>
        </div>
        <button
          type="button"
          className="rprosp-recalc"
          onClick={() => setRelance((n) => n + 1)}
          disabled={chargement}
          title="Recalculer à partir des fiches en base"
        >
          <RefreshCw aria-hidden="true" />
          <span>Recalculer</span>
        </button>
      </header>

      {donnees && donnees.metiers.length > 0 && (
        <nav className="rprosp-metiers" aria-label="Métier recherché">
          {donnees.metiers.map((m) => (
            <button
              key={m.tag}
              type="button"
              aria-pressed={m.tag === metierCourant?.tag}
              onClick={() => setTag(m.tag)}
            >
              {m.tag}
            </button>
          ))}
        </nav>
      )}

      <p className="rprosp-explication">
        {metierCourant ? (
          <>
            Classement par écart entre ce qu'on a et ce qu'on trouve d'ordinaire&nbsp;: on
            relève <strong>{formaterDensite(donnees?.etalon.densite)}</strong> pour
            100 000 habitants sur les {nf.format(donnees?.etalon.villesCouvertes ?? 0)} villes
            déjà parcourues en <strong>{metierCourant.tag}</strong>. Les départements sont
            balayés à tour de rôle&nbsp;: une page couvre le pays, la suivante prend la
            file où elle en était.
          </>
        ) : (
          <>Lecture des fiches en base…</>
        )}
      </p>

      {donnees && donnees.total > donnees.villes.length && (
        // Le vivier dépasse ce que la route a bien voulu rendre : le dire, pour
        // qu'une dernière page ne se lise pas comme « la France est finie ».
        <p className="rprosp-alerte">
          {nf.format(donnees.total)} villes manquent au total&nbsp;; les{" "}
          {nf.format(donnees.villes.length)} premières sont classées ici.
        </p>
      )}

      {donnees?.tronque && (
        // Un plafond de lecture atteint fausserait le classement en silence :
        // des villes couvertes s'afficheraient comme vierges.
        <p className="rprosp-alerte">
          Trop de fiches à relire d'un coup&nbsp;: le classement ne porte que sur une partie
          de la base et peut proposer une ville déjà parcourue.
        </p>
      )}

      {erreur && (
        <p className="rprosp-alerte">
          Suggestions indisponibles ({erreur}). Le formulaire ci-dessus reste utilisable.
        </p>
      )}

      {chargement && !donnees && (
        <div className="rprosp-attente">
          <Loader2 aria-hidden="true" />
          <span>Croisement des communes, des fiches et des recherches passées…</span>
        </div>
      )}

      {donnees && disponibles.length === 0 && !chargement && (
        <p className="rprosp-vide">
          Plus rien à proposer en {metierCourant?.tag} au-dessus de 20 000 habitants&nbsp;:
          toutes les villes de cette taille ont été parcourues ou mises en file. Le
          formulaire reste ouvert pour viser plus petit.
        </p>
      )}

      {donnees && disponibles.length > 0 && (
        <div className="rprosp-corps">
          <CarteDesZones villes={fenetre} survol={survol} onSurvol={setSurvol} />
          <div className="rprosp-liste">
            <ol className="rprosp-grille">
              {fenetre.map((ville) => (
                <li key={ville.code}>
                  <CarteVille
                    ville={ville}
                    motCle={metierCourant?.motCle ?? ""}
                    survole={survol === ville.code}
                    onSurvol={setSurvol}
                    onLancer={(demande) => {
                      setLancees((prev) => new Set(prev).add(ville.code));
                      onLancer(demande);
                    }}
                  />
                </li>
              ))}
            </ol>

            <nav className="rprosp-pages" aria-label="Pages du classement">
              <button
                type="button"
                onClick={() => setPage((n) => Math.max(0, n - 1))}
                disabled={pageSure === 0}
                aria-label="Page précédente"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span>
                page <b>{pageSure + 1}</b> / {pages}
                <em>
                  {nf.format(disponibles.length)} ville
                  {disponibles.length >= 2 ? "s" : ""} classée
                  {disponibles.length >= 2 ? "s" : ""}
                </em>
              </span>
              <button
                type="button"
                onClick={() => setPage((n) => Math.min(pages - 1, n + 1))}
                disabled={pageSure >= pages - 1}
                aria-label="Page suivante"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </nav>
          </div>
        </div>
      )}
    </section>
  );
}

const nf = new Intl.NumberFormat("fr-FR");

function formaterDensite(densite: number | null | undefined): string {
  if (densite == null) return "aucune fiche";
  return `${nf.format(densite)} fiche${densite >= 2 ? "s" : ""}`;
}

/**
 * Une ville à prospecter.
 *
 * La jauge n'est pas décorative : c'est elle qui dit en un coup d'œil qu'une
 * ville de 886 000 habitants est à zéro, là où « 0 fiche » seul ne se compare
 * à rien.
 */
function CarteVille({
  ville,
  motCle,
  survole,
  onSurvol,
  onLancer,
}: {
  ville: SuggestionVille;
  motCle: string;
  survole: boolean;
  onSurvol: (code: string | null) => void;
  onLancer: (demande: DemandeRecherche) => void;
}) {
  // Une ville déjà survolée n'a plus besoin d'un second survol : ce qui lui
  // manque, ce sont justement les zones que la passe rapide avait sautées.
  const complete = ville.passage === "rapide";
  const couverture = ville.attendu > 0 ? Math.min(1, ville.fiches / ville.attendu) : 0;

  return (
    <button
      type="button"
      className="rprosp-carte"
      data-survole={survole ? "true" : undefined}
      data-passage={ville.passage}
      disabled={!motCle}
      onMouseEnter={() => onSurvol(ville.code)}
      onMouseLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(ville.code)}
      onBlur={() => onSurvol(null)}
      onClick={() =>
        onLancer({
          motCle,
          lieu: lieuDeRecherche(ville),
          tileStep: SURVOL.tileStep,
          // Une passe complète ne saute aucune zone : c'est ce que veut dire 0.
          tuilesMax: complete ? 0 : SURVOL.zones,
        })
      }
    >
      <span className="rprosp-carte-tete">
        <b>{ville.nom}</b>
        <em>{ville.departement}</em>
      </span>
      <span className="rprosp-hab">{nf.format(ville.population)} habitants</span>

      <span className="rprosp-jauge" aria-hidden="true">
        <i style={{ width: `${Math.round(couverture * 100)}%` }} />
      </span>
      <span className="rprosp-compte">
        <strong>
          {nf.format(ville.fiches)} fiche{ville.fiches >= 2 ? "s" : ""}
        </strong>
        <span>sur ≈ {nf.format(ville.attendu)} attendues</span>
      </span>

      <span className="rprosp-action">
        <Search aria-hidden="true" />
        {complete ? `Passe complète — toutes les zones` : `Survol — ${SURVOL.zones} zones`}
      </span>

      {ville.passage === "rapide" && (
        <span className="rprosp-badge">déjà survolée</span>
      )}
    </button>
  );
}

/**
 * Les villes proposées, posées sur la France.
 *
 * Douze noms dans une grille ne disent pas si l'on couvre le pays ou un seul
 * coin ; la même liste sur une carte le dit avant qu'on ait lu un mot. Le fond
 * de carte est un CONFORT : s'il ne charge pas, les cartes-villes restent
 * parfaitement utilisables et la vignette disparaît, sans message d'erreur.
 */
function CarteDesZones({
  villes,
  survol,
  onSurvol,
}: {
  villes: SuggestionVille[];
  survol: string | null;
  onSurvol: (code: string | null) => void;
}) {
  const L = 420;
  const H = 380;
  /**
   * Largeur laissée aux NOMS, à droite du tracé.
   *
   * Sans cette réserve, `placerEtiquettes` écartait tout nom qui dépassait du
   * cadre — mesuré : Strasbourg et Nice, les deux villes les plus à l'est,
   * perdaient leur étiquette alors qu'elles avaient toute la place voulue à
   * côté. La France est donc projetée dans un cadre plus étroit que le viewBox.
   */
  const MARGE_NOMS = 74;
  const [geometries, setGeometries] = React.useState<DeptGeometry[]>([]);

  React.useEffect(() => {
    const controleur = new AbortController();
    fetchContours(CONTOURS_URL, controleur.signal)
      .then(setGeometries)
      .catch(() => {});
    return () => controleur.abort();
  }, []);

  const { contour, pastilles, etiquettes } = React.useMemo(() => {
    if (geometries.length === 0) {
      return { contour: "", pastilles: [], etiquettes: [] as EtiquetteCommune[] };
    }
    const { projection, path } = projeter(geometries, L - MARGE_NOMS, H, 8);
    const trace = geometries.map((g) => path(g.feature) ?? "").join(" ");
    const manqueMax = Math.max(...villes.map((v) => v.manque), 1);
    const posees = villes
      .map((ville) => {
        const point = projection([ville.lon, ville.lat]);
        if (!point) return null;
        return {
          ville,
          x: point[0],
          y: point[1],
          // Racine carrée : c'est l'AIRE de la pastille qui doit suivre le
          // manque, pas son rayon — sinon Marseille écrase visuellement Nîmes
          // dans un rapport de cinq alors que l'écart réel est de un à deux.
          r: 3.2 + 5.4 * Math.sqrt(ville.manque / manqueMax),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      contour: trace,
      pastilles: posees,
      etiquettes: placerEtiquettes(
        posees.map((p) => ({
          code: p.ville.code,
          nom: p.ville.nom,
          lat: p.ville.lat,
          lon: p.ville.lon,
          population: p.ville.population,
          x: p.x + p.r + 2,
          y: p.y,
        })),
        { largeur: L, hauteur: H },
        11,
        villes.length,
      ),
    };
  }, [geometries, villes]);

  if (geometries.length === 0) return null;

  return (
    <div className="rprosp-carte-fr">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Villes proposées, situées en France">
        <path className="rprosp-fr" d={contour} />
        {pastilles.map((p) => (
          <circle
            key={p.ville.code}
            className="rprosp-pt"
            data-survole={survol === p.ville.code ? "true" : undefined}
            cx={p.x}
            cy={p.y}
            r={p.r}
            onMouseEnter={() => onSurvol(p.ville.code)}
            onMouseLeave={() => onSurvol(null)}
          >
            {/* Le Midi rassemble quatre villes proposées sur douze : quelques
                étiquettes y tombent forcément, et une pastille muette ne dit
                plus quelle ville elle désigne. */}
            <title>{`${p.ville.nom} — ${nf.format(p.ville.manque)} fiches manquantes`}</title>
          </circle>
        ))}
        {etiquettes.map((e) => (
          <text
            key={e.code}
            className="rprosp-nom"
            data-survole={survol === e.code ? "true" : undefined}
            x={e.x}
            y={e.y + 3.5}
          >
            {e.nom}
          </text>
        ))}
      </svg>
      <p className="rprosp-carte-legende">
        <MapPin aria-hidden="true" />
        Taille de la pastille&nbsp;: nombre de fiches qui manquent.
      </p>
    </div>
  );
}

export default VillesAProspecter;
