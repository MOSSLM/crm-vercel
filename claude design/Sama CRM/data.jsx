// data.jsx — Thermalis-flavored mock data shared across screens

const TEAM = [
  { id: "u1", name: "Lucas Bernier",   role: "AE Senior",   initials: "LB", color: "#E2552B" },
  { id: "u2", name: "Sarah Mendes",    role: "AE",          initials: "SM", color: "#2B7FB8" },
  { id: "u3", name: "Karim Aït",       role: "SDR Senior",  initials: "KA", color: "#6B5BD9" },
  { id: "u4", name: "Émilie Roux",     role: "SDR",         initials: "ER", color: "#1F8A5B" },
  { id: "u5", name: "Tom Lasalle",     role: "Bureau d'études", initials: "TL", color: "#C8881F" },
];

const COMPANIES = [
  { id: "c1",  name: "Énergie Solaire 49",     city: "Angers",        sector: "Installateur PV", size: "12 sal.",  arr: "1,8M€",  pipe: "84 200 €",  contacts: 4, deals: 3, since: "2023" },
  { id: "c2",  name: "Maine ThermPro",         city: "Le Mans",       sector: "Chauffagiste",    size: "8 sal.",   arr: "920k€",  pipe: "32 100 €",  contacts: 3, deals: 1, since: "2024" },
  { id: "c3",  name: "Vendée Habitat Durable", city: "La Roche-sur-Yon", sector: "Rénovation globale", size: "24 sal.", arr: "3,1M€", pipe: "156 400 €", contacts: 6, deals: 4, since: "2022" },
  { id: "c4",  name: "Loire Eco-Travaux",      city: "Nantes",        sector: "MOA rénovation",  size: "32 sal.",  arr: "4,2M€",  pipe: "212 800 €", contacts: 7, deals: 5, since: "2021" },
  { id: "c5",  name: "Atlantique Énergie",     city: "Saint-Nazaire", sector: "PV résidentiel",  size: "6 sal.",   arr: "640k€",  pipe: "18 900 €",  contacts: 2, deals: 1, since: "2024" },
  { id: "c6",  name: "Berthet & Fils",         city: "Cholet",        sector: "Plomberie / chauf.", size: "5 sal.",   arr: "420k€",  pipe: "—",         contacts: 2, deals: 0, since: "2025" },
  { id: "c7",  name: "Domus Rénovation",       city: "Rennes",        sector: "Rénovation globale", size: "18 sal.", arr: "2,4M€", pipe: "94 600 €",  contacts: 5, deals: 2, since: "2023" },
  { id: "c8",  name: "Ouest Confort Habitat",  city: "Brest",         sector: "Multi-énergie",   size: "9 sal.",   arr: "1,1M€",  pipe: "44 200 €",  contacts: 3, deals: 2, since: "2024" },
  { id: "c9",  name: "Solvert Aménagement",    city: "Vannes",        sector: "Bureau d'études",  size: "4 sal.",   arr: "380k€",  pipe: "—",         contacts: 1, deals: 0, since: "2025" },
  { id: "c10", name: "Mayenne Toiture",        city: "Laval",         sector: "Couvreur PV",      size: "11 sal.",  arr: "1,3M€",  pipe: "67 800 €",  contacts: 4, deals: 2, since: "2023" },
];

const CONTACTS = [
  { id: "p1",  first: "Camille",  last: "Pelletier", role: "Dirigeante",          company: "Énergie Solaire 49",      email: "c.pelletier@es49.fr",          phone: "+33 6 12 84 39 22", city: "Angers",     last_touch: "il y a 3 j",  status: "actif",  src: "Salon BePositive", sequence: "Cold outbound · Solaire 69", tags: ["hot", "dirigeant"] },
  { id: "p2",  first: "Antoine",  last: "Marchais",  role: "Resp. travaux",       company: "Maine ThermPro",          email: "antoine@mainethermpro.fr",     phone: "+33 6 24 71 88 04", city: "Le Mans",    last_touch: "hier",        status: "actif",  src: "Référencement", sequence: "—",                              tags: ["decideur"] },
  { id: "p3",  first: "Léa",      last: "Bouvier",   role: "Conductrice travaux", company: "Vendée Habitat Durable",  email: "l.bouvier@vhd.fr",             phone: "+33 6 84 39 12 56", city: "La Roche-sur-Yon", last_touch: "2 sem.", status: "actif",  src: "LinkedIn", sequence: "Nurturing PME",                   tags: [] },
  { id: "p4",  first: "Mehdi",    last: "Daoudi",    role: "PDG",                 company: "Loire Eco-Travaux",       email: "m.daoudi@loire-eco.com",       phone: "+33 6 92 18 47 11", city: "Nantes",     last_touch: "il y a 5j",   status: "vip",    src: "Recommandation Lucas", sequence: "—",                  tags: ["vip", "decideur"] },
  { id: "p5",  first: "Sophie",   last: "Lemoine",   role: "Acheteuse",           company: "Atlantique Énergie",      email: "s.lemoine@atlantique-e.fr",    phone: "+33 6 13 92 04 71", city: "Saint-Nazaire", last_touch: "hier",       status: "actif",  src: "Form site web", sequence: "Démo + relance",                tags: [] },
  { id: "p6",  first: "Julien",   last: "Berthet",   role: "Dirigeant",           company: "Berthet & Fils",          email: "j.berthet@berthet-fils.fr",    phone: "+33 6 78 22 39 41", city: "Cholet",     last_touch: "10 j",        status: "qualif", src: "Cold outbound", sequence: "Cold outbound · PME 5-15",     tags: [] },
  { id: "p7",  first: "Aurélie",  last: "Costa",     role: "Resp. exploitation",  company: "Domus Rénovation",        email: "a.costa@domus-reno.fr",        phone: "+33 6 47 81 33 02", city: "Rennes",     last_touch: "il y a 2 j",  status: "actif",  src: "Webinar 18/04", sequence: "—",                            tags: ["hot"] },
  { id: "p8",  first: "Nicolas",  last: "Quéré",     role: "Co-fondateur",        company: "Ouest Confort Habitat",   email: "n.quere@ochabitat.fr",         phone: "+33 6 19 04 27 88", city: "Brest",      last_touch: "il y a 1 j",  status: "actif",  src: "Référencement",  sequence: "Démo + relance",              tags: ["decideur"] },
  { id: "p9",  first: "Inès",     last: "Vandamme",  role: "Architecte associée", company: "Solvert Aménagement",     email: "i.vandamme@solvert.com",       phone: "+33 6 22 89 14 06", city: "Vannes",     last_touch: "3 sem.",      status: "froid",  src: "LinkedIn",       sequence: "Nurturing PME",               tags: [] },
  { id: "p10", first: "Romain",   last: "Foucault",  role: "Chargé d'affaires",   company: "Mayenne Toiture",         email: "r.foucault@mayennetoit.fr",    phone: "+33 6 04 71 28 39", city: "Laval",      last_touch: "il y a 4 j",  status: "actif",  src: "Salon Artibat",  sequence: "Cold outbound · Couvreurs",   tags: [] },
  { id: "p11", first: "Hugo",     last: "Pinault",   role: "Resp. dév.",          company: "Énergie Solaire 49",      email: "h.pinault@es49.fr",            phone: "+33 6 84 21 38 47", city: "Angers",     last_touch: "il y a 6 j",  status: "actif",  src: "Évent salarié", sequence: "—",                             tags: [] },
  { id: "p12", first: "Marion",   last: "Tessier",   role: "Co-dirigeante",       company: "Vendée Habitat Durable",  email: "m.tessier@vhd.fr",             phone: "+33 6 39 04 78 21", city: "La Roche-sur-Yon", last_touch: "1 sem.", status: "vip",    src: "Recommandation",  sequence: "—",                          tags: ["vip"] },
];

const DEALS = [
  { id: "d1", title: "PAC air/eau Daikin 8kW + ECS",      contact: "Camille Pelletier", company: "Énergie Solaire 49",      value: 18900, prob: 65, stage: "proposal", owner: "u1", close: "12 juin", days_in_stage: 4, hot: true,  tags: ["pac", "MaPrimeRenov'"] },
  { id: "d2", title: "Centrale PV 9kWc + onduleur",        contact: "Antoine Marchais",  company: "Maine ThermPro",          value: 22400, prob: 35, stage: "qualif",   owner: "u2", close: "30 juin", days_in_stage: 8, hot: false, tags: ["pv"] },
  { id: "d3", title: "Audit énergétique + bouquet travaux",contact: "Léa Bouvier",       company: "Vendée Habitat Durable",  value: 41200, prob: 80, stage: "closing",  owner: "u1", close: "5 juin",  days_in_stage: 2, hot: true,  tags: ["pac", "iso", "vmc"] },
  { id: "d4", title: "12 PAC + ballons collectifs",        contact: "Mehdi Daoudi",      company: "Loire Eco-Travoux",       value: 87600, prob: 55, stage: "proposal", owner: "u1", close: "20 juin", days_in_stage: 5, hot: true,  tags: ["pac", "B2B"] },
  { id: "d5", title: "Isolation combles 180m²",             contact: "Sophie Lemoine",    company: "Atlantique Énergie",      value: 6800,  prob: 70, stage: "closing",  owner: "u2", close: "8 juin",  days_in_stage: 1, hot: false, tags: ["iso"] },
  { id: "d6", title: "PAC + photovoltaïque pack maison",    contact: "Aurélie Costa",     company: "Domus Rénovation",        value: 28400, prob: 45, stage: "proposal", owner: "u2", close: "28 juin", days_in_stage: 6, hot: false, tags: ["pac", "pv"] },
  { id: "d7", title: "Renouvellement maintenance 24 PAC",   contact: "Nicolas Quéré",     company: "Ouest Confort Habitat",   value: 14200, prob: 60, stage: "proposal", owner: "u1", close: "15 juin", days_in_stage: 3, hot: false, tags: ["pac", "récurrent"] },
  { id: "d8", title: "Étude faisabilité 3 sites",           contact: "Inès Vandamme",     company: "Solvert Aménagement",     value: 4800,  prob: 20, stage: "qualif",   owner: "u3", close: "—",       days_in_stage: 14, hot: false, tags: ["études"] },
  { id: "d9", title: "PV toiture 24kWc + batterie 10kWh",   contact: "Romain Foucault",   company: "Mayenne Toiture",         value: 38600, prob: 50, stage: "qualif",   owner: "u4", close: "—",       days_in_stage: 9,  hot: false, tags: ["pv", "batt"] },
  { id: "d10", title: "PAC réversible villa 220m²",         contact: "Hugo Pinault",      company: "Énergie Solaire 49",      value: 16400, prob: 30, stage: "discovery", owner: "u2", close: "—",      days_in_stage: 2,  hot: false, tags: ["pac"] },
  { id: "d11", title: "Bouquet rénovation copropriété 18 lots", contact: "Marion Tessier",company: "Vendée Habitat Durable",  value: 142000, prob: 25, stage: "discovery", owner: "u1", close: "—",      days_in_stage: 5,  hot: false, tags: ["B2B"] },
  { id: "d12", title: "PAC + remplacement chaudière fioul", contact: "Julien Berthet",    company: "Berthet & Fils",          value: 11200, prob: 40, stage: "discovery", owner: "u3", close: "—",       days_in_stage: 7,  hot: false, tags: ["pac"] },
  { id: "d13", title: "Devis solaire 6kWc autoconso",       contact: "Sophie Lemoine",    company: "Atlantique Énergie",      value: 9400,  prob: 90, stage: "won",      owner: "u2", close: "30 mai (✓)", days_in_stage: 0, hot: false, tags: ["pv"] },
  { id: "d14", title: "Audit + DPE 12 logements",           contact: "Aurélie Costa",     company: "Domus Rénovation",        value: 7200,  prob: 90, stage: "won",      owner: "u1", close: "28 mai (✓)", days_in_stage: 0, hot: false, tags: ["études"] },
];

const STAGES = [
  { id: "discovery", name: "Découverte",  color: "#8A877F", dot: "#8A877F" },
  { id: "qualif",    name: "Qualifié",    color: "#2B7FB8", dot: "#2B7FB8" },
  { id: "proposal",  name: "Devis envoyé",color: "#E2552B", dot: "#E2552B" },
  { id: "closing",   name: "Closing",     color: "#7A5AE0", dot: "#7A5AE0" },
  { id: "won",       name: "Signé",       color: "#1F8A5B", dot: "#1F8A5B" },
  { id: "lost",      name: "Perdu",       color: "#B5322F", dot: "#B5322F" },
];

const EVENTS_WEEK = [
  // day-index 0=Mon, time decimal hours
  { day: 0, start: 9.0,  end: 10.0,  kind: "qualif", title: "Qualif Atlantique Énergie", who: "Sophie Lemoine", loc: "Visio" },
  { day: 0, start: 11.0, end: 12.5,  kind: "rdv",    title: "RDV terrain — Berthet", who: "Julien Berthet", loc: "Cholet" },
  { day: 0, start: 14.0, end: 15.0,  kind: "prod",   title: "Pose PAC chez Mme Renaud", who: "Équipe T. Lasalle", loc: "Angers" },
  { day: 0, start: 16.5, end: 17.5,  kind: "interne",title: "Stand-up commercial",  who: "Équipe ventes", loc: "" },
  { day: 1, start: 8.5,  end: 9.5,   kind: "rdv",    title: "RDV Loire Eco-Travaux", who: "Mehdi Daoudi", loc: "Nantes" },
  { day: 1, start: 10.5, end: 12.0,  kind: "rdv",    title: "Visite chantier Domus", who: "Aurélie Costa", loc: "Rennes" },
  { day: 1, start: 14.0, end: 15.5,  kind: "qualif", title: "Qualif Solvert", who: "Inès Vandamme", loc: "Visio" },
  { day: 2, start: 9.5,  end: 11.0,  kind: "rdv",    title: "Présentation devis VHD", who: "Léa Bouvier", loc: "La Roche-sur-Yon" },
  { day: 2, start: 13.0, end: 14.0,  kind: "interne",title: "Forecast review",      who: "Direction", loc: "" },
  { day: 2, start: 15.0, end: 16.5,  kind: "prod",   title: "Audit énergie Costa",   who: "Bureau d'études", loc: "Rennes" },
  { day: 3, start: 9.0,  end: 10.5,  kind: "rdv",    title: "Signature ES49",        who: "Camille Pelletier", loc: "Angers" },
  { day: 3, start: 11.0, end: 12.0,  kind: "qualif", title: "Qualif Mayenne Toiture", who: "Romain Foucault", loc: "Visio" },
  { day: 3, start: 14.5, end: 16.5,  kind: "rdv",    title: "RDV Ouest Confort",     who: "Nicolas Quéré", loc: "Brest" },
  { day: 4, start: 8.0,  end: 10.0,  kind: "prod",   title: "Pose PV chez Marchais", who: "Équipe pose B",  loc: "Le Mans" },
  { day: 4, start: 10.5, end: 12.0,  kind: "rdv",    title: "Réception devis copro VHD", who: "Marion Tessier", loc: "La Roche-sur-Yon" },
  { day: 4, start: 14.0, end: 15.0,  kind: "interne",title: "Rétro hebdo équipe",     who: "Toute l'équipe", loc: "" },
];

const PROD_CATALOG = [
  { cat: "Chauffage",  items: [
    { id: "pac8",  ref: "DAK-AAH08", k: "pac",  name: "PAC air/eau Daikin Altherma 8kW", unit: "U", price: 8400 },
    { id: "pac11", ref: "DAK-AAH11", k: "pac",  name: "PAC air/eau Daikin Altherma 11kW", unit: "U", price: 9900 },
    { id: "pac14", ref: "ATB-EH14",  k: "pac",  name: "PAC air/eau Atlantic Excelia 14kW", unit: "U", price: 11200 },
    { id: "chf",   ref: "VLT-VGP25", k: "chau", name: "Chaudière gaz condensation Vaillant",  unit: "U", price: 3400 },
  ] },
  { cat: "Photovoltaïque", items: [
    { id: "pv6",   ref: "PV-6KWC",   k: "pv",   name: "Centrale PV 6kWc Dualsun + onduleur", unit: "U", price: 9800 },
    { id: "pv9",   ref: "PV-9KWC",   k: "pv",   name: "Centrale PV 9kWc Dualsun + onduleur", unit: "U", price: 13400 },
    { id: "batt5", ref: "BAT-5KWH",  k: "batt", name: "Batterie BYD Premium 5kWh",            unit: "U", price: 4400 },
    { id: "batt10",ref: "BAT-10KWH", k: "batt", name: "Batterie BYD Premium 10kWh",           unit: "U", price: 7200 },
  ] },
  { cat: "Isolation / Air", items: [
    { id: "isoc",  ref: "ISO-COMB",  k: "iso",  name: "Isolation combles soufflée (ouate)", unit: "m²", price: 28 },
    { id: "isom",  ref: "ISO-MURS",  k: "iso",  name: "Isolation murs ITE polystyrène",     unit: "m²", price: 110 },
    { id: "vmc",   ref: "ATL-DUO",   k: "vmc",  name: "VMC double-flux Atlantic Duolix",    unit: "U", price: 2400 },
  ] },
  { cat: "Services", items: [
    { id: "audit", ref: "SRV-AUDIT", k: "serv", name: "Audit énergétique RGE",              unit: "U", price: 1200 },
    { id: "pose",  ref: "SRV-POSE",  k: "serv", name: "Forfait pose PAC + raccordement",    unit: "U", price: 1850 },
    { id: "maint", ref: "SRV-MAINT", k: "serv", name: "Contrat maintenance annuel",          unit: "U", price: 280 },
  ] },
];

const DEVIS_CURRENT = {
  ref: "DEV-2026-0421",
  date: "21 mai 2026",
  validity: "30 jours",
  client: {
    name: "M. & Mme Pelletier",
    addr: "14 rue des Ormeaux\n49000 Angers",
    contact: "Camille Pelletier",
    siret: "Particuliers — pas de SIRET",
  },
  rows: [
    { k: "pac",  ref: "DAK-AAH11", name: "PAC air/eau Daikin Altherma 11kW", desc: "Pompe à chaleur réversible, COP 4,8 — ballon ECS 200L intégré, R32.", qty: 1, unit: "U", price: 9900,  amount: 9900 },
    { k: "iso",  ref: "ISO-COMB",  name: "Isolation combles perdus", desc: "Soufflage ouate de cellulose 320mm — R=7,5 m².K/W — surface 165m².", qty: 165, unit: "m²", price: 28, amount: 4620 },
    { k: "pv",   ref: "PV-6KWC",   name: "Centrale PV 6kWc autoconsommation", desc: "16 panneaux Dualsun 375W + onduleur Enphase microinverter — pose en toiture.", qty: 1, unit: "U", price: 9800,  amount: 9800 },
    { k: "serv", ref: "SRV-POSE",  name: "Forfait pose + raccordement", desc: "Dépose ancienne chaudière, raccordements hydrauliques + électriques, mise en service.", qty: 1, unit: "U", price: 1850,  amount: 1850 },
  ],
  ht: 26170,
  tva: 1432,
  tva_rate: "5,5 / 10%",
  ttc: 27602,
  aides: [
    { lb: "MaPrimeRénov' (Bleu)",      v: 5000 },
    { lb: "CEE — Bouquet rénovation",   v: 4200 },
    { lb: "Prime PV autoconsommation",  v: 1140 },
  ],
};

const OFFERS_PIPE = [
  { stage: "Brouillon",  count: 4,  value: 86400, color: "#8A877F" },
  { stage: "Envoyé",     count: 9,  value: 224800, color: "#E2552B" },
  { stage: "Relancé",    count: 6,  value: 142200, color: "#C8881F" },
  { stage: "Négociation",count: 3,  value: 98600, color: "#7A5AE0" },
  { stage: "Signé",      count: 11, value: 312400, color: "#1F8A5B" },
];

const RECENT_DEVIS = [
  { ref: "DEV-2026-0421", client: "M. & Mme Pelletier",     amt: 27602, stage: "Brouillon",   age: "auj.",   owner: "LB" },
  { ref: "DEV-2026-0420", client: "Maine ThermPro",         amt: 22400, stage: "Envoyé",      age: "hier",   owner: "SM" },
  { ref: "DEV-2026-0419", client: "Loire Eco-Travaux",      amt: 87600, stage: "Négociation", age: "il y a 4j", owner: "LB" },
  { ref: "DEV-2026-0418", client: "Vendée Habitat Durable", amt: 41200, stage: "Relancé",     age: "il y a 6j", owner: "LB" },
  { ref: "DEV-2026-0417", client: "Domus Rénovation",       amt: 28400, stage: "Envoyé",      age: "il y a 7j", owner: "SM" },
  { ref: "DEV-2026-0416", client: "Atlantique Énergie",     amt: 9400,  stage: "Signé",       age: "il y a 9j", owner: "SM" },
];

Object.assign(window, { TEAM, COMPANIES, CONTACTS, DEALS, STAGES, EVENTS_WEEK, PROD_CATALOG, DEVIS_CURRENT, OFFERS_PIPE, RECENT_DEVIS });
