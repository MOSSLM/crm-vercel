// board-data.jsx — colour palette + demo board content (digital-studio agency).

// ── Vivid colours for sub-board card icons & table headers ──────────────────
const CARD_COLORS = [
  { id: "slate",   hex: "#697586" },
  { id: "red",     hex: "#E2552B" },
  { id: "amber",   hex: "#E0A82E" },
  { id: "yellow",  hex: "#D9C40A" },
  { id: "lime",    hex: "#6BA82E" },
  { id: "green",   hex: "#1F8A5B" },
  { id: "teal",    hex: "#0E938A" },
  { id: "cyan",    hex: "#0EA5C9" },
  { id: "blue",    hex: "#2A6FDB" },
  { id: "indigo",  hex: "#5457D6" },
  { id: "violet",  hex: "#7A5AE0" },
  { id: "fuchsia", hex: "#B5419E" },
  { id: "pink",    hex: "#DB5A8A" },
];
const CARD_HEX = Object.fromEntries(CARD_COLORS.map((c) => [c.id, c.hex]));

// ── Soft tints for note / sticky / cell backgrounds ─────────────────────────
const NOTE_COLORS = [
  { id: "paper",   bg: "#FFFFFF",  bar: "#D9D5CC" },
  { id: "butter",  bg: "#FBF3D0",  bar: "#E3CE72" },
  { id: "mint",    bg: "#DDF1E4",  bar: "#8FCBA6" },
  { id: "sky",     bg: "#DCEAFB",  bar: "#8DB6EC" },
  { id: "lavender",bg: "#E8E1FB",  bar: "#B4A2EC" },
  { id: "blush",   bg: "#FBE2E8",  bar: "#EC9FB1" },
  { id: "stone",   bg: "#F0EEE8",  bar: "#C9C5BB" },
];
const NOTE_BG  = Object.fromEntries(NOTE_COLORS.map((c) => [c.id, c.bg]));
const NOTE_BAR = Object.fromEntries(NOTE_COLORS.map((c) => [c.id, c.bar]));

// ── Breadcrumb (fil d'Ariane) — current view is a nested sub-board ──────────
const CRUMBS = [
  { id: "home",    label: "Accueil",                  home: true },
  { id: "sama",    label: "SAMA",                     color: "green" },
  { id: "clients", label: "Clients",                  color: "red" },
  { id: "lumen",   label: "Maison Lumen — Refonte",   color: "violet", current: true },
];

// ── Board content ───────────────────────────────────────────────────────────
const BOARD = {
  title: "Maison Lumen — Refonte",
  toSort: 2,
  elements: [
    // ── COLUMN A — Brief & objectifs ────────────────────────────────────────
    {
      id: "colA", type: "column", x: 48, y: 56, w: 340, accent: "violet",
      title: "Brief & objectifs", subtitle: "2 planches · 1 note",
      children: [
        { id: "a1", type: "card", icon: "doc", color: "slate",
          title: "Cahier des charges", meta: "4 planches · 6 cartes" },
        { id: "a2", type: "card", icon: "target", color: "amber",
          title: "Benchmark concurrents", meta: "12 cartes" },
        { id: "a3", type: "note", color: "paper", title: "Objectifs",
          body: "**But principal — +40% de demandes de devis.**\n\n- Refondre l'identité visuelle\n- Site responsive & rapide (`< 2s`)\n- Tunnel de contact en 2 clics\n\n> Lancement prévu *fin novembre*." },
      ],
    },

    // ── COLUMN B — Direction artistique ─────────────────────────────────────
    {
      id: "colB", type: "column", x: 420, y: 56, w: 366, accent: "fuchsia",
      title: "Direction artistique", subtitle: "1 planche · 1 lien",
      children: [
        { id: "b1", type: "link", title: "Références — Dribbble",
          url: "dribbble.com/tags/architecture-website", thumb: "fuchsia",
          desc: "Studios d'archi & marques premium · 18 shots épinglés" },
        { id: "b2", type: "note", color: "stone", title: "Ton & voix",
          body: "Épuré, chaleureux, **premium**.\n\nBeaucoup de blanc, photographie lumineuse, titres en *serif*, corps en sans-serif géométrique." },
        { id: "b3", type: "card", icon: "camera", color: "violet",
          title: "Moodboard", meta: "24 photos" },
      ],
    },

    // ── COLUMN C — Production ────────────────────────────────────────────────
    {
      id: "colC", type: "column", x: 818, y: 56, w: 340, accent: "blue",
      title: "Production", subtitle: "2 planches · 1 fichier",
      children: [
        { id: "c1", type: "todo", title: "Sprint en cours", items: [
          { id: "t1", text: "Wireframes basse-def (home + 3 pages)", done: true },
          { id: "t2", text: "Valider l'arborescence avec le client", done: true, due: "Dû le 21 oct." },
          { id: "t3", text: "Maquettes haute-def — page d'accueil", done: false, due: "Dû le 24 oct." },
          { id: "t4", text: "Intégration section hero", done: false, due: "Dû le 28 oct." },
          { id: "t5", text: "Préparer la passation dev", done: false },
        ]},
        { id: "c2", type: "card", icon: "layers", color: "blue",
          title: "Wireframes", meta: "8 cartes" },
        { id: "c3", type: "card", icon: "pen", color: "fuchsia",
          title: "Maquettes Figma", meta: "3 planches" },
        { id: "c4", type: "file", name: "Contrat_MaisonLumen.pdf", kind: "pdf",
          size: "1,2 Mo · signé", color: "red" },
      ],
    },

    // ── FREE — moodboard image cluster ───────────────────────────────────────
    {
      id: "img1", type: "image", x: 1196, y: 56, w: 320,
      title: "Références visuelles", cols: 2,
      cells: ["façade vitrée", "intérieur bois", "détail laiton", "lumière du soir"],
    },

    // ── FREE — sticky idea note ──────────────────────────────────────────────
    {
      id: "sticky1", type: "note", sticky: true, x: 1196, y: 392, w: 260, color: "butter",
      body: "💡 Idée : section **témoignages vidéo** en home — ça rassure et ça convertit." },

    // ── FREE — colour palette table ──────────────────────────────────────────
    {
      id: "tbl1", type: "table", x: 420, y: 612, w: 366,
      title: "Palette de marque", color: "violet",
      columns: ["Rôle", "Hex", "Échantillon"],
      rows: [
        [{ t: "Encre" },   { t: "#1A1714", mono: true }, { t: "", tint: "stone" }],
        [{ t: "Sable" },   { t: "#F3EEE4", mono: true }, { t: "", tint: "butter" }],
        [{ t: "Terracotta" }, { t: "#C7613A", mono: true }, { t: "", tint: "blush" }],
        [{ t: "Sauge" },   { t: "#7E9479", mono: true }, { t: "", tint: "mint" }],
      ],
    },

    // ── FREE — sub-board card cluster (3 across) ─────────────────────────────
    {
      id: "freecards", type: "cardrow", x: 818, y: 860, w: 340,
      cards: [
        { id: "f1", icon: "code", color: "green",   title: "Dev & intégration", meta: "1 carte" },
        { id: "f2", icon: "rocket", color: "cyan",   title: "Mise en ligne",      meta: "0 carte" },
        { id: "f3", icon: "megaphone", color: "amber", title: "Lancement",        meta: "2 cartes" },
      ],
    },

    // ── FREE — link preview (bottom) ─────────────────────────────────────────
    {
      id: "link2", type: "link", x: 48, y: 588, w: 340,
      title: "Maquette actuelle (Figma)", url: "figma.com/file/maison-lumen-v3",
      thumb: "blue", desc: "Prototype cliquable · dernière maj il y a 2 h" },

    // ── FREE — connecting arrow (decorative) ─────────────────────────────────
    { id: "ln1", type: "line", x1: 390, y1: 250, x2: 416, y2: 250, color: "violet" },
  ],
};

window.BoardData = { CARD_COLORS, CARD_HEX, NOTE_COLORS, NOTE_BG, NOTE_BAR, CRUMBS, BOARD };
