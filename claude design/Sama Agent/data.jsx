// data.jsx — SAMA Digital Studio · données de démonstration
// Concept : Naïma Cherif, agent commercial freelance du réseau SAMA (studio web).
// SAMA crée des SITES WEB et fait du SEO/référencement local.
// L'agent démarche des ENTREPRISES CVC (chauffagistes, frigoristes, installateurs
// PAC / clim, plombiers-chauffagistes) pour leur vendre un site ou du référencement.
// Accroche type : « votre activité tourne bien mais vous êtes invisible sur Google ».
// Objectif : décrocher un RDV de présentation, envoyer un devis, signer.
// Commission de l'agent à la signature du contrat.
// (NB : la notion de "mandant CVC" est mise de côté pour plus tard.)

const AGENT = {
  name: "Naïma Cherif",
  first: "Naïma",
  role: "Agent commercial · SAMA",
  initials: "NC",
  color: "#E2552B",
  city: "Nantes",
  since: "fév. 2026",
};

// OFFRES SAMA = ce que l'agent vend aux entreprises CVC.
// (remplace l'ancienne notion de "mandants" ; même rôle visuel = tag couleur)
const OFFERS = [
  { id: "site",    name: "Site vitrine",     focus: "Site pro 5 pages + hébergement",          tarif: "1 490 €",            color: "#E2552B", commission: 150, signes: 4, obj: 6 },
  { id: "siteseo", name: "Site + SEO local", focus: "Site vitrine + référencement Google",     tarif: "1 890 € + 90 €/mois", color: "#2B7FB8", commission: 220, signes: 3, obj: 5 },
  { id: "seo",     name: "Pack SEO local",   focus: "Référencement local (site existant)",     tarif: "150 €/mois",          color: "#6B5BD9", commission: 120, signes: 2, obj: 4 },
  { id: "gmb",     name: "Pack Google",      focus: "Fiche Google + avis + photos",            tarif: "490 € + 39 €/mois",   color: "#1F8A5B", commission: 70,  signes: 5, obj: 7 },
  { id: "refonte", name: "Refonte de site",  focus: "Modernisation d'un site obsolète",        tarif: "1 290 €",            color: "#C8881F", commission: 130, signes: 3, obj: 5 },
];
const offer = id => OFFERS.find(o => o.id === id);

// Funnel de vente de l'agent (vendre un site / du SEO)
const STAGES = [
  { id: "nouveau",  name: "Nouveau lead",  color: "#8A877F", dot: "#8A877F" },
  { id: "contacte", name: "Contacté",      color: "#2B7FB8", dot: "#2B7FB8" },
  { id: "conv",     name: "En échange",    color: "#E2552B", dot: "#E2552B" },
  { id: "interesse",name: "Intéressé",     color: "#C8881F", dot: "#C8881F" },
  { id: "rdv",      name: "RDV calé",      color: "#7A5AE0", dot: "#7A5AE0" },
  { id: "signe",    name: "Client signé",  color: "#1F8A5B", dot: "#1F8A5B" },
  { id: "perdu",    name: "Perdu",         color: "#B5322F", dot: "#B5322F" },
];
const stage = id => STAGES.find(s => s.id === id);

// ───────── Prospects = ENTREPRISES CVC démarchées par l'agent ─────────
// `org` = nom de l'entreprise CVC, `first/last` = le décideur (gérant / artisan).
// `kind` = activité + taille, `web` = situation web actuelle (l'accroche !).
// chaque prospect porte sa conversation (WhatsApp, appels, emails) avec accusés.

const PROSPECTS = [
  {
    id: "p1", first: "Thomas", last: "Lefèvre", role: "Gérant", org: "Clim'Ouest", kind: "Installateur PAC & clim · 4 salariés",
    city: "Angers", phone: "+33 6 12 84 39 22", email: "contact@climouest.fr",
    offer: "refonte", status: "rdv", score: 88, last_touch: "il y a 14 min", hot: true,
    web: "Site fait en 2016, pas responsive, invisible sur Google.",
    note: "Décide vite, sensible au rendu mobile. Veut voir une maquette avant de signer. Gros bouche-à-oreille mais 0 lead web.",
    rdv: { when: "jeu. 22 mai · 10:30", where: "présentation maquette — atelier Angers" },
    thread: [
      { day: "Lun. 12 mai", t: "event", icon: "flag", label: "Lead ajouté — annuaire CVC · campagne « sites artisans 49 »" },
      { day: "Lun. 12 mai", t: "call", dir: "out", outcome: "voicemail", time: "09:14", note: "Messagerie — message court laissé" },
      { day: "Lun. 12 mai", t: "wa", dir: "out", time: "09:21", status: "read",
        text: "Bonjour M. Lefèvre, Naïma de SAMA (studio web). J'ai regardé Clim'Ouest : super activité, mais votre site ne s'affiche pas bien sur mobile et n'apparaît pas quand on tape « installateur PAC Angers ». Auriez-vous 5 min cette semaine ?" },
      { day: "Lun. 12 mai", t: "wa", dir: "in", time: "11:48",
        text: "Bonjour, c'est vrai qu'il est vieux ce site, on l'a fait en 2016. Vous proposez quoi exactement ?" },
      { day: "Lun. 12 mai", t: "wa", dir: "out", time: "11:55", status: "read",
        text: "On refait un site moderne + on vous positionne sur Google local (les recherches « chauffagiste / PAC près de chez moi »). Je vous envoie 2 sites qu'on a faits pour des installateurs, vous me dites ?" },
      { day: "Mar. 13 mai", t: "email", dir: "out", time: "08:30", subject: "Clim'Ouest — refonte site + SEO local · 2 exemples",
        preview: "Bonjour Thomas, voici 2 sites réalisés pour des installateurs CVC + une simulation de votre visibilité Google…",
        opens: 3, clicked: true, link: "exemples-sama.pdf", replied: true },
      { day: "Mar. 13 mai", t: "event", icon: "eye", label: "A ouvert l'email · 3 fois — dont 1 sur mobile" },
      { day: "Mar. 13 mai", t: "event", icon: "link", label: "A cliqué sur les exemples · 2 min de lecture" },
      { day: "Mer. 14 mai", t: "wa", dir: "in", time: "14:02",
        text: "C'est exactement ce qu'il me faut. Vous pouvez passer me montrer une maquette ? Jeudi matin je suis à l'atelier." },
      { day: "Mer. 14 mai", t: "call", dir: "out", outcome: "answered", dur: "6 min 12", time: "14:20",
        note: "Calé un RDV présentation maquette jeudi 10h30 à l'atelier. Veut voir le rendu mobile + le devis. Très motivé." },
      { day: "Mer. 14 mai", t: "event", icon: "calendar", label: "RDV présentation calé · jeu. 22 mai 10:30 — Angers" },
      { day: "Aujourd'hui", t: "wa", dir: "out", time: "08:40", status: "read",
        text: "Bonjour Thomas, petit rappel pour demain 10h30. J'arrive avec la maquette de votre nouveau site + l'audit Google. À demain !" },
      { day: "Aujourd'hui", t: "wa", dir: "in", time: "09:02", text: "Parfait, à demain 👍" },
    ],
  },
  {
    id: "p2", first: "Karim", last: "Benali", role: "Dirigeant", org: "ThermiPro Chauffage", kind: "Chaudières & PAC · 8 personnes",
    city: "Rennes", phone: "+33 6 24 71 88 04", email: "k.benali@thermipro.fr",
    offer: "siteseo", status: "interesse", score: 74, last_touch: "il y a 1 h", hot: true,
    web: "Aucun site, juste une page Facebook peu suivie.",
    note: "Sait qu'il rate des clients en ligne. Veut un site + être trouvé sur Google. Budget à caler après la grosse saison.",
    thread: [
      { day: "Jeu. 8 mai", t: "event", icon: "flag", label: "Lead importé — campagne « chauffagistes 35 sans site »" },
      { day: "Jeu. 8 mai", t: "email", dir: "out", time: "09:10", subject: "ThermiPro — vous n'apparaissez pas sur Google",
        preview: "Bonjour M. Benali, en cherchant « chauffagiste Rennes » votre entreprise n'apparaît nulle part…", opens: 1, clicked: false },
      { day: "Ven. 9 mai", t: "call", dir: "out", outcome: "answered", dur: "4 min 02", time: "10:30",
        note: "Conscient du problème. N'a qu'un Facebook. Demande un devis site + SEO. Décide après la saison (mi-juin)." },
      { day: "Lun. 12 mai", t: "email", dir: "out", time: "11:00", subject: "Devis indicatif — site vitrine + SEO local ThermiPro",
        preview: "Comme convenu, le détail de l'offre site + référencement + un avant/après de visibilité…", opens: 4, clicked: true, link: "devis-thermipro.pdf" },
      { day: "Lun. 12 mai", t: "event", icon: "link", label: "A cliqué sur le devis · ouvert 4 fois" },
      { day: "Aujourd'hui", t: "wa", dir: "out", time: "08:15", status: "read",
        text: "Bonjour Karim, avez-vous pu regarder le devis ? Je peux vous montrer en 15 min à quoi ressemblerait votre site + votre position Google. Un créneau cette semaine ?" },
      { day: "Aujourd'hui", t: "wa", dir: "in", time: "09:40",
        text: "Oui ça reste raisonnable. Voyons-nous, mais après le 16 (fin de la grosse saison). Vendredi 14h ?" },
    ],
  },
  {
    id: "p3", first: "Sophie", last: "Marchand", role: "Co-gérante", org: "AirConfort", kind: "Clim tertiaire · artisan",
    city: "Vannes", phone: "+33 6 84 39 12 56", email: "contact@airconfort-vannes.fr",
    offer: "seo", status: "conv", score: 58, last_touch: "il y a 2 h",
    web: "A un site correct mais en 2e page Google, très peu d'appels entrants.",
    note: "Le site existe mais ne rapporte rien. Décideur = son associé (M. Riou). Sophie fait le relais.",
    thread: [
      { day: "Mer. 14 mai", t: "event", icon: "flag", label: "Lead — campagne « SEO installateurs clim 56 »" },
      { day: "Mer. 14 mai", t: "wa", dir: "out", time: "10:05", status: "read",
        text: "Bonjour Sophie, Naïma de SAMA. Votre site AirConfort est joli mais il n'arrive qu'en 2e page Google sur « clim Vannes » — du coup peu de monde le voit. Ça vous parle ?" },
      { day: "Mer. 14 mai", t: "wa", dir: "in", time: "10:40",
        text: "Bonjour, honnêtement oui, on a payé un site mais on n'a quasi aucun appel via internet. C'est mon associé qui gère le budget." },
      { day: "Mer. 14 mai", t: "wa", dir: "out", time: "10:44", status: "read",
        text: "Je comprends. Je vous fais un audit SEO gratuit : je vous montre noir sur blanc pourquoi vous ne ressortez pas et combien d'appels vous loupez. M. Riou serait dispo quand ?" },
      { day: "Jeu. 15 mai", t: "call", dir: "out", outcome: "voicemail", time: "16:10", note: "Messagerie — rappel demandé" },
      { day: "Aujourd'hui", t: "wa", dir: "out", time: "11:30", status: "read",
        text: "Rebonjour Sophie 🙂 avez-vous pu en parler à M. Riou ? Je peux bloquer un créneau visio jeudi pour présenter l'audit, sans engagement." },
      { day: "Aujourd'hui", t: "event", icon: "clock", label: "Message lu il y a 38 min — pas encore de réponse" },
    ],
  },
  {
    id: "p4", first: "Mehdi", last: "Daoudi", role: "Gérant", org: "Daoudi Génie Climatique", kind: "Frigoriste & clim · 5 salariés",
    city: "Nantes", phone: "+33 6 92 18 47 11", email: "m.daoudi@daoudi-clim.fr",
    offer: "site", status: "interesse", score: 80, last_touch: "il y a 32 min", hot: true,
    web: "Aucune présence web, que du bouche-à-oreille.",
    note: "A demandé un devis chiffré pour un premier site. A ouvert le devis 3 fois ce matin. Veut aller vite.",
    thread: [
      { day: "Mar. 13 mai", t: "call", dir: "out", outcome: "answered", dur: "3 min 48", time: "11:20",
        note: "Que du bouche-à-oreille, aucun site. Intéressé par un site vitrine pour rassurer les nouveaux clients. Veut un prix vite." },
      { day: "Mar. 13 mai", t: "wa", dir: "out", time: "11:35", status: "read",
        text: "Comme promis Mehdi, je vous prépare un devis SAMA pour un site vitrine pro (présentation, services, formulaire de contact). Vous le recevez demain matin." },
      { day: "Mer. 14 mai", t: "email", dir: "out", time: "08:50", subject: "Devis — site vitrine Daoudi Génie Climatique",
        preview: "Bonjour Mehdi, voici 2 formules (site simple / site + fiche Google) avec délais de mise en ligne…", opens: 3, clicked: true, link: "devis-daoudi.pdf" },
      { day: "Aujourd'hui", t: "event", icon: "eye", label: "A ouvert le devis · 3 fois entre 8h05 et 8h40" },
      { day: "Aujourd'hui", t: "wa", dir: "in", time: "08:44",
        text: "Ok la formule 2 me va (site + Google). Faut juste que je voie le délai de mise en ligne." },
      { day: "Aujourd'hui", t: "wa", dir: "out", time: "08:52", status: "delivered",
        text: "Top 👍 Je vous propose un RDV de lancement avec SAMA pour valider les textes et les photos. Lundi 16h ou mardi 9h ?" },
    ],
  },
  {
    id: "p5", first: "Julien", last: "Le Gall", role: "Artisan", org: "Le Gall Plomberie-Chauffage", kind: "Artisan seul",
    city: "Saint-Nazaire", phone: "+33 6 13 92 04 71", email: "legall.chauffage@gmail.com",
    offer: "gmb", status: "contacte", score: 40, last_touch: "hier",
    web: "Fiche Google vide, 0 avis, pas de site.",
    note: "A rempli un formulaire « être visible sur Google ». Sur les chantiers la journée, joignable plutôt le soir.",
    thread: [
      { day: "Lun. 12 mai", t: "event", icon: "globe", label: "Formulaire web rempli — « être visible sur Google » (Pack Google)" },
      { day: "Lun. 12 mai", t: "call", dir: "out", outcome: "missed", time: "14:30", note: "Pas de réponse — sur chantier" },
      { day: "Lun. 12 mai", t: "sms", dir: "out", time: "14:33", status: "delivered",
        text: "Bonjour Julien, Naïma de SAMA suite à votre demande pour être visible sur Google. Quel est le meilleur moment pour vous joindre ? Bonne journée." },
      { day: "Hier", t: "call", dir: "out", outcome: "missed", time: "18:05", note: "Toujours pas de réponse — à retenter le soir" },
      { day: "Hier", t: "wa", dir: "out", time: "18:07", status: "delivered",
        text: "Rebonjour Julien, je retente ce soir : une fiche Google bien remplie + des avis, c'est souvent les premiers appels en quelques jours. Dites-moi un créneau et je m'adapte 🙂" },
    ],
  },
  {
    id: "p6", first: "Patrick", last: "Hervé", role: "Gérant", org: "Hervé Chauffage", kind: "Chauffagiste · 3 personnes",
    city: "Cholet", phone: "+33 6 78 22 39 41", email: "p.herve@herve-chauffage.fr",
    offer: "site", status: "contacte", score: 35, last_touch: "il y a 3 j",
    web: "Site fait par un neveu en 2014, à l'abandon.",
    note: "Très pris le matin sur les dépannages — rappeler après 15h. Sait que son site fait « amateur ».",
    thread: [
      { day: "Mar. 13 mai", t: "call", dir: "out", outcome: "voicemail", time: "09:05", note: "Messagerie pro — rappel après 15h" },
      { day: "Mar. 13 mai", t: "email", dir: "out", time: "09:12", subject: "Un site pro pour Hervé Chauffage",
        preview: "Bonjour M. Hervé, votre site actuel date un peu — voici à quoi pourrait ressembler un site moderne…", opens: 0, clicked: false },
      { day: "Il y a 3 j", t: "event", icon: "clock", label: "Email non ouvert — relance à programmer" },
    ],
  },
  {
    id: "p7", first: "Aurélie", last: "Costa", role: "Resp. développement", org: "Costa Énergies", kind: "PAC & solaire · 12 personnes",
    city: "Rennes", phone: "+33 6 47 81 33 02", email: "a.costa@costa-energies.fr",
    offer: "siteseo", status: "interesse", score: 76, last_touch: "il y a 2 j", hot: true,
    web: "Site vieillissant, veut générer plus de demandes de devis en ligne.",
    note: "Devis site + SEO envoyé. Attend la validation de la direction. Bon contact, comprend l'intérêt du web.",
    thread: [
      { day: "Ven. 9 mai", t: "wa", dir: "out", time: "10:00", status: "read",
        text: "Bonjour Aurélie, Naïma de SAMA. Avec 12 personnes vous avez de la capacité, mais votre site génère peu de demandes — on peut transformer ça en machine à devis. Je vous explique ?" },
      { day: "Ven. 9 mai", t: "wa", dir: "in", time: "10:32",
        text: "Bonjour, oui c'est exactement notre sujet : on veut plus de demandes entrantes. Que proposez-vous ?" },
      { day: "Lun. 12 mai", t: "email", dir: "out", time: "09:00", subject: "Devis — nouveau site + SEO local Costa Énergies",
        preview: "Voici l'offre site + référencement, avec un objectif de demandes de devis par mois et le planning…", opens: 2, clicked: true, link: "devis-costa.pdf", replied: true },
      { day: "Il y a 2 j", t: "wa", dir: "in", time: "15:20",
        text: "Merci c'est clair et l'objectif de leads me parle. Il faut que je valide avec la direction, je reviens vers vous très vite." },
      { day: "Il y a 2 j", t: "wa", dir: "out", time: "15:24", status: "read",
        text: "Parfait Aurélie. Je vous relance vendredi si je n'ai pas de nouvelles — et je vous garde un créneau de lancement prioritaire 👍" },
    ],
  },
  {
    id: "p8", first: "Nicolas", last: "Quéré", role: "Co-gérant", org: "Quéré Frigorifique", kind: "Froid commercial · 6 personnes",
    city: "Brest", phone: "+33 6 19 04 27 88", email: "n.quere@quere-froid.fr",
    offer: "siteseo", status: "signe", score: 90, last_touch: "il y a 5 j",
    web: "Signé : nouveau site + SEO local en cours de production chez SAMA.",
    note: "A signé site + SEO. Production lancée, mise en ligne sous 3 semaines. Commission validée. Pourrait recommander des confrères.",
    thread: [
      { day: "Mar. 6 mai", t: "call", dir: "out", outcome: "answered", dur: "8 min 30", time: "11:00",
        note: "Très intéressé : veut un site sérieux + apparaître sur « froid commercial Brest ». Calé un RDV de présentation." },
      { day: "Mer. 7 mai", t: "wa", dir: "out", time: "09:00", status: "read", text: "Bonjour Nicolas, RDV confirmé lundi 12 mai 14h dans vos bureaux. J'arrive avec la maquette + le devis. Bonne journée !" },
      { day: "Lun. 12 mai", t: "event", icon: "check", label: "RDV honoré ✓ — maquette validée, devis signé sur place" },
      { day: "Il y a 5 j", t: "event", icon: "euro", label: "Contrat signé · site + SEO — commission 220 € validée" },
    ],
  },
  {
    id: "p9", first: "Inès", last: "Renaud", role: "Gérante", org: "Renaud Clim", kind: "Clim résidentiel · artisan",
    city: "Lorient", phone: "+33 6 22 89 14 06", email: "contact@renaud-clim.fr",
    offer: "gmb", status: "nouveau", score: 22, last_touch: "—",
    web: "Présence Google quasi inexistante.",
    note: "Lead salon Habitat Lorient. Pas encore contactée. Fiche Google à créer + premiers avis à collecter.",
    thread: [
      { day: "Aujourd'hui", t: "event", icon: "flag", label: "Lead salon Habitat Lorient — à contacter (Pack Google)" },
    ],
  },
  {
    id: "p10", first: "Romain", last: "Foucault", role: "Gérant", org: "Foucault Plomberie Chauffage", kind: "Plomberie-chauffage · 8 personnes",
    city: "Saint-Malo", phone: "+33 6 04 71 28 39", email: "r.foucault@foucault-pc.fr",
    offer: "refonte", status: "rdv", score: 82, last_touch: "il y a 4 j",
    web: "Site lent, mal classé. Veut une refonte avant l'été (pic de demandes clim).",
    note: "Sent qu'il loupe des clients clim l'été. RDV visio calé pour présenter la refonte + le SEO saisonnier.",
    rdv: { when: "jeu. 22 mai · 11:30", where: "visio — présentation refonte" },
    thread: [
      { day: "Jeu. 8 mai", t: "call", dir: "out", outcome: "answered", dur: "5 min 10", time: "15:30",
        note: "Site lent et mal classé. Veut refondre avant l'été pour capter les demandes de clim. Calé un point visio." },
      { day: "Ven. 9 mai", t: "email", dir: "out", time: "09:30", subject: "Foucault — refonte site avant l'été + visibilité clim",
        preview: "Bonjour M. Foucault, le récap de notre échange + un créneau de RDV visio pour présenter la refonte…", opens: 2, clicked: true, link: "recap-foucault.pdf" },
      { day: "Il y a 4 j", t: "event", icon: "calendar", label: "RDV visio calé · jeu. 22 mai 11:30" },
    ],
  },
  {
    id: "p11", first: "Hugo", last: "Pinault", role: "Artisan", org: "Pinault Chauffage", kind: "Artisan seul",
    city: "Angers", phone: "+33 6 84 21 38 47", email: "pinault.chauffage@orange.fr",
    offer: "gmb", status: "perdu", score: 12, last_touch: "il y a 6 j",
    web: "Pas de site, pas de fiche Google — et injoignable.",
    note: "4 appels sans réponse, 2 WhatsApp non lus. Dernier essai effectué — à clôturer.",
    thread: [
      { day: "Mar. 6 mai", t: "call", dir: "out", outcome: "missed", time: "10:00", note: "Pas de réponse" },
      { day: "Mer. 7 mai", t: "call", dir: "out", outcome: "missed", time: "11:30", note: "Pas de réponse" },
      { day: "Jeu. 8 mai", t: "wa", dir: "out", time: "09:00", status: "delivered", text: "Bonjour Hugo, Naïma de SAMA. Je peux vous aider à être trouvé sur Google sans site. Quel moment pour vous appeler ?" },
      { day: "Ven. 9 mai", t: "call", dir: "out", outcome: "missed", time: "17:00", note: "Pas de réponse" },
      { day: "Il y a 6 j", t: "wa", dir: "out", time: "17:02", status: "delivered", text: "Dernier essai 🙂 si être visible sur Google vous intéresse, répondez simplement OUI et je vous rappelle." },
      { day: "Il y a 6 j", t: "event", icon: "x", label: "Aucune réponse après 5 tentatives — lead clôturé (perdu)" },
    ],
  },
  {
    id: "p12", first: "Marion", last: "Tessier", role: "Gérante", org: "Tessier Génie Climatique", kind: "CVC tertiaire & industriel · 15 personnes",
    city: "La Roche-sur-Yon", phone: "+33 6 39 04 78 21", email: "m.tessier@tessier-gc.fr",
    offer: "seo", status: "conv", score: 68, last_touch: "il y a 45 min", hot: true,
    web: "Bon site mais introuvable sur les recherches « maintenance CVC industrielle ».",
    note: "Vise les contrats de maintenance B2B. Veut sortir en 1re page sur des requêtes ciblées. Devis SEO en réflexion.",
    thread: [
      { day: "Lun. 12 mai", t: "wa", dir: "out", time: "09:30", status: "read",
        text: "Bonjour Mme Tessier, Naïma de SAMA. Vous visez des contrats de maintenance CVC, mais sur « maintenance CVC industrielle Vendée » vous n'apparaissez pas — vos concurrents oui. On peut inverser ça." },
      { day: "Lun. 12 mai", t: "wa", dir: "in", time: "13:15",
        text: "Bonjour, c'est juste, on a un beau site mais on ne ressort pas sur ces mots-clés. Comment vous procédez ?" },
      { day: "Mar. 13 mai", t: "email", dir: "out", time: "10:00", subject: "SEO ciblé — « maintenance CVC industrielle » + concurrents",
        preview: "Voici les mots-clés qui rapportent dans votre secteur, votre position actuelle vs concurrents, et le plan SEO…", opens: 5, clicked: true, link: "audit-seo-tessier.pdf" },
      { day: "Mar. 13 mai", t: "event", icon: "eye", label: "A ouvert l'audit SEO · 5 fois sur 2 jours" },
      { day: "Aujourd'hui", t: "wa", dir: "in", time: "11:50",
        text: "L'audit est parlant. Je dois en discuter avec mon associé, le budget mensuel mérite réflexion." },
    ],
  },
];
const prospect = id => PROSPECTS.find(p => p.id === id);

// couleur déterministe par prospect (oklch — harmonie avec la palette)
function prospectColor(p) {
  const id = p.id || "p0";
  const hue = (id.charCodeAt(1) * 47 + (id.charCodeAt(2) || 50) * 13) % 360;
  return `oklch(58% 0.10 ${hue})`;
}
const initialsOf = p => ((p.first?.[0] || "") + (p.last?.[0] || "")).toUpperCase();

// ───────── Tâches du jour (dashboard) — chaque tâche pointe un prospect ─────────
const TODAY_TASKS = [
  { id: "k1", pid: "p1",  ch: "wa",    time: "08:40", state: "done", title: "Rappel RDV — Thomas Lefèvre", det: "Présentation maquette · Clim'Ouest — confirmé ✓" },
  { id: "k2", pid: "p4",  ch: "wa",    time: "09:30", state: "now",  title: "Relancer Mehdi Daoudi", det: "A ouvert le devis site 3× ce matin — caler le RDV de lancement" },
  { id: "k3", pid: "p2",  ch: "call",  time: "10:00", state: "next", title: "Appeler Karim Benali", det: "Devis site + SEO validé sur le principe — propose vendredi 14h" },
  { id: "k4", pid: "p3",  ch: "wa",    time: "11:00", state: "next", title: "Relancer Sophie Marchand", det: "Audit SEO gratuit lu, pas de réponse — bloquer un créneau visio" },
  { id: "k5", pid: "p10", ch: "call",  time: "11:30", state: "next", title: "Confirmer RDV — Romain Foucault", det: "Visio refonte jeudi 11h30" },
  { id: "k6", pid: "p12", ch: "call",  time: "14:00", state: "next", title: "Appeler Marion Tessier", det: "Chaude — pousser le devis SEO vers une décision (audit lu 5×)" },
  { id: "k7", pid: "p7",  ch: "email", time: "14:30", state: "next", title: "Relancer Aurélie Costa", det: "Devis site + SEO en validation direction — garder le créneau" },
  { id: "k8", pid: "p5",  ch: "call",  time: "16:30", state: "next", title: "Retenter Julien Le Gall", det: "Sur chantier en journée — tenter en fin d'après-midi (Pack Google)" },
  { id: "k9", pid: "p11", ch: "wa",    time: "17:00", state: "next", title: "Clôturer Hugo Pinault", det: "5 tentatives sans réponse — passer en perdu" },
];

// Classement réseau freelance SAMA (leaderboard)
const NETWORK = [
  { id: "n1", n: "Naïma Cherif",  r: "toi · Bretagne-Pays de Loire", rdv: 23, pct: 92, gain: 1840, c: "#E2552B", me: true },
  { id: "n2", n: "Yanis Belkacem", r: "Île-de-France",  rdv: 27, pct: 100, gain: 2210, c: "#2B7FB8" },
  { id: "n3", n: "Clara Vidal",    r: "Auvergne-RA",     rdv: 19, pct: 76,  gain: 1520, c: "#6B5BD9" },
  { id: "n4", n: "Tom Lasalle",    r: "Occitanie",       rdv: 14, pct: 56,  gain: 1180, c: "#1F8A5B" },
  { id: "n5", n: "Awa Diop",       r: "Hauts-de-France", rdv: 11, pct: 44,  gain: 920,  c: "#C8881F" },
];

// RDV pris vs objectif — 6 dernières semaines
const RDV_WEEKS = [
  { m: "S16", val: 14, obj: 16 },
  { m: "S17", val: 18, obj: 16 },
  { m: "S18", val: 15, obj: 18 },
  { m: "S19", val: 21, obj: 18 },
  { m: "S20", val: 19, obj: 20 },
  { m: "S21", val: 9,  obj: 20, partial: true },
];

// Flux de signaux récents (activité)
const SIGNALS = [
  { pid: "p4",  ic: "email", v: "a ouvert le devis", e: "Devis site vitrine (Daoudi G.C.)", det: "3ème ouverture en 35 min", t: "il y a 8 min" },
  { pid: "p1",  ic: "wa",    v: "a répondu sur WhatsApp", e: "« à demain 👍 »", det: "RDV maquette demain 10h30 confirmé", t: "il y a 14 min" },
  { pid: "p12", ic: "email", v: "a rouvert l'audit SEO", e: "« maintenance CVC industrielle »", det: "5ème ouverture · 4 min de lecture", t: "il y a 45 min" },
  { pid: "p2",  ic: "wa",    v: "propose un créneau", e: "vendredi 14h", det: "Site + SEO — décision après le 16", t: "il y a 1 h" },
  { pid: "p8",  ic: "win",   v: "a signé le contrat", e: "Quéré Frigorifique · site + SEO", det: "commission 220 € validée", t: "il y a 5 j" },
  { pid: "p3",  ic: "wa",    v: "a lu sans répondre", e: "relance audit SEO (AirConfort)", det: "lu il y a 38 min", t: "il y a 38 min" },
];

// Conversations pour l'inbox Messagerie (ordre par récence)
const INBOX_ORDER = ["p1", "p4", "p2", "p12", "p3", "p7", "p5", "p10", "p8", "p6", "p11", "p9"];

// RDV / sessions de la semaine pour le calendrier (jour 0=lundi, heures décimales)
const EVENTS_WEEK = [
  { day: 0, start: 9.0,  end: 9.5,  pid: "p2",  kind: "appel",  title: "Appel Karim Benali", loc: "Site + SEO" },
  { day: 0, start: 11.0, end: 11.5, pid: "p4",  kind: "appel",  title: "Relance Mehdi Daoudi", loc: "Devis site" },
  { day: 0, start: 14.0, end: 15.0, pid: null,  kind: "session",title: "Session phoning — artisans 44", loc: "20 leads" },
  { day: 0, start: 16.5, end: 17.0, pid: null,  kind: "interne",title: "Point hebdo SAMA", loc: "visio" },
  { day: 1, start: 9.5,  end: 10.0, pid: "p3",  kind: "appel",  title: "Relance Sophie Marchand", loc: "Pack SEO" },
  { day: 1, start: 10.5, end: 12.0, pid: null,  kind: "session",title: "Session WhatsApp — leads SEO", loc: "12 leads" },
  { day: 1, start: 14.0, end: 14.5, pid: "p7",  kind: "appel",  title: "Relance Aurélie Costa", loc: "Site + SEO" },
  { day: 2, start: 9.5,  end: 10.0, pid: "p12", kind: "appel",  title: "Appel Marion Tessier", loc: "Devis SEO" },
  { day: 2, start: 13.0, end: 14.0, pid: null,  kind: "interne",title: "Revue pipeline perso", loc: "" },
  { day: 2, start: 15.0, end: 16.5, pid: null,  kind: "session",title: "Session phoning — chauffagistes 35", loc: "18 leads" },
  { day: 3, start: 10.5, end: 11.0, pid: "p1",  kind: "rdv",    title: "RDV présentation — Lefèvre", loc: "Clim'Ouest · Angers" },
  { day: 3, start: 11.5, end: 12.0, pid: "p10", kind: "rdv",    title: "RDV refonte — Foucault", loc: "visio" },
  { day: 3, start: 14.5, end: 16.0, pid: null,  kind: "session",title: "Session Pack Google", loc: "14 leads" },
  { day: 4, start: 9.0,  end: 10.0, pid: null,  kind: "session",title: "Session relances devis", loc: "tous prospects" },
  { day: 4, start: 11.0, end: 11.5, pid: "p5",  kind: "appel",  title: "Retenter Julien Le Gall", loc: "Pack Google" },
  { day: 4, start: 14.0, end: 14.5, pid: null,  kind: "interne",title: "Récap signatures → SAMA", loc: "bilan hebdo" },
];

Object.assign(window, {
  AGENT, OFFERS, offer, STAGES, stage, PROSPECTS, prospect,
  prospectColor, initialsOf, TODAY_TASKS, NETWORK, RDV_WEEKS, SIGNALS,
  INBOX_ORDER, EVENTS_WEEK,
  // alias de compatibilité (ancienne nomenclature "mandant")
  MANDANTS: OFFERS, mandant: offer,
});
