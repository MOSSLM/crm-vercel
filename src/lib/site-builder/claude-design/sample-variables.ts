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
  { token: "{{ entreprise.adresse }}", label: "Adresse", sample: "12 rue de la Paix" },
  { token: "{{ entreprise.ville }}", label: "Ville", sample: "Annecy" },
  { token: "{{ entreprise.code_postal }}", label: "Code postal", sample: "74000" },
  { token: "{{ entreprise.region }}", label: "Région", sample: "Auvergne-Rhône-Alpes" },
  { token: "{{ entreprise.departement }}", label: "Département", sample: "Haute-Savoie" },
  { token: "{{ entreprise.zones_desservies }}", label: "Zones desservies", sample: "Annecy, Seynod, Cran-Gevrier" },
  { token: "{{ entreprise.horaires }}", label: "Horaires", sample: "Lun–Ven 8h–18h" },
  { token: "{{ entreprise.logo_url }}", label: "Logo", sample: "" },
  { token: "{{ entreprise.siret }}", label: "SIRET", sample: "123 456 789 00012" },
  { token: "{{ entreprise.fondateur }}", label: "Fondateur", sample: "Alex" },
  { token: "{{ entreprise.attestation_fluides }}", label: "Attestation fluides", sample: "ACO-00000" },
  { token: "{{ entreprise.email_domain }}", label: "Domaine email", sample: "entreprise.fr" },
  { token: "{{ entreprise.annee_experience }}", label: "Années d'expérience", sample: "15" },
  { token: "{{ entreprise.clients_count }}", label: "Clients", sample: "500" },
];

/** Sample values keyed by token key (without braces), for editor/draft preview. */
export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(
  CLAUDE_DESIGN_VARIABLES.map((v) => [v.token.replace(/\{\{\s*|\s*\}\}/g, ""), v.sample]),
);
