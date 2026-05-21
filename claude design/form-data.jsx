// form-data.jsx — initial form definition + types catalog.
// Consumed by builder, logic canvas, and preview frame.

const QUESTION_TYPES = [
  { id: "welcome",      label: "Welcome",        cat: "structure", icon: "welcome" },
  { id: "statement",    label: "Statement",      cat: "structure", icon: "statement" },
  { id: "end",          label: "Écran de fin",   cat: "structure", icon: "end" },
  { id: "short_text",   label: "Texte court",    cat: "text",      icon: "textShort" },
  { id: "long_text",    label: "Texte long",     cat: "text",      icon: "textLong" },
  { id: "email",        label: "Email",          cat: "contact",   icon: "email" },
  { id: "phone",        label: "Téléphone",      cat: "contact",   icon: "phone" },
  { id: "number",       label: "Nombre",         cat: "number",    icon: "number" },
  { id: "slider",       label: "Slider",         cat: "number",    icon: "slider" },
  { id: "multi_choice", label: "Choix multiple", cat: "choice",    icon: "multiChoice" },
  { id: "single_choice",label: "Choix unique",   cat: "choice",    icon: "multiChoice" },
  { id: "dropdown",     label: "Dropdown",       cat: "choice",    icon: "dropdown" },
  { id: "yes_no",       label: "Oui / Non",      cat: "choice",    icon: "yesno" },
  { id: "rating",       label: "Note (étoiles)", cat: "rating",    icon: "rating" },
  { id: "scale",        label: "Échelle 1-10",   cat: "rating",    icon: "scale" },
  { id: "date",         label: "Date",           cat: "advanced",  icon: "date" },
  { id: "file",         label: "Upload fichier", cat: "advanced",  icon: "upload" },
];
const QT = Object.fromEntries(QUESTION_TYPES.map((q) => [q.id, q]));

const QT_GROUPS = [
  { id: "structure", label: "Structure", items: ["welcome", "statement", "end"] },
  { id: "choice",    label: "Choix",     items: ["multi_choice", "single_choice", "dropdown", "yes_no"] },
  { id: "text",      label: "Texte",     items: ["short_text", "long_text"] },
  { id: "contact",   label: "Contact",   items: ["email", "phone"] },
  { id: "rating",    label: "Note",      items: ["rating", "scale"] },
  { id: "number",    label: "Nombre",    items: ["number", "slider"] },
  { id: "advanced",  label: "Avancé",    items: ["date", "file"] },
];

// Default form: HVAC / plumbing / solar lead capture.
const INITIAL_FORM = {
  id: "form_lead_2026",
  title: "Demande de devis — Énergie & confort",
  brand: { name: "Thermalis", color: "#E2552B" },
  settings: { progressBar: true, showQuestionNumber: true, submitLabel: "Envoyer ma demande" },
  questions: [
    { id: "q_welcome", ref: "Q01", type: "welcome", required: false,
      title: "Obtenez votre devis en 2 minutes",
      subtitle: "Pompe à chaleur, chaudière, climatisation, panneaux solaires — répondez à quelques questions, un expert local vous rappelle sous 24h.",
      cta: "Commencer" },

    { id: "q_project", ref: "Q02", type: "multi_choice", required: true, multi: true,
      title: "Quel est votre projet ?",
      subtitle: "Vous pouvez sélectionner plusieurs options.",
      choices: [
        { id: "c_heat",  label: "Chauffage",     desc: "PAC, chaudière, poêle", icon: "flame" },
        { id: "c_cool",  label: "Climatisation", desc: "Mono / multi-split",     icon: "snow" },
        { id: "c_plumb", label: "Plomberie",     desc: "Sanitaire, ECS",         icon: "droplet" },
        { id: "c_solar", label: "Solaire",       desc: "Photovoltaïque, thermique", icon: "sun" },
      ] },

    { id: "q_heat_type", ref: "Q03", type: "single_choice", required: true,
      title: "Quel type de chauffage vous intéresse ?",
      subtitle: "On vous oriente vers la bonne solution.",
      choices: [
        { id: "h_pac_air", label: "Pompe à chaleur air/eau",   desc: "Idéal en rénovation", icon: "flame" },
        { id: "h_pac_geo", label: "Pompe à chaleur géothermique", desc: "Long terme, forage", icon: "flame" },
        { id: "h_gaz",     label: "Chaudière gaz condensation", desc: "Remplacement direct", icon: "flame" },
        { id: "h_advice",  label: "Je ne sais pas encore",     desc: "On vous conseille",   icon: "warning" },
      ] },

    { id: "q_solar_kw", ref: "Q04", type: "single_choice", required: true,
      title: "Quelle puissance solaire envisagez-vous ?",
      subtitle: "Estimation basée sur votre consommation.",
      choices: [
        { id: "s_3",  label: "3 kWc",      desc: "Petit foyer · ~80m²",   icon: "sun" },
        { id: "s_6",  label: "6 kWc",      desc: "Foyer moyen · ~120m²", icon: "sun" },
        { id: "s_9",  label: "9 kWc",      desc: "Grand foyer · ~180m²", icon: "sun" },
        { id: "s_?",  label: "À déterminer", desc: "On étudie ensemble", icon: "warning" },
      ] },

    { id: "q_home_type", ref: "Q05", type: "single_choice", required: true,
      title: "Quel type de logement ?",
      choices: [
        { id: "ht_house", label: "Maison individuelle", icon: "home" },
        { id: "ht_apt",   label: "Appartement",         icon: "building" },
        { id: "ht_pro",   label: "Local professionnel", icon: "building" },
      ] },

    { id: "q_surface", ref: "Q06", type: "slider", required: true,
      title: "Surface à équiper",
      subtitle: "Approximativement, en m².",
      min: 20, max: 400, step: 10, default: 90, unit: "m²" },

    { id: "q_owner", ref: "Q07", type: "yes_no", required: true,
      title: "Êtes-vous propriétaire du logement ?",
      subtitle: "Certaines aides sont réservées aux propriétaires occupants." },

    { id: "q_budget", ref: "Q08", type: "single_choice", required: false,
      title: "Avez-vous un budget en tête ?",
      subtitle: "Ça nous aide à calibrer la proposition.",
      choices: [
        { id: "b_lt5",   label: "< 5 000 €" },
        { id: "b_5_10",  label: "5 000 — 10 000 €" },
        { id: "b_10_20", label: "10 000 — 20 000 €" },
        { id: "b_gt20",  label: "> 20 000 €" },
        { id: "b_open",  label: "Pas encore défini" },
      ] },

    { id: "q_timing", ref: "Q09", type: "single_choice", required: true,
      title: "Quand souhaitez-vous lancer les travaux ?",
      choices: [
        { id: "t_asap",   label: "Dès que possible",      desc: "< 1 mois",   icon: "zap" },
        { id: "t_3m",     label: "Dans les 3 mois",        icon: "clock" },
        { id: "t_year",   label: "Dans l'année",           icon: "clock" },
        { id: "t_explore", label: "Je me renseigne",      icon: "search" },
      ] },

    { id: "q_zip", ref: "Q10", type: "short_text", required: true,
      title: "Quel est votre code postal ?",
      subtitle: "Pour vous mettre en relation avec l'agence la plus proche.",
      placeholder: "75001", maxLen: 5 },

    { id: "q_name", ref: "Q11", type: "short_text", required: true,
      title: "Comment vous appelez-vous ?",
      placeholder: "Prénom et nom" },

    { id: "q_email", ref: "Q12", type: "email", required: true,
      title: "Votre email",
      subtitle: "On vous envoie l'estimation par écrit.",
      placeholder: "vous@example.com" },

    { id: "q_phone", ref: "Q13", type: "phone", required: true,
      title: "Votre téléphone",
      subtitle: "Un conseiller vous rappelle sous 24h.",
      placeholder: "06 12 34 56 78" },

    { id: "q_notes", ref: "Q14", type: "long_text", required: false,
      title: "Une précision à ajouter ?",
      subtitle: "Optionnel — détails techniques, contraintes, photos à envoyer plus tard.",
      placeholder: "Ex : ma chaudière a 18 ans, fonctionne au fioul..." },

    { id: "q_consent", ref: "Q15", type: "yes_no", required: true,
      title: "J'accepte d'être recontacté",
      subtitle: "Vos données restent confidentielles. Vous pouvez les supprimer à tout moment." },

    { id: "q_end", ref: "Q16", type: "end", required: false,
      title: "Merci, votre demande est enregistrée.",
      subtitle: "Un expert Thermalis vous rappelle sous 24h ouvrées avec une première estimation gratuite.",
      cta: "Retour au site" },
  ],
  // Logic rules: each rule routes from a source question.
  // condition: { all: [{ field, op, value }] } or { any: [...] }
  // op ∈ "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "answered" | "empty"
  logic: [
    { id: "r1", from: "q_project", to: "q_heat_type",
      cond: { all: [{ field: "q_project", op: "contains", value: "c_heat" }] },
      label: "si Chauffage" },
    { id: "r2", from: "q_project", to: "q_solar_kw",
      cond: { all: [{ field: "q_project", op: "contains", value: "c_solar" },
                    { field: "q_project", op: "not_contains", value: "c_heat" }] },
      label: "si Solaire (sans chauffage)" },
    { id: "r3", from: "q_project", to: "q_home_type",
      cond: { all: [{ field: "q_project", op: "not_contains", value: "c_heat" },
                    { field: "q_project", op: "not_contains", value: "c_solar" }] },
      label: "sinon" },
    { id: "r4", from: "q_heat_type", to: "q_solar_kw",
      cond: { all: [{ field: "q_project", op: "contains", value: "c_solar" }] },
      label: "si solaire aussi" },
    { id: "r5", from: "q_owner", to: "q_timing",
      cond: { all: [{ field: "q_owner", op: "eq", value: "no" }] },
      label: "skip budget si locataire" },
  ],
};

// ── Evaluation helpers ──────────────────────────────────────────────────────

const valueMatches = (val, op, target) => {
  switch (op) {
    case "eq":  return Array.isArray(val) ? val.includes(target) : val === target;
    case "neq": return Array.isArray(val) ? !val.includes(target) : val !== target;
    case "contains":     return Array.isArray(val) ? val.includes(target) : String(val ?? "").includes(target);
    case "not_contains": return Array.isArray(val) ? !val.includes(target) : !String(val ?? "").includes(target);
    case "gt":  return Number(val) >  Number(target);
    case "gte": return Number(val) >= Number(target);
    case "lt":  return Number(val) <  Number(target);
    case "lte": return Number(val) <= Number(target);
    case "answered": return val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
    case "empty":    return val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
    default: return false;
  }
};

const evalCondition = (cond, answers) => {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => valueMatches(answers[c.field], c.op, c.value));
  if (cond.any) return cond.any.some ((c) => valueMatches(answers[c.field], c.op, c.value));
  return true;
};

// Given a form + current answers, return the next question id after `currentId`,
// applying logic rules. Falls through to the next sequential question if no rule matches.
const nextQuestionId = (form, currentId, answers) => {
  const rules = form.logic.filter((r) => r.from === currentId);
  for (const r of rules) {
    if (evalCondition(r.cond, answers)) return r.to;
  }
  const idx = form.questions.findIndex((q) => q.id === currentId);
  return form.questions[idx + 1]?.id ?? null;
};

// Resolve the full sequential order for a given set of answers (used for progress).
const resolveFlow = (form, answers) => {
  const seen = new Set();
  const out = [];
  let cur = form.questions[0]?.id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = nextQuestionId(form, cur, answers);
  }
  return out;
};

Object.assign(window, {
  QUESTION_TYPES, QT, QT_GROUPS, INITIAL_FORM,
  valueMatches, evalCondition, nextQuestionId, resolveFlow,
});
