/**
 * Sample company variables for a Claude Design preview — used by the editor
 * inline preview AND the server-side draft preview route (which can't import the
 * `"use client"` VariablesPanel). Kept framework-free so both sides share one
 * source of truth. VariablesPanel re-exports these for the client.
 */

/** The variables a Claude design can resolve per company, with sample values. */
export const CLAUDE_DESIGN_VARIABLES: Array<{ token: string; label: string; sample: string }> = [
  { token: "{{ entreprise.nom }}", label: "Nom", sample: "Votre Entreprise" },
  { token: "{{ entreprise.telephone }}", label: "Téléphone", sample: "01 23 45 67 89" },
  { token: "{{ entreprise.telephone_lien }}", label: "Téléphone (lien tel:)", sample: "0123456789" },
  { token: "{{ entreprise.email }}", label: "Email", sample: "contact@entreprise.fr" },
  { token: "{{ entreprise.email_domain }}", label: "Domaine email", sample: "entreprise.fr" },
  { token: "{{ entreprise.adresse }}", label: "Adresse", sample: "12 rue de la Paix" },
  { token: "{{ entreprise.ville }}", label: "Ville", sample: "Annecy" },
  { token: "{{ entreprise.code_postal }}", label: "Code postal", sample: "74000" },
  { token: "{{ entreprise.region }}", label: "Région", sample: "Auvergne-Rhône-Alpes" },
  { token: "{{ entreprise.departement }}", label: "Département", sample: "Haute-Savoie" },
  { token: "{{ entreprise.location }}", label: "Zone principale", sample: "Annecy" },
  { token: "{{ entreprise.zones_desservies }}", label: "Zones desservies", sample: "Annecy, Seynod, Cran-Gevrier" },
  { token: "{{ entreprise.horaires }}", label: "Horaires", sample: "Lun–Ven 8h–18h" },
  { token: "{{ entreprise.logo_url }}", label: "Logo", sample: "" },
  { token: "{{ entreprise.services }}", label: "Services", sample: "Climatisation, Chauffage" },
  { token: "{{ entreprise.note_moyenne }}", label: "Note moyenne", sample: "4,8" },
  { token: "{{ entreprise.nombre_avis }}", label: "Nombre d'avis", sample: "127" },
  { token: "{{ entreprise.site_web_canonique }}", label: "Site web", sample: "https://entreprise.fr" },
  { token: "{{ entreprise.annee_experience }}", label: "Années d'expérience", sample: "15" },
  { token: "{{ entreprise.clients_count }}", label: "Clients", sample: "500" },
  { token: "{{ entreprise.installations }}", label: "Installations réalisées", sample: "1200" },
  { token: "{{ entreprise.qualifications }}", label: "Qualifications (RGE…)", sample: "3" },
];

/** Sample values keyed by token key (without braces), for editor/draft preview. */
export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(
  CLAUDE_DESIGN_VARIABLES.map((v) => [v.token.replace(/\{\{\s*|\s*\}\}/g, ""), v.sample]),
);
