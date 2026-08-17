/**
 * L'architecture voulue du CRM, en schémas.
 *
 * Ce fichier est la source de vérité : les diagrammes vivent ici, versionnés
 * avec le code qu'ils décrivent, et non dans une conversation ou un fichier
 * perdu. La page /docs/architecture ne fait que les rendre.
 *
 * Pour en modifier un : éditer le `source` ci-dessous. La page suit.
 * Pour en ajouter un : ajouter une entrée au tableau, l'ordre du tableau est
 * l'ordre d'affichage et raconte le parcours — des sources brutes jusqu'à la
 * vente.
 */

export type ArchitectureDiagram = {
  /** Ancre d'URL et identifiant de rendu. Stable : des liens pointent dessus. */
  id: string;
  title: string;
  /** Une phrase : ce que le schéma dit, pour le lire sans le déchiffrer. */
  summary: string;
  /**
   * Sens de lecture natif du graphe. Les graphes larges (`horizontal`)
   * s'affichent pleine largeur, les hauts sont contenus.
   */
  orientation: "vertical" | "horizontal";
  source: string;
};

export const ARCHITECTURE_DIAGRAMS: ArchitectureDiagram[] = [
  {
    id: "sources-et-fusion",
    title: "Sources et fusion",
    summary:
      "Quatre sources, chacune forte sur une chose et aveugle sur une autre. La fusion produit une fiche unique où chaque donnée garde sa source, sa date et sa confiance.",
    orientation: "vertical",
    source: `flowchart TB
    B["Base brute multi-source"]

    B --> GM["Google Maps"]
    B --> GG["Recherche Google"]
    B --> PE["ProÉco"]
    B --> AD["ADEME"]

    GM --> GM1["Fort : fiche Google, téléphone, adresse, avis, site lié"]
    GM --> GM2["À enrichir : SIRET, finances, dirigeant, RGE"]

    GG --> GG1["Fort : présence web, site probable, annuaires, réseaux sociaux"]
    GG --> GG2["À enrichir : identité légale fiable, finances, données structurées"]

    PE --> PE1["Fort : métier, services, zone, réalisations, contact professionnel"]
    PE --> PE2["À enrichir : site officiel, SIRET fiable, finances, fiche Google"]

    AD --> AD1["Fort : SIRET, établissement, adresse, RGE, qualifications"]
    AD --> AD2["À enrichir : site actuel, fiche Google, mobile, décideur, finances"]

    GM1 --> F["Fusion et dédoublonnage"]
    GM2 --> F
    GG1 --> F
    GG2 --> F
    PE1 --> F
    PE2 --> F
    AD1 --> F
    AD2 --> F

    F --> C["Fiche entreprise canonique"]
    C --> T["Pour chaque donnée : valeur, source, date et confiance"]`,
  },
  {
    id: "explorateur",
    title: "L'explorateur d'entreprises",
    summary:
      "Cinq familles de filtres combinables mènent à un résultat, et le résultat mène à deux objets différents : le segment dynamique qui bouge, et le lot figé qu'on attribue.",
    orientation: "vertical",
    source: `flowchart TB
    EX["Explorateur d'entreprises"]

    EX --> ID["Identité et sources"]
    EX --> DI["Présence digitale"]
    EX --> FI["Finances et taille"]
    EX --> CO["Contacts disponibles"]
    EX --> ME["Métier, RGE et zone"]

    ID --> Q["Moteur de filtres combinables"]
    DI --> Q
    FI --> Q
    CO --> Q
    ME --> Q

    Q --> R["Résultats, compteur et aperçu"]
    R --> S["Enregistrer un segment dynamique"]
    R --> L["Créer un lot figé"]

    S --> E["Lancer un enrichissement"]
    E --> U["Mettre à jour les données"]
    U --> S

    L --> A["Attribuer à un agent"]
    A --> D["Générer démos et plaquettes"]
    D --> P["Lancer la prospection"]`,
  },
  {
    id: "boucle-enrichissement",
    title: "La boucle d'enrichissement dynamique",
    summary:
      "Chaque recherche a trois issues, pas deux : trouvé, absent, incertain. C'est ce troisième état qui envoie en vérification humaine au lieu d'écrire une fausse absence.",
    orientation: "vertical",
    source: `flowchart TB
    S["Segment : site inconnu, fiche Google inconnue, email générique"]

    S --> IA["Analyse IA et recherche contrôlée"]
    IA --> W["Recherche du site officiel"]
    IA --> G["Recherche de la fiche Google"]
    IA --> J["Recherche SIRET, dirigeant et finances"]

    W --> W1{"Résultat site"}
    W1 -->|Trouvé| WT["Site officiel enregistré"]
    W1 -->|Absent probable| WA["Absence à confirmer"]
    W1 -->|Incertain| WM["Vérification humaine"]

    G --> G1{"Résultat Google"}
    G1 -->|Fiche trouvée| GT["Fiche et données enregistrées"]
    G1 -->|Non trouvée| GA["Absence probable"]
    G1 -->|Incertain| GM["Vérification humaine"]

    WT --> U["Mise à jour de la fiche"]
    WA --> U
    WM --> U
    GT --> U
    GA --> U
    GM --> U
    J --> U

    U --> X["L'entreprise quitte automatiquement le segment initial"]
    X --> N["Elle entre dans un segment plus précis"]
    N --> B["Création d'un lot de prospection fiable"]`,
  },
  {
    id: "pyramide-qualification",
    title: "La pyramide de qualification",
    summary:
      "De la base entière jusqu'à la décision commerciale, chaque étage réduit le volume et augmente la certitude. Une décision se solde toujours en gagné, nurture daté, ou perdu.",
    orientation: "vertical",
    source: `flowchart BT
    B0["Base fusionnée : toutes les entreprises"]
    B1["Métiers prioritaires : PAC, chauffage, climatisation"]
    B2["Besoin probable : site faible ou absence de site"]
    B3["Entreprise enrichie et contactable"]
    B4["Démo et plaquette prêtes"]
    B5["Réponse, visite ou rappel demandé"]
    B6["Décision commerciale en cours"]

    B0 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> B6

    B6 --> V["Gagné"]
    B6 --> N["Nurture daté"]
    B6 --> P["Perdu"]`,
  },
  {
    id: "methode-de-contact",
    title: "La méthode de contact selon les données",
    summary:
      "Ce n'est pas le commercial qui choisit le canal, c'est la donnée disponible. Sans contact exploitable, on n'appelle pas : on enrichit d'abord.",
    orientation: "vertical",
    source: `flowchart TB
    P["Entreprise qualifiée et démo prête"]

    P --> M["Mobile disponible"]
    P --> E["Email disponible"]
    P --> F["Fixe uniquement"]
    P --> ME["Mobile et email"]
    P --> NC["Aucun contact exploitable"]

    M --> MW["WhatsApp court, démo, puis appel"]
    E --> EM["Email personnalisé avec démo, puis appel si numéro trouvé"]
    F --> AP["Appel en premier, puis récupération de l'email ou du mobile"]
    ME --> MX["WhatsApp ou email, puis appel à J+1"]
    NC --> EN["Enrichissement avant prospection"]

    MW --> S["Séquence de relance"]
    EM --> S
    AP --> S
    MX --> S`,
  },
  {
    id: "adaptation-demo",
    title: "L'adaptation de la démo selon les données",
    summary:
      "Quatre états d'information, quatre façons de fabriquer la démo. Le quatrième n'en fabrique aucune : présence inconnue signifie enrichir avant de contacter.",
    orientation: "vertical",
    source: `flowchart TB
    Q{"État des informations"}

    Q --> SW["Site existant faible"]
    Q --> NS["Sans site et informations suffisantes"]
    Q --> NI["Sans site et peu d'informations"]
    Q --> IN["Présence digitale encore inconnue"]

    SW --> D1["Reprendre logo, couleurs, services et montrer une refonte"]
    NS --> D2["Créer la marque à partir des données vérifiées"]
    NI --> D3["Nom en logotype typographique et contenu générique à confirmer"]
    IN --> D4["Enrichir avant de contacter"]

    D1 --> PR["Démo prête"]
    D2 --> PR
    D3 --> PR

    PR --> PL["Plaquette personnalisée avec capture et lien"]`,
  },
  {
    id: "sequence-commerciale",
    title: "La séquence commerciale de la semaine",
    summary:
      "Une réponse ou une visite fait basculer en priorité haute et en appel sous 24 h. Sans réaction, la cadence J+1, J+3, J+5, J+7 court jusqu'au nurture.",
    orientation: "vertical",
    source: `flowchart TB
    R["Prospect prêt et attribué"]

    R --> T0["J0 : première touche"]
    T0 --> REP{"Réponse ou visite"}

    REP -->|Oui| HOT["Priorité haute"]
    HOT --> CALL["Appel le jour même ou sous 24 h"]
    CALL --> INT{"Intérêt réel"}

    INT -->|Oui| OFF["Envoyer la plaquette et l'offre"]
    OFF --> DEC["Relance de décision sous 24 à 48 h"]
    DEC --> WIN["Gagné : 690 € HT"]
    DEC --> NUR["Pas maintenant : nurture daté"]
    DEC --> LOST["Refus clair : perdu"]

    REP -->|Non| R1["J+1 : appel"]
    R1 --> R2["J+3 : relance courte"]
    R2 --> R3["J+5 : nouvel appel"]
    R3 --> R4["J+7 ou J+14 : dernière relance"]
    R4 --> NUR`,
  },
  {
    id: "pages-a-terminer",
    title: "Les pages et éléments à terminer",
    summary:
      "Le découpage P0 / P1 / P2 : ce qui bloque la prospection dès maintenant, ce qui doit être prêt avant mercredi, et ce qui attend les premières ventes.",
    orientation: "vertical",
    source: `flowchart TB
    O["Être opérationnel cette semaine"]

    O --> P0["P0 : indispensable immédiatement"]
    O --> P1["P1 : prêt avant mercredi"]
    O --> P2["P2 : après les premières ventes"]

    P0 --> C1["Cockpit Ma journée"]
    P0 --> C2["Recherche nom et téléphone"]
    P0 --> C3["Historique et prochaine action"]
    P0 --> C4["Lots, attribution et relances"]
    P0 --> C5["Plaquette personnalisable"]

    P1 --> E1["Explorateur avec filtres"]
    P1 --> E2["Segments dynamiques"]
    P1 --> E3["Qualification sans site"]
    P1 --> E4["Enrichissement semi-automatique"]
    P1 --> E5["Visites de démo dans le CRM"]

    P2 --> A1["Scoring automatique"]
    P2 --> A2["Comparaison des cohortes"]
    P2 --> A3["Automatisations avancées"]
    P2 --> A4["Analyse détaillée GA et Clarity"]`,
  },
  {
    id: "systeme-complet",
    title: "Le système complet",
    summary:
      "La chaîne entière en une ligne : des sources aux ventes. Tous les autres schémas sont le détail d'un de ces maillons.",
    orientation: "horizontal",
    source: `flowchart LR
    S["Sources"] --> F["Fusion"]
    F --> X["Explorateur"]
    X --> E["Enrichissement"]
    E --> Q["Qualification"]
    Q --> B["Lots"]
    B --> D["Démos"]
    D --> P["Prospection"]
    P --> R["Relances"]
    R --> V["Ventes"]`,
  },
];

export function getDiagram(id: string): ArchitectureDiagram | undefined {
  return ARCHITECTURE_DIAGRAMS.find((d) => d.id === id);
}
