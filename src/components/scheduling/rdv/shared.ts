"use client";

/**
 * Helpers de présentation partagés par les écrans du module Rendez-vous.
 * Ils traduisent nos données API vers le vocabulaire de la maquette
 * (jour « auj. / demain », heure « 14:30 », durée, source…).
 */

import type { BookingWithHost } from "@/lib/scheduling/client";
import { SITE_DOMAIN } from "@/lib/site-domain";

/** URL de base côté client (même logique que getAppUrl côté serveur). */
export const getAppUrlClient = (): string => {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return `https://app.${SITE_DOMAIN}`;
};

const dateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** « auj. », « demain », « hier » ou « lun. 12 mai ». */
export const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const yesterday = new Date(today.getTime() - 86400000);
  const k = dateKey(d);
  if (k === dateKey(today)) return "auj.";
  if (k === dateKey(tomorrow)) return "demain";
  if (k === dateKey(yesterday)) return "hier";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
};

/** Libellé long d'un jour, pour les séparateurs de liste. */
export const dayLong = (iso: string): string => {
  const short = dayLabel(iso);
  const full = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  const cap = full.charAt(0).toUpperCase() + full.slice(1);
  return short === "auj." || short === "demain" || short === "hier"
    ? `${short.charAt(0).toUpperCase()}${short.slice(1)} · ${cap}`
    : cap;
};

/** « 14:30 » dans le fuseau du navigateur. */
export const hhmm = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Durée d'une réservation en minutes. */
export const durationOf = (b: { start_at: string; end_at: string }): number =>
  Math.max(0, Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000));

/** Statut d'affichage : les RDV passés confirmés deviennent « past ». */
export const displayStatus = (b: BookingWithHost): string => {
  if (b.status === "cancelled" || b.status === "declined") return "cancelled";
  if (b.status === "pending") return "pending";
  return Date.parse(b.start_at) < Date.now() ? "past" : "confirmed";
};

/** Icône de la source de réservation (page publique / embed / agent). */
export const sourceIcon = (src: string): string =>
  src === "agent" ? "phone" : src === "embed" ? "code" : "globe";

export const sourceTitle = (src: string): string =>
  src === "agent"
    ? "Pris pendant un appel"
    : src === "embed"
      ? "Réservé depuis un site (embed)"
      : src === "api"
        ? "Créé via l'API"
        : "Page publique";

/** Nom d'hôte lisible depuis la jointure API. */
export const hostName = (b: BookingWithHost): string =>
  b.host?.full_name ?? b.host?.email ?? "—";
