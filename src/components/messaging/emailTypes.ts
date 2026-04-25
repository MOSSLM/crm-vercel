import type { Contact, Company, Opportunity } from "@/types";

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

export const TEMPLATES = [
  {
    id: "lead_magnet",
    label: "Envoi Lead Magnet",
    subject: "Votre audit gratuit est prêt — {{company_name}}",
    body: `Bonjour {{contact_name}},

J'espère que vous allez bien.

Suite à notre échange, j'ai le plaisir de vous partager votre audit personnalisé pour {{company_name}} :

👉 {{lead_magnet_url}}

Ce document vous donne une vision claire de vos opportunités d'amélioration et des leviers concrets pour développer votre activité.

N'hésitez pas à me faire part de vos questions — je reste disponible pour en discuter.

Bonne lecture,`,
  },
  {
    id: "suivi",
    label: "Relance / Suivi",
    subject: "Suite à notre conversation — {{company_name}}",
    body: `Bonjour {{contact_name}},

Je me permets de revenir vers vous suite à notre dernier échange concernant {{company_name}}.

Avez-vous eu l'occasion de réfléchir à notre proposition ? Je serais ravi(e) d'échanger avec vous pour répondre à vos éventuelles questions.

Dans l'attente de vous lire,`,
  },
  {
    id: "premier_contact",
    label: "Premier contact",
    subject: "Développer la visibilité de {{company_name}} en ligne",
    body: `Bonjour {{contact_name}},

Je me permets de vous contacter car j'ai identifié plusieurs opportunités pour renforcer la présence en ligne de {{company_name}}.

Je serais ravi(e) de vous présenter notre approche en quelques minutes — auriez-vous un créneau cette semaine ?

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
