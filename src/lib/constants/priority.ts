/**
 * Priority labels used across opportunities, tasks and the pipeline.
 *
 * The database stores French labels (`haute`/`moyenne`/`basse`); some UI
 * components and external integrations expect English. Map both ways here
 * instead of redefining the helper in every consumer.
 */

export type FrPriority = "haute" | "moyenne" | "basse";
export type EnPriority = "high" | "medium" | "low";

export const FR_PRIORITIES: readonly FrPriority[] = ["haute", "moyenne", "basse"] as const;
export const EN_PRIORITIES: readonly EnPriority[] = ["high", "medium", "low"] as const;

export const frToEnPriority = (p?: FrPriority | null): EnPriority | undefined =>
  p === "haute" ? "high" : p === "basse" ? "low" : p === "moyenne" ? "medium" : undefined;

export const enToFrPriority = (p?: EnPriority | null): FrPriority | undefined =>
  p === "high" ? "haute" : p === "low" ? "basse" : p === "medium" ? "moyenne" : undefined;
