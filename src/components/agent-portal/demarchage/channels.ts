// channels.ts — libellé, icône, couleur et CTA de chaque canal de la file.
//
// Les COULEURS ne sont pas réinventées : ce sont celles de `CHANNEL`
// (`src/lib/sales-pipeline/stages.ts`), déjà utilisées par le pipeline
// commercial. Un WhatsApp doit être du même vert des deux côtés.

import { channelOf } from "@/lib/sales-pipeline/stages";
import type { DemKind } from "./types";

export type DemChannel = {
  lb: string;
  ic: string;
  c: string;
  cta: string;
};

const CH: Record<DemKind, DemChannel> = {
  whatsapp: { lb: "WhatsApp", ic: "whatsapp", c: channelOf("whatsapp").color, cta: "Envoyer le WhatsApp" },
  sms: { lb: "SMS", ic: "sms", c: channelOf("sms").color, cta: "Envoyer le SMS" },
  linkedin: { lb: "LinkedIn", ic: "linkedin", c: channelOf("linkedin").color, cta: "Envoyer le message" },
  call: { lb: "Appel", ic: "phone", c: channelOf("call").color, cta: "Appeler" },
  // L'attente n'est pas un canal : rien n'en part. Sa couleur est celle des
  // colonnes d'attente du pipeline, pour qu'on la reconnaisse d'un écran à
  // l'autre.
  wait: { lb: "Attente", ic: "clock", c: "#A24E86", cta: "Noter la réponse" },
};

export const demCh = (k: string): DemChannel => CH[(k as DemKind)] ?? CH.whatsapp;

export const isMessageKind = (k: string): boolean =>
  k === "whatsapp" || k === "sms" || k === "linkedin";
