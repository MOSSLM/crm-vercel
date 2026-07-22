/**
 * Translation between Zadarma's wire vocabulary and our provider-agnostic enums.
 */

import type { CallDisposition } from "../../core/types";

/** Zadarma `disposition` string → our normalised disposition. */
export function mapDisposition(disposition?: string | null): CallDisposition | undefined {
  if (!disposition) return undefined;
  switch (disposition.toLowerCase().trim()) {
    case "answered":
      return "answered";
    case "busy":
      return "busy";
    case "cancel":
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "no answer":
    case "no-answer":
    case "noanswer":
      return "no_answer";
    case "failed":
    case "no money":
    case "no limit":
    case "unallocated number":
      return "failed";
    default:
      return undefined;
  }
}

/** Zadarma notification event names. */
export const ZADARMA_EVENTS = [
  "NOTIFY_START",
  "NOTIFY_INTERNAL",
  "NOTIFY_ANSWER",
  "NOTIFY_END",
  "NOTIFY_OUT_START",
  "NOTIFY_OUT_END",
  "NOTIFY_RECORD",
  "NOTIFY_IVR",
] as const;

export type ZadarmaEvent = (typeof ZADARMA_EVENTS)[number];

export function isZadarmaEvent(value: unknown): value is ZadarmaEvent {
  return typeof value === "string" && (ZADARMA_EVENTS as readonly string[]).includes(value);
}
