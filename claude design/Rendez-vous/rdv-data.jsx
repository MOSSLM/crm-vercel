// rdv-data.jsx — données de démonstration du module Rendez-vous (Cal.SAMA)
const RV_HOSTS = [
  { id: "u1", n: "Jean Moss", role: "admin", u: "jean", c: "#E2552B", job: "Fondateur" },
  { id: "u2", n: "Sofia Kadri", role: "agent", u: "sofia", c: "#3B7DD8", job: "Business dev" },
  { id: "u3", n: "Malik Oueslati", role: "agent", u: "malik", c: "#7A5AE0", job: "Business dev" },
  { id: "u4", n: "Léa Vasseur", role: "agent", u: "lea", c: "#2E9E6B", job: "Business dev" },
  { id: "u5", n: "Hugo Ferrand", role: "admin", u: "hugo", c: "#C8881F", job: "Closer" },
];
const rvHost = id => RV_HOSTS.find(h => h.id === id) || RV_HOSTS[0];
const rvInit = n => n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

const RV_LOC = {
  google_meet: { lb: "Google Meet", ic: "video" },
  zoom: { lb: "Zoom", ic: "video" },
  teams: { lb: "Microsoft Teams", ic: "video" },
  phone: { lb: "Appel téléphonique", ic: "phone" },
  in_person: { lb: "En présentiel", ic: "mappin" },
  custom: { lb: "À définir", ic: "info" },
};

const RV_TYPES = [
  {
    id: "et1", slug: "appel-decouverte", title: "Appel découverte", dur: 15, interval: 15, loc: "phone",
    color: "#E2552B", active: true, mode: "solo", confirm: false, price: null, buffer: [0, 5], notice: 120,
    window: 21, maxDay: 8, maxWeek: 30, reminders: [1440, 60], bookings30: 42, conv: 61,
    desc: "Un premier appel court pour comprendre votre activité et voir si on peut vous aider.",
    questions: [{ id: "q1", label: "Votre site actuel (si vous en avez un)", type: "text", required: false }],
  },
  {
    id: "et2", slug: "audit-visibilite", title: "Audit visibilité web", dur: 30, interval: 30, loc: "google_meet",
    color: "#3B7DD8", active: true, mode: "solo", confirm: false, price: null, buffer: [5, 10], notice: 240,
    window: 30, maxDay: 5, maxWeek: 18, reminders: [1440, 60], bookings30: 28, conv: 48,
    desc: "On partage l'écran : positionnement Google, avis, concurrence locale, et les 3 leviers prioritaires.",
    questions: [
      { id: "q1", label: "Site web ou fiche Google", type: "text", required: true },
      { id: "q2", label: "Votre zone d'intervention", type: "text", required: true },
      { id: "q3", label: "Comment nous avez-vous connus ?", type: "select", required: false, options: ["Appel", "Recommandation", "Google", "LinkedIn", "Autre"] },
    ],
  },
  {
    id: "et3", slug: "presentation-devis", title: "Présentation du devis", dur: 45, interval: 15, loc: "google_meet",
    color: "#2E9E6B", active: true, mode: "solo", confirm: true, price: null, buffer: [10, 10], notice: 720,
    window: 21, maxDay: 3, maxWeek: 12, reminders: [2880, 1440, 60], bookings30: 19, conv: 72,
    desc: "On déroule la proposition ensemble, on ajuste le périmètre et on cale le planning de production.",
    questions: [
      { id: "q1", label: "Qui sera présent de votre côté ?", type: "text", required: false },
      { id: "q2", label: "Points à absolument couvrir", type: "textarea", required: false },
    ],
  },
  {
    id: "et4", slug: "premier-echange", title: "Premier échange", dur: 20, interval: 20, loc: "phone",
    color: "#7A5AE0", active: true, mode: "rr", confirm: false, price: null, buffer: [0, 5], notice: 60,
    window: 14, maxDay: 12, maxWeek: 45, reminders: [1440], bookings30: 64, conv: 39,
    rr: ["u2", "u3", "u4"], desc: "Réparti automatiquement entre les commerciaux disponibles, à tour de rôle.",
    questions: [{ id: "q1", label: "Votre besoin en une phrase", type: "textarea", required: true }],
  },
  {
    id: "et5", slug: "comite-projet", title: "Comité de projet", dur: 45, interval: 30, loc: "google_meet",
    color: "#C8881F", active: true, mode: "col", confirm: false, price: null, buffer: [5, 5], notice: 1440,
    window: 45, maxDay: 2, maxWeek: 6, reminders: [1440, 60], bookings30: 11, conv: 88,
    col: ["u1", "u5", "u4"], desc: "Point d'avancement avec toute l'équipe projet — n'apparaît que si tout le monde est libre.",
    questions: [{ id: "q1", label: "Sujets à l'ordre du jour", type: "textarea", required: true }],
  },
  {
    id: "et6", slug: "visite-technique", title: "Visite technique sur site", dur: 60, interval: 60, loc: "in_person",
    color: "#B5322F", active: true, mode: "solo", confirm: true, price: null, buffer: [45, 45], notice: 2880,
    window: 30, maxDay: 2, maxWeek: 6, reminders: [2880, 1440], bookings30: 7, conv: 81,
    desc: "Relevé sur place avant chiffrage. Prévoir un accès aux locaux et 1 h de disponibilité.",
    questions: [
      { id: "q1", label: "Adresse complète du site", type: "textarea", required: true },
      { id: "q2", label: "Étage / code d'accès", type: "text", required: false },
      { id: "q3", label: "Téléphone sur place", type: "phone", required: true },
    ],
  },
  {
    id: "et7", slug: "signature-lancement", title: "Signature & lancement", dur: 30, interval: 30, loc: "google_meet",
    color: "#8A877F", active: false, mode: "solo", confirm: false, price: null, buffer: [0, 0], notice: 480,
    window: 21, maxDay: 4, maxWeek: 12, reminders: [1440], bookings30: 0, conv: 0,
    desc: "Signature électronique, kick-off et remise des accès.", questions: [],
  },
];
const rvType = id => RV_TYPES.find(t => t.id === id);

const RV_BK = [
  { id: "b1", et: "et2", host: "u1", st: "confirmed", d: "auj.", day: "Mer 29 juil.", h: "09:30", dur: 30, nm: "Karim Belhadj", org: "Belhadj Rénovation", mail: "k.belhadj@belhadj-reno.fr", tel: "06 41 22 87 03", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2481" },
  { id: "b2", et: "et1", host: "u2", st: "confirmed", d: "auj.", day: "Mer 29 juil.", h: "11:00", dur: 15, nm: "Sandra Oliveira", org: "Atelier Oliveira", mail: "contact@atelier-oliveira.fr", tel: "07 66 91 44 12", src: "agent", tz: "Europe/Paris", meet: false, crm: "OPP-2503" },
  { id: "b3", et: "et3", host: "u1", st: "pending", d: "auj.", day: "Mer 29 juil.", h: "14:30", dur: 45, nm: "Thomas Régnier", org: "Régnier Toiture", mail: "t.regnier@regnier-toiture.com", tel: "06 12 78 33 90", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2466" },
  { id: "b4", et: "et4", host: "u3", st: "confirmed", d: "auj.", day: "Mer 29 juil.", h: "16:00", dur: 20, nm: "Yasmine Cherif", org: "YC Immobilier", mail: "y.cherif@yc-immo.fr", tel: "06 88 04 51 77", src: "embed", tz: "Europe/Brussels", meet: false, crm: "OPP-2510" },
  { id: "b5", et: "et6", host: "u1", st: "pending", d: "demain", day: "Jeu 30 juil.", h: "08:30", dur: 60, nm: "Pascal Nguyen", org: "Nguyen Menuiserie", mail: "p.nguyen@nguyen-menuiserie.fr", tel: "06 34 90 12 45", src: "public", tz: "Europe/Paris", meet: false, crm: "OPP-2477" },
  { id: "b6", et: "et2", host: "u4", st: "confirmed", d: "demain", day: "Jeu 30 juil.", h: "10:00", dur: 30, nm: "Élodie Marchand", org: "Cabinet Marchand", mail: "e.marchand@cabinet-marchand.fr", tel: "07 12 55 68 21", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2512" },
  { id: "b7", et: "et5", host: "u1", st: "confirmed", d: "demain", day: "Jeu 30 juil.", h: "15:00", dur: 45, nm: "Comité — Groupe Vasseur", org: "Groupe Vasseur", mail: "direction@groupe-vasseur.fr", tel: "01 45 22 09 88", src: "agent", tz: "Europe/Paris", meet: true, crm: "PRJ-118" },
  { id: "b8", et: "et1", host: "u2", st: "confirmed", d: "ven.", day: "Ven 31 juil.", h: "09:15", dur: 15, nm: "Damien Roux", org: "Roux Électricité", mail: "d.roux@roux-elec.fr", tel: "06 77 41 09 63", src: "agent", tz: "Europe/Paris", meet: false, crm: "OPP-2515" },
  { id: "b9", et: "et3", host: "u5", st: "confirmed", d: "ven.", day: "Ven 31 juil.", h: "11:30", dur: 45, nm: "Nadia Lambert", org: "Lambert & Filles", mail: "n.lambert@lambertetfilles.fr", tel: "06 29 83 17 40", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2489" },
  { id: "b10", et: "et4", host: "u4", st: "pending", d: "ven.", day: "Ven 31 juil.", h: "14:00", dur: 20, nm: "Bruno Sartori", org: "Sartori Paysage", mail: "b.sartori@sartori-paysage.fr", tel: "07 81 30 55 02", src: "embed", tz: "Europe/Paris", meet: false, crm: "OPP-2517" },
  { id: "b11", et: "et2", host: "u3", st: "pending", d: "lun.", day: "Lun 3 août", h: "09:00", dur: 30, nm: "Sophie Aubert", org: "Aubert Immobilier", mail: "s.aubert@aubert-immo.fr", tel: "06 55 71 28 94", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2520" },
  { id: "b12", et: "et1", host: "u2", st: "cancelled", d: "hier", day: "Mar 28 juil.", h: "10:30", dur: 15, nm: "Olivier Fabre", org: "Fabre Plomberie", mail: "o.fabre@fabre-plomberie.fr", tel: "06 90 44 12 08", src: "public", tz: "Europe/Paris", meet: false, crm: "OPP-2494", why: "Annulé par l'invité — « imprévu chantier »" },
  { id: "b13", et: "et2", host: "u1", st: "cancelled", d: "hier", day: "Mar 28 juil.", h: "16:30", dur: 30, nm: "Julien Petit", org: "JP Carrelage", mail: "j.petit@jp-carrelage.fr", tel: "07 45 90 33 21", src: "agent", tz: "Europe/Paris", meet: true, crm: "OPP-2470", why: "Reprogrammé au 5 août" },
  { id: "b14", et: "et3", host: "u1", st: "past", d: "hier", day: "Mar 28 juil.", h: "14:00", dur: 45, nm: "Marc Delaunay", org: "Delaunay Charpente", mail: "m.delaunay@delaunay-charpente.fr", tel: "06 18 72 55 30", src: "public", tz: "Europe/Paris", meet: true, crm: "OPP-2452" },
  { id: "b15", et: "et1", host: "u4", st: "past", d: "lun. 27", day: "Lun 27 juil.", h: "09:45", dur: 15, nm: "Inès Bouchard", org: "Bouchard Traiteur", mail: "i.bouchard@bouchard-traiteur.fr", tel: "07 33 68 91 05", src: "agent", tz: "Europe/Paris", meet: false, crm: "OPP-2441" },
  { id: "b16", et: "et6", host: "u5", st: "past", d: "lun. 27", day: "Lun 27 juil.", h: "14:30", dur: 60, nm: "Franck Mercier", org: "Mercier Bâtiment", mail: "f.mercier@mercier-batiment.fr", tel: "06 74 11 82 39", src: "public", tz: "Europe/Paris", meet: false, crm: "OPP-2438" },
];

const RV_STATS = {
  upcoming: 23, pending: 4, held: 61, cancelRate: 7, noShow: 3, avgNotice: "2,4 j", fillRate: 68,
  weeks: [{ w: "S26", n: 12 }, { w: "S27", n: 17 }, { w: "S28", n: 15 }, { w: "S29", n: 21 }, { w: "S30", n: 19 }, { w: "S31", n: 24 }],
  bySrc: [{ k: "Page publique", n: 41, c: "var(--info)" }, { k: "Pendant un appel", n: 34, c: "var(--accent)" }, { k: "Embed site", n: 18, c: "var(--magic)" }, { k: "Lien envoyé", n: 7, c: "var(--text-3)" }],
};

const RV_SCHEDULE = {
  tz: "Europe/Paris",
  days: [
    { iso: 1, lb: "Lundi", ranges: [[540, 750], [840, 1080]] },
    { iso: 2, lb: "Mardi", ranges: [[540, 750], [840, 1080]] },
    { iso: 3, lb: "Mercredi", ranges: [[540, 750], [840, 1020]] },
    { iso: 4, lb: "Jeudi", ranges: [[540, 750], [840, 1080]] },
    { iso: 5, lb: "Vendredi", ranges: [[540, 750]] },
    { iso: 6, lb: "Samedi", ranges: [] },
    { iso: 7, lb: "Dimanche", ranges: [] },
  ],
  busy: [{ iso: 2, r: [660, 720], lb: "Réunion prod" }, { iso: 4, r: [960, 1020], lb: "Google Cal" }],
  overrides: [
    { date: "Ven 14 août", st: "Indisponible — congés", off: true },
    { date: "Lun 17 août", st: "Indisponible — congés", off: true },
    { date: "Mar 25 août", st: "09:00 – 11:00 seulement", off: false },
  ],
};

// Créneaux page publique (août) : jour → liste d'heures
const RV_MONTH = { name: "Août 2026", first: 5, days: 31 }; // 1er août = samedi (index 5, Lun=0)
const RV_SLOTS = {
  3: ["09:00", "09:30", "10:00", "11:00", "11:30", "14:00", "14:30", "15:00", "16:30", "17:00"],
  4: ["09:30", "10:00", "10:30", "14:00", "15:30", "16:00", "17:00"],
  5: ["09:00", "10:00", "11:30", "14:30", "15:00"],
  6: ["09:00", "09:30", "11:00", "14:00", "14:30", "15:00", "16:00", "16:30", "17:30"],
  7: ["09:00", "10:30", "11:00", "11:30"],
  10: ["09:30", "10:00", "11:00", "14:00", "15:00", "15:30", "16:30"],
  11: ["09:00", "09:30", "10:00", "14:30", "16:00", "17:00"],
  12: ["10:00", "11:00", "11:30", "14:00", "15:30"],
  13: ["09:00", "09:30", "10:30", "14:00", "14:30", "16:00", "16:30", "17:00"],
  18: ["09:00", "10:00", "10:30", "14:30", "15:00", "16:00"],
  19: ["09:30", "11:00", "14:00", "15:30", "17:00"],
  20: ["09:00", "09:30", "10:00", "11:30", "14:00", "16:30"],
  21: ["09:00", "10:30", "11:00"],
  24: ["09:30", "10:00", "14:00", "14:30", "15:00", "16:00", "17:00"],
  26: ["09:00", "10:00", "11:00", "14:30", "16:30"],
  27: ["09:00", "09:30", "10:30", "14:00", "15:30", "16:00", "17:30"],
  28: ["09:00", "10:00", "11:30"],
};

// Cockpit : file d'appel + prospect en ligne
const RV_PROSPECT = {
  first: "Karim", last: "Belhadj", role: "Gérant", org: "Belhadj Rénovation", city: "Vitry-sur-Seine",
  tel: "06 41 22 87 03", mail: "k.belhadj@belhadj-reno.fr", c: "#E2552B", score: 74,
  web: "Fiche Google sans site — 41 avis, 4,6/5", offer: "Site vitrine + Google", opp: "OPP-2481",
  note: "Rappelé après devis concurrent reçu la semaine dernière.",
};
const RV_QUEUE = [
  { nm: "Karim Belhadj", org: "Belhadj Rénovation", best: "10–12 h", att: 2, hot: true, c: "#E2552B" },
  { nm: "Sonia Ferreira", org: "Ferreira Peinture", best: "14–16 h", att: 0, c: "#3B7DD8" },
  { nm: "Alexandre Roy", org: "Roy Chauffage", best: "9–10 h", att: 1, c: "#2E9E6B" },
  { nm: "Nora Haddad", org: "Haddad Décoration", best: "16–18 h", att: 0, c: "#7A5AE0" },
  { nm: "Vincent Colin", org: "Colin Serrurerie", best: "11–12 h", att: 3, c: "#C8881F" },
];
// Créneaux proposables par l'agent (5 prochains jours ouvrés)
const RV_AGENT_DAYS = [
  { lb: "Jeu", n: 30, free: 6, slots: [["11:30", 1], ["14:00", 1], ["14:30", 0], ["15:00", 1], ["16:00", 1], ["16:30", 1], ["17:30", 1]] },
  { lb: "Ven", n: 31, free: 4, slots: [["09:15", 0], ["10:00", 1], ["10:30", 1], ["11:00", 1], ["14:00", 0], ["15:30", 1]] },
  { lb: "Lun", n: 3, free: 7, slots: [["09:00", 1], ["09:30", 1], ["10:00", 1], ["11:00", 1], ["14:00", 1], ["15:00", 1], ["16:30", 1]] },
  { lb: "Mar", n: 4, free: 5, slots: [["09:30", 1], ["10:00", 1], ["10:30", 1], ["14:00", 1], ["15:30", 0], ["16:00", 1]] },
  { lb: "Mer", n: 5, free: 3, slots: [["09:00", 1], ["11:30", 1], ["14:30", 1], ["15:00", 0]] },
];

Object.assign(window, { RV_HOSTS, rvHost, rvInit, RV_LOC, RV_TYPES, rvType, RV_BK, RV_STATS, RV_SCHEDULE, RV_MONTH, RV_SLOTS, RV_PROSPECT, RV_QUEUE, RV_AGENT_DAYS });
