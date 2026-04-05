"use client";

export const SPRINT_FLOW_KEY = "crm_sprint_flow_v1";

export type SprintFlowStep = "qualification" | "opportunities" | "services" | "lead_magnet";

export const SPRINT_FLOW_STEPS: Array<{ id: SprintFlowStep; label: string; href: string }> = [
  { id: "qualification", label: "Qualification", href: "/qualification" },
  { id: "opportunities", label: "Opportunités", href: "/opportunities" },
  { id: "services", label: "Services entreprises", href: "/services-entreprises" },
  { id: "lead_magnet", label: "Lead magnet", href: "/production/lead-magnet" },
];

export type SprintFlowState = {
  targetCount: number;
  companyIds: number[];
  startedAt: string;
};

export const DEFAULT_SPRINT_TARGET = 10;

export const readSprintFlow = (): SprintFlowState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPRINT_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SprintFlowState>;
    if (!parsed || typeof parsed !== "object") return null;

    const targetCount = Number(parsed.targetCount);
    const companyIds = Array.isArray(parsed.companyIds)
      ? parsed.companyIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : [];

    if (!Number.isInteger(targetCount) || targetCount <= 0) return null;

    return {
      targetCount,
      companyIds: Array.from(new Set(companyIds)),
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const saveSprintFlow = (state: SprintFlowState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SPRINT_FLOW_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("sprint-flow-updated"));
};

export const clearSprintFlow = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SPRINT_FLOW_KEY);
  window.dispatchEvent(new Event("sprint-flow-updated"));
};
