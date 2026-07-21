import type { Contact, Company, Opportunity } from "@/types";

export type TemplateType =
  | "premier_contact"
  | "relance"
  | "lead_magnet"
  | "suivi"
  | "presentation"
  | "autre";

export interface EmailTemplate {
  id:         string;
  user_id:    string | null;
  name:       string;
  type:       TemplateType;
  subject:    string;
  body:       string;
  is_default: boolean;
  created_at: string;
}

export interface EmailLog {
  id: string;
  to_email: string;
  to_name?: string;
  subject: string;
  status: "sent" | "failed" | "pending";
  sent_at: string;
  contact_id?: string;
  entreprise_id?: number;
  opportunite_id?: string;
  /** "email" (default) or "whatsapp" — email_logs is now a multi-channel log. */
  channel?: "email" | "whatsapp";
  body_text?: string;
}

export interface ContactRow {
  contact: Contact;
  opportunity?: Opportunity;
  companyName: string;
  pipelineName?: string;
  stageName?: string;
  hasLeadMagnet: boolean;
  leadMagnetReady: boolean;
  leadMagnetUrl?: string;
}

export interface CompanyRow {
  company: Company;
  opportunity?: Opportunity;
  pipelineName?: string;
  stageName?: string;
  hasLeadMagnet: boolean;
  leadMagnetReady: boolean;
  leadMagnetUrl?: string;
}

// Union type covering both static templates (label) and DB templates (name)
export type TemplateItem =
  | { id: string; label: string; subject: string; body: string }
  | EmailTemplate;

export function getTemplateName(t: TemplateItem): string {
  return "label" in t ? t.label : t.name;
}

export const TEMPLATES = [
  {
    id: "lead_magnet",
    label: "Envoi Lead Magnet",
    subject: "Votre audit — {{company_name}}",
    body: `Bonjour {{contact_name}},

Comme convenu, voici votre audit pour {{company_name}} :

{{lead_magnet_url}}

Il reprend les points d'amélioration identifiés et des pistes concrètes pour développer votre activité.

Dites-moi si vous avez des questions.

Bonne lecture,`,
  },
  {
    id: "suivi",
    label: "Relance / Suivi",
    subject: "Suite à notre échange — {{company_name}}",
    body: `Bonjour {{contact_name}},

Je reviens vers vous suite à notre dernier échange concernant {{company_name}}.

Avez-vous eu le temps d'y réfléchir ? Je reste disponible si vous avez des questions.

Bonne journée,`,
  },
  {
    id: "premier_contact",
    label: "Premier contact",
    subject: "Présence en ligne de {{company_name}}",
    body: `Bonjour {{contact_name}},

Je me permets de vous contacter : en regardant la présence en ligne de {{company_name}}, j'ai repéré quelques pistes d'amélioration concrètes.

Auriez-vous un créneau cette semaine pour que je vous les présente rapidement ?

Cordialement,`,
  },
  {
    id: "blank",
    label: "Message libre",
    subject: "",
    body: "",
  },
];

export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
