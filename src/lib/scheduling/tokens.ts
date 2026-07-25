import { randomBytes } from "crypto";

/**
 * Jeton opaque non devinable pour les liens publics de gestion d'un booking
 * (reprogrammer / annuler). 32 octets aléatoires → 43 caractères base64url.
 */
export const generateManageToken = (): string =>
  randomBytes(32).toString("base64url");

/** Format attendu d'un manage_token (borne les lookups publics). */
export const isValidManageToken = (token: string): boolean =>
  /^[A-Za-z0-9_-]{20,64}$/.test(token);
