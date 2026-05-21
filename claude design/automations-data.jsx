// automations-data.jsx — Mock data simulating Supabase tables + automations registry.

// ── Mock Supabase "tables" ────────────────────────────────────────────────
// Each is a list of rows. Used by SupaSelect to render dropdowns that
// reflect real data (instead of free-text fields).

const SUPA = {
  pipelines: {
    schema: "public",
    name: "pipelines",
    pk: "id",
    rows: [
      { id: "pip_prosp",   name: "Prospection sortante",  color: "#E2552B", icon: "flame",       count: 142 },
      { id: "pip_inbound", name: "Leads entrants",        color: "#2A6FDB", icon: "inbox",       count: 38 },
      { id: "pip_devis",   name: "Devis & closing",       color: "#1F8A5B", icon: "euro",        count: 21 },
      { id: "pip_recrut",  name: "Recrutement",           color: "#7A5AE0", icon: "users",       count: 8 },
      { id: "pip_partner", name: "Partenariats",          color: "#C8881F", icon: "users",       count: 14 },
    ],
  },

  // stages depend on pipeline_id
  stages: {
    schema: "public",
    name: "pipeline_stages",
    pk: "id",
    fk: "pipeline_id",
    rows: [
      // Prospection sortante
      { id: "st_p_raw",     pipeline_id: "pip_prosp",   position: 1, name: "À qualifier",    color: "#8A877F" },
      { id: "st_p_seq",     pipeline_id: "pip_prosp",   position: 2, name: "Séquence en cours", color: "#2A6FDB" },
      { id: "st_p_replied", pipeline_id: "pip_prosp",   position: 3, name: "A répondu",       color: "#C8881F" },
      { id: "st_p_rdv",     pipeline_id: "pip_prosp",   position: 4, name: "RDV planifié",    color: "#7A5AE0" },
      { id: "st_p_won",     pipeline_id: "pip_prosp",   position: 5, name: "Devis envoyé",    color: "#1F8A5B" },
      { id: "st_p_lost",    pipeline_id: "pip_prosp",   position: 6, name: "Perdu",           color: "#B5322F" },
      // Leads entrants
      { id: "st_i_new",     pipeline_id: "pip_inbound", position: 1, name: "Nouveau",         color: "#8A877F" },
      { id: "st_i_qual",    pipeline_id: "pip_inbound", position: 2, name: "Qualifié",        color: "#2A6FDB" },
      { id: "st_i_rdv",     pipeline_id: "pip_inbound", position: 3, name: "RDV planifié",    color: "#7A5AE0" },
      { id: "st_i_won",     pipeline_id: "pip_inbound", position: 4, name: "Gagné",           color: "#1F8A5B" },
      // Devis & closing
      { id: "st_d_prep",    pipeline_id: "pip_devis",   position: 1, name: "En préparation",  color: "#8A877F" },
      { id: "st_d_sent",    pipeline_id: "pip_devis",   position: 2, name: "Envoyé",          color: "#2A6FDB" },
      { id: "st_d_nego",    pipeline_id: "pip_devis",   position: 3, name: "Négociation",     color: "#C8881F" },
      { id: "st_d_signed",  pipeline_id: "pip_devis",   position: 4, name: "Signé",           color: "#1F8A5B" },
    ],
  },

  forms: {
    schema: "public",
    name: "forms",
    pk: "id",
    rows: [
      { id: "frm_devis",     name: "Demande de devis",          slug: "/devis",     submissions: 142 },
      { id: "frm_contact",   name: "Contact général",           slug: "/contact",   submissions: 67 },
      { id: "frm_audit",     name: "Audit énergétique gratuit", slug: "/audit",     submissions: 28 },
      { id: "frm_rappel",    name: "Demande de rappel",         slug: "/rappel",    submissions: 53 },
      { id: "frm_recrut",    name: "Candidature",               slug: "/recrutement", submissions: 11 },
    ],
  },

  tags: {
    schema: "public",
    name: "tags",
    pk: "id",
    rows: [
      { id: "tag_hot",      name: "Hot",          color: "#E2552B", count: 14 },
      { id: "tag_cold",     name: "Cold",         color: "#2A6FDB", count: 62 },
      { id: "tag_renov",    name: "Rénovation",   color: "#7A5AE0", count: 28 },
      { id: "tag_part",     name: "Particulier",  color: "#1F8A5B", count: 87 },
      { id: "tag_pro",      name: "Professionnel",color: "#C8881F", count: 23 },
      { id: "tag_urgence",  name: "Urgence",      color: "#B5322F", count: 5 },
    ],
  },

  email_templates: {
    schema: "public",
    name: "email_templates",
    pk: "id",
    rows: [
      { id: "tpl_cold1",    name: "Cold #1 — accroche",         subject: "Question rapide pour {{contact.first_name}}", body_preview: "Bonjour, j'ai vu que vous…" },
      { id: "tpl_cold2",    name: "Cold #2 — relance valeur",   subject: "Une idée pour {{company.name}}", body_preview: "Un retour rapide sur…" },
      { id: "tpl_cold3",    name: "Cold #3 — break-up",         subject: "Dernière tentative", body_preview: "Si ce n'est pas le bon moment…" },
      { id: "tpl_devis",    name: "Confirmation devis envoyé",  subject: "Votre devis Thermalis", body_preview: "Veuillez trouver ci-joint…" },
      { id: "tpl_rdv",      name: "Confirmation RDV",           subject: "RDV confirmé le {{rdv.date}}", body_preview: "Bonjour, je vous confirme…" },
      { id: "tpl_followup", name: "Post-RDV — suivi",           subject: "Suite à notre échange", body_preview: "Merci pour le temps accordé…" },
      { id: "tpl_nps",      name: "NPS après installation",     subject: "Comment s'est passée l'installation ?", body_preview: "Quelques jours après…" },
    ],
  },

  whatsapp_templates: {
    schema: "public",
    name: "whatsapp_templates",
    pk: "id",
    rows: [
      { id: "wa_cold1", name: "Premier contact WhatsApp", body_preview: "Bonjour {{contact.first_name}}, je suis Lucas de Sama Digital…" },
      { id: "wa_rdv",   name: "Confirmation RDV WA",       body_preview: "Hello, je vous confirme notre échange…" },
      { id: "wa_relance", name: "Relance après devis",     body_preview: "Bonjour, pour faire suite à notre devis…" },
    ],
  },

  call_scripts: {
    schema: "public",
    name: "call_scripts",
    pk: "id",
    rows: [
      { id: "sc_cold1",  name: "Script cold call — découverte",   duration: "3 min" },
      { id: "sc_qualif", name: "Script qualification BANT",       duration: "5 min" },
      { id: "sc_followup", name: "Script de relance post-devis",  duration: "2 min" },
      { id: "sc_objection", name: "Traitement objection prix",    duration: "4 min" },
    ],
  },

  users: {
    schema: "auth",
    name: "users",
    pk: "id",
    rows: [
      { id: "usr_lm",  name: "Lucas Martin",      initials: "LM", role: "Founder",   color: "#E2552B" },
      { id: "usr_jb",  name: "Julie Brossard",    initials: "JB", role: "Sales",     color: "#7A5AE0" },
      { id: "usr_ad",  name: "Antoine Dubois",    initials: "AD", role: "SDR",       color: "#2A6FDB" },
      { id: "usr_mp",  name: "Marie Petit",       initials: "MP", role: "Customer",  color: "#1F8A5B" },
      { id: "usr_rh",  name: "Romain Henry",      initials: "RH", role: "SDR",       color: "#C8881F" },
    ],
  },

  task_types: {
    schema: "public",
    name: "task_types",
    pk: "id",
    rows: [
      { id: "tt_call",     name: "Appel",         color: "#C8881F" },
      { id: "tt_wa",       name: "WhatsApp",      color: "#1F8A5B" },
      { id: "tt_email",    name: "Email perso",   color: "#2A6FDB" },
      { id: "tt_meeting",  name: "RDV",           color: "#7A5AE0" },
      { id: "tt_admin",    name: "Admin",         color: "#8A877F" },
    ],
  },

  sequences: {
    schema: "public",
    name: "prospection_sequences",
    pk: "id",
    rows: [
      { id: "seq_solaire69", name: "Cold outbound · Solaire 69",   steps: 7,  active: 47, paused: 4, finished: 89 },
      { id: "seq_pac_renov", name: "Rénovation PAC · Tier 2",      steps: 9,  active: 23, paused: 0, finished: 31 },
      { id: "seq_replied",   name: "Reply nurturing",              steps: 5,  active: 12, paused: 2, finished: 0 },
      { id: "seq_breakup",   name: "Break-up — derniers signaux",  steps: 3,  active: 18, paused: 0, finished: 22 },
    ],
  },
};

// ── Field metadata used to label contact/company/opportunity columns ──────
const SUPA_FIELDS = {
  contacts: [
    { id: "first_name", label: "Prénom",    kind: "text" },
    { id: "last_name",  label: "Nom",       kind: "text" },
    { id: "email",      label: "Email",     kind: "email" },
    { id: "phone",      label: "Téléphone", kind: "phone" },
    { id: "city",       label: "Ville",     kind: "text" },
    { id: "role",       label: "Poste",     kind: "text" },
    { id: "company_id", label: "Entreprise",kind: "ref",   ref: "companies" },
  ],
  companies: [
    { id: "name",       label: "Nom",       kind: "text" },
    { id: "size",       label: "Effectif",  kind: "number" },
    { id: "industry",   label: "Secteur",   kind: "text" },
    { id: "city",       label: "Ville",     kind: "text" },
    { id: "lm_score",   label: "Score IA",  kind: "number" },
    { id: "owner_id",   label: "Owner",     kind: "ref", ref: "users" },
  ],
  opportunities: [
    { id: "title",        label: "Titre",       kind: "text" },
    { id: "amount",       label: "Montant",     kind: "currency" },
    { id: "stage_id",     label: "Stage",       kind: "ref", ref: "stages" },
    { id: "pipeline_id",  label: "Pipeline",    kind: "ref", ref: "pipelines" },
    { id: "contact_id",   label: "Contact",     kind: "ref", ref: "contacts" },
    { id: "owner_id",     label: "Owner",       kind: "ref", ref: "users" },
  ],
};

// ── Catalog of triggers / actions / etc that user can place in a workflow ─
const NODE_CATALOG = [
  { section: "Déclencheurs CRM", cat: "trigger", items: [
    { id: "trg.stage_changed",      icon: "pipeline",   name: "Changement de stage",
      desc: "Quand une opportunité passe à un stage particulier d'un pipeline." },
    { id: "trg.opportunity_created",icon: "opportunity",name: "Opportunité créée",
      desc: "Au moment où une opportunité est créée dans un pipeline." },
    { id: "trg.tag_added",          icon: "tag",        name: "Tag ajouté",
      desc: "Quand un tag spécifique est appliqué à un contact ou une entreprise." },
    { id: "trg.contact_created",    icon: "contacts",   name: "Contact créé",
      desc: "À la création d'un nouveau contact, avec filtres optionnels." },
    { id: "trg.form_submitted",     icon: "form",       name: "Formulaire soumis",
      desc: "Dès qu'un formulaire reçoit une nouvelle soumission." },
  ]},
  { section: "Déclencheurs temps", cat: "trigger", items: [
    { id: "trg.schedule",           icon: "cal",        name: "Planning récurrent",
      desc: "Tous les lundis à 9h, ou autre fréquence CRON." },
    { id: "trg.no_activity",        icon: "clock",      name: "Inactivité prolongée",
      desc: "Quand un contact n'a aucune activité depuis X jours." },
  ]},
  { section: "Conditions", cat: "cond", items: [
    { id: "cnd.if_field",     icon: "filter",   name: "Si champ…",
      desc: "Brancher selon la valeur d'un champ de la donnée déclencheuse." },
    { id: "cnd.if_tag",       icon: "tag",      name: "Si tag présent",
      desc: "Vérifier qu'un tag est appliqué (ou pas)." },
    { id: "cnd.split",        icon: "splitH",   name: "Split chemin",
      desc: "Plusieurs branches en parallèle." },
  ]},
  { section: "Actions auto", cat: "action", items: [
    { id: "act.send_email",   icon: "mail",       name: "Envoyer un email",
      desc: "Avec un template + variables d'interpolation." },
    { id: "act.move_stage",   icon: "pipeline",   name: "Déplacer dans le pipeline",
      desc: "Pousser l'opportunité vers un autre stage." },
    { id: "act.add_tag",      icon: "tag",        name: "Ajouter un tag",
      desc: "Tagger l'enregistrement courant." },
    { id: "act.remove_tag",   icon: "tag",        name: "Retirer un tag",
      desc: "Retirer un tag de l'enregistrement courant." },
    { id: "act.assign_owner", icon: "user",       name: "Attribuer à un utilisateur",
      desc: "Round-robin ou utilisateur fixe." },
    { id: "act.create_opp",   icon: "opportunity",name: "Créer une opportunité" },
    { id: "act.create_task",  icon: "task",       name: "Créer une tâche" },
    { id: "act.webhook",      icon: "webhook",    name: "Envoyer un webhook HTTP" },
    { id: "act.notify",       icon: "bell",       name: "Notifier une équipe (Slack/in-app)" },
    { id: "act.ai_score",     icon: "ai",         name: "Score IA — Claude",
      desc: "Évaluer la donnée avec Claude et écrire le résultat dans un champ." },
  ]},
  { section: "Tâches manuelles", cat: "manual", items: [
    { id: "act.task_call",     icon: "phone",    name: "Tâche d'appel",
      desc: "Créer un appel à passer dans la file de démarchage." },
    { id: "act.task_whatsapp", icon: "whatsapp", name: "Tâche WhatsApp",
      desc: "Message pré-rédigé, l'opérateur clique pour envoyer." },
    { id: "act.task_linkedin", icon: "linkedin", name: "Tâche LinkedIn",
      desc: "Demande de connexion ou InMail à envoyer manuellement." },
  ]},
  { section: "Contrôle de flux", cat: "delay", items: [
    { id: "flow.wait",        icon: "clock",     name: "Attendre…",
      desc: "Pause fixe (heures/jours) ou jusqu'à un événement." },
    { id: "flow.until_event", icon: "bolt",      name: "Attendre un événement",
      desc: "Bloquer jusqu'à ce qu'un trigger spécifique survienne." },
    { id: "flow.exit",        icon: "flag",      name: "Terminer le workflow",
      desc: "Sortir de l'automatisation." },
  ]},
];

// ── Sample automations registry (Workflows tab) ───────────────────────────
const AUTOMATIONS = [
  {
    id: "auto_seq_solaire",
    name: "Cold outbound · Solaire 69",
    desc: "Séquence de prospection multi-canal sur le pipeline « Prospection sortante ».",
    kind: "sequence",
    triggerLabel: "Stage = À qualifier",
    pipeline: "pip_prosp",
    stage: "st_p_raw",
    status: "on",
    owner: "usr_lm",
    runs7d: 47, success7d: 0.31, lastRun: "il y a 12 min",
  },
  {
    id: "auto_stage_to_devis",
    name: "RDV planifié → préparer devis",
    desc: "Quand un RDV est marqué OK, créer la tâche de préparation et notifier Lucas.",
    kind: "workflow",
    triggerLabel: "Changement de stage",
    pipeline: "pip_prosp",
    stage: "st_p_rdv",
    status: "on",
    owner: "usr_lm",
    runs7d: 12, success7d: 1.0, lastRun: "il y a 2 h",
  },
  {
    id: "auto_form_devis",
    name: "Soumission formulaire devis → CRM",
    desc: "Crée un contact, une entreprise, une opportunité dans Devis & closing.",
    kind: "workflow",
    triggerLabel: "Formulaire devis",
    status: "on",
    owner: "usr_jb",
    runs7d: 142, success7d: 0.98, lastRun: "il y a 3 min",
  },
  {
    id: "auto_breakup",
    name: "Break-up email après 14 jours sans réponse",
    desc: "Si pas d'ouverture ni de réponse depuis 14 j, envoyer le break-up email.",
    kind: "sequence",
    triggerLabel: "Inactivité 14j",
    pipeline: "pip_prosp",
    stage: "st_p_seq",
    status: "on",
    owner: "usr_ad",
    runs7d: 18, success7d: 0.42, lastRun: "il y a 1 h",
  },
  {
    id: "auto_nps",
    name: "NPS post-installation",
    desc: "Envoyer le NPS 10 jours après que l'opp passe à « Signé ».",
    kind: "workflow",
    triggerLabel: "Stage = Signé",
    pipeline: "pip_devis",
    stage: "st_d_signed",
    status: "paused",
    owner: "usr_mp",
    runs7d: 0, success7d: null, lastRun: "il y a 3 j",
  },
  {
    id: "auto_hot_tag",
    name: "Tag Hot → notifier Lucas",
    desc: "Notif Slack immédiate quand un contact est taggué Hot.",
    kind: "workflow",
    triggerLabel: "Tag « Hot »",
    status: "on",
    owner: "usr_lm",
    runs7d: 4, success7d: 1.0, lastRun: "il y a 8 h",
  },
  {
    id: "auto_recrut",
    name: "Candidature → Pipeline Recrutement",
    desc: "Crée un contact dans le pipeline « Recrutement », stage « Nouveau ».",
    kind: "workflow",
    triggerLabel: "Formulaire candidature",
    status: "draft",
    owner: "usr_rh",
    runs7d: 0, success7d: null, lastRun: "—",
  },
];

// ── Sample workflow definition (used in workflow builder canvas) ──────────
const SAMPLE_WORKFLOW = {
  id: "auto_stage_to_devis",
  name: "RDV planifié → préparer devis",
  // simple linear flow with one Yes/No branch
  nodes: [
    { id: "n1", type: "trg.stage_changed", cat: "trigger",
      title: "Changement de stage",
      config: {
        pipeline:  "pip_prosp",
        stage_to:  "st_p_rdv",
      } },
    { id: "n2", type: "cnd.if_field", cat: "cond",
      title: "Si montant ≥ 8 000 €",
      config: { field: "amount", op: "gte", value: 8000 } },
    // YES branch
    { id: "n3", type: "act.assign_owner", cat: "action",
      title: "Attribuer à Lucas",
      config: { user: "usr_lm" } },
    { id: "n4", type: "act.notify", cat: "action",
      title: "Notifier l'équipe sur #ventes",
      config: { channel: "ventes", message: "Opportunité prioritaire RDV planifié" } },
    // NO branch
    { id: "n5", type: "act.create_task", cat: "action",
      title: "Créer la tâche « Préparer devis »",
      config: { type: "tt_admin", assignee: "usr_jb" } },
    { id: "n6", type: "act.send_email", cat: "action",
      title: "Envoyer l'email de confirmation RDV",
      config: { template: "tpl_rdv" } },
  ],
  // Graph (simple top-down + branches)
  layout: {
    root: "n1",
    children: {
      n1: ["n2"],
      n2: { yes: ["n3", "n4"], no: ["n5"] },
      n5: ["n6"],
    },
  },
};

// ── Sample prospection sequence definition ──────────────────────────────
const SAMPLE_SEQUENCE = {
  id: "seq_solaire69",
  name: "Cold outbound · Solaire 69",
  desc: "Séquence multi-canal pour les leads froids du segment Solaire en Auvergne-Rhône-Alpes.",
  pipeline: "pip_prosp",
  stage: "st_p_raw",
  exitOnReply: true,
  cadence: "L-V · 8h–19h",
  ownerRR: ["usr_ad", "usr_rh"],
  steps: [
    { id: "s1", kind: "email",    mode: "auto",   day: 0,  template: "tpl_cold1",
      sendAt: "9:30", trackOpens: true, trackClicks: true },
    { id: "s2", kind: "linkedin", mode: "manual", day: 2,
      label: "Demande de connexion LinkedIn",
      message: "Bonjour {{contact.first_name}}, je découvre {{company.name}} et je trouve votre approche intéressante — pas de pitch, juste une mise en relation." },
    { id: "s3", kind: "wait",     day: 4 },
    { id: "s4", kind: "call",     mode: "manual", day: 4,
      script: "sc_cold1", duration: "3 min" },
    { id: "s5", kind: "email",    mode: "auto",   day: 7,  template: "tpl_cold2",
      sendAt: "10:00", trackOpens: true, trackClicks: true },
    { id: "s6", kind: "whatsapp", mode: "manual", day: 10,
      template: "wa_cold1" },
    { id: "s7", kind: "email",    mode: "auto",   day: 14, template: "tpl_cold3",
      sendAt: "9:00", trackOpens: true, trackClicks: false },
  ],
  stats: { active: 47, paused: 4, finished: 89, replied: 27, booked: 12 },
};

// ── Mock task queue for the démarchage page ─────────────────────────────
const PROSPECTION_QUEUE = [
  {
    id: "q1", kind: "call", overdue: false, time: "10:30",
    sequenceId: "seq_solaire69", sequenceStepId: "s4",
    contact: { id: "ct_1", first: "Mathilde", last: "Bertin", role: "Directrice technique",
               company: "Solaris Lyon", initials: "MB",
               city: "Lyon 6e", email: "m.bertin@solaris-lyon.fr", phone: "06 23 45 18 92" },
    progressDone: 3, progressTotal: 7, currentStep: 4,
    history: [
      { kind: "email", title: "Email Cold #1 ouvert (2x)", time: "il y a 5 j", state: "ok" },
      { kind: "linkedin", title: "Connexion LinkedIn acceptée", time: "il y a 3 j", state: "ok" },
      { kind: "email", title: "Pas d'ouverture relance", time: "il y a 1 j", state: "warn" },
    ],
  },
  {
    id: "q2", kind: "whatsapp", overdue: false, time: "11:15",
    sequenceId: "seq_pac_renov", sequenceStepId: "s6",
    contact: { id: "ct_2", first: "Yann", last: "Lecoq", role: "Gérant",
               company: "Lecoq Bâtiment", initials: "YL",
               city: "Villeurbanne", email: "y.lecoq@lecoq-batiment.fr", phone: "06 78 12 33 04" },
    progressDone: 5, progressTotal: 9, currentStep: 6,
    history: [
      { kind: "email", title: "Email #1 ouvert", time: "il y a 10 j", state: "ok" },
      { kind: "call", title: "Appel — boîte vocale", time: "il y a 6 j", state: "warn" },
      { kind: "email", title: "Email #2 — clic sur lien devis", time: "il y a 3 j", state: "ok" },
    ],
  },
  {
    id: "q3", kind: "linkedin", overdue: true, time: "hier",
    sequenceId: "seq_solaire69", sequenceStepId: "s2",
    contact: { id: "ct_3", first: "Sophie", last: "Renaud", role: "Cheffe de projets RSE",
               company: "Énergies Vertes 38", initials: "SR",
               city: "Grenoble", email: "s.renaud@ev38.fr", phone: "—" },
    progressDone: 1, progressTotal: 7, currentStep: 2,
    history: [
      { kind: "email", title: "Email Cold #1 envoyé", time: "il y a 2 j", state: "info" },
    ],
  },
  {
    id: "q4", kind: "call", overdue: false, time: "14:00",
    sequenceId: "seq_replied", sequenceStepId: "s3",
    contact: { id: "ct_4", first: "Alexandre", last: "Mathieu", role: "DG",
               company: "AM Promotion", initials: "AM",
               city: "Annecy", email: "a.mathieu@am-promo.fr", phone: "06 11 02 33 88" },
    progressDone: 2, progressTotal: 5, currentStep: 3,
    history: [
      { kind: "email", title: "Email ouvert + cliqué", time: "il y a 4 j", state: "ok" },
      { kind: "email", title: "Réponse positive", time: "il y a 1 j", state: "ok" },
    ],
  },
  {
    id: "q5", kind: "whatsapp", overdue: false, time: "15:30",
    sequenceId: "seq_solaire69", sequenceStepId: "s6",
    contact: { id: "ct_5", first: "Florence", last: "Delmas", role: "RSE Manager",
               company: "Groupe Helio", initials: "FD",
               city: "Lyon 7e", email: "f.delmas@helio.fr", phone: "07 64 12 90 33" },
    progressDone: 5, progressTotal: 7, currentStep: 6,
    history: [
      { kind: "email", title: "2 emails ouverts", time: "il y a 9 j", state: "ok" },
      { kind: "call", title: "Appel — répondu — pas intéressée", time: "il y a 5 j", state: "warn" },
    ],
  },
  {
    id: "q6", kind: "call", overdue: false, time: "16:15",
    sequenceId: "seq_pac_renov", sequenceStepId: "s4",
    contact: { id: "ct_6", first: "Karim", last: "Saïdi", role: "Acheteur travaux",
               company: "GTM Construction", initials: "KS",
               city: "Bron", email: "k.saidi@gtm-cons.fr", phone: "06 88 41 22 17" },
    progressDone: 3, progressTotal: 9, currentStep: 4,
    history: [
      { kind: "linkedin", title: "Connexion acceptée", time: "il y a 6 j", state: "ok" },
      { kind: "email", title: "Email #2 ouvert", time: "il y a 2 j", state: "ok" },
    ],
  },
];

const PROSPECTION_TABS = [
  { id: "today",   label: "Aujourd'hui",  filter: (r) => true,                    icon: "cal" },
  { id: "call",    label: "Appels",       filter: (r) => r.kind === "call",       icon: "phone" },
  { id: "whatsapp",label: "WhatsApp",     filter: (r) => r.kind === "whatsapp",   icon: "whatsapp" },
  { id: "linkedin",label: "LinkedIn",     filter: (r) => r.kind === "linkedin",   icon: "linkedin" },
  { id: "overdue", label: "En retard",    filter: (r) => r.overdue === true,      icon: "warning" },
];

// Helper to look up a row by id
function supaRow(table, id) {
  return SUPA[table]?.rows.find((r) => r.id === id);
}
function supaRows(table) { return SUPA[table]?.rows || []; }
function stagesOfPipeline(pipelineId) {
  return SUPA.stages.rows.filter((s) => s.pipeline_id === pipelineId);
}

Object.assign(window, {
  SUPA, SUPA_FIELDS, NODE_CATALOG, AUTOMATIONS,
  SAMPLE_WORKFLOW, SAMPLE_SEQUENCE, PROSPECTION_QUEUE, PROSPECTION_TABS,
  supaRow, supaRows, stagesOfPipeline,
});
