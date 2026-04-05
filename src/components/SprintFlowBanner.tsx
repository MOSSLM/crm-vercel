"use client";

import Link from "next/link";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_SPRINT_TARGET,
  SprintFlowStep,
  SPRINT_FLOW_STEPS,
  SprintFlowState,
  clearSprintFlow,
  readSprintFlow,
  saveSprintFlow,
} from "@/utils/sprintFlow";

const NEXT_STEP_BY_STEP: Record<SprintFlowStep, SprintFlowStep | null> = {
  qualification: "opportunities",
  opportunities: "services",
  services: "lead_magnet",
  lead_magnet: null,
};

export const useSprintFlowState = () => {
  const [sprintFlow, setSprintFlow] = React.useState<SprintFlowState | null>(null);

  React.useEffect(() => {
    const refresh = () => setSprintFlow(readSprintFlow());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("sprint-flow-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("sprint-flow-updated", refresh);
    };
  }, []);

  return {
    sprintFlow,
    save: (nextState: SprintFlowState) => {
      saveSprintFlow(nextState);
      setSprintFlow(nextState);
    },
    clear: () => {
      clearSprintFlow();
      setSprintFlow(null);
    },
  };
};

export const SprintFlowBanner: React.FC<{
  currentStep: SprintFlowStep;
  qualifyingCount?: number;
  className?: string;
}> = ({ currentStep, qualifyingCount, className }) => {
  const { sprintFlow, save, clear } = useSprintFlowState();
  const [targetInput, setTargetInput] = React.useState(String(DEFAULT_SPRINT_TARGET));

  React.useEffect(() => {
    if (sprintFlow?.targetCount) {
      setTargetInput(String(sprintFlow.targetCount));
    }
  }, [sprintFlow?.targetCount]);

  const progressCount = sprintFlow?.companyIds.length ?? 0;
  const targetCount = sprintFlow?.targetCount ?? DEFAULT_SPRINT_TARGET;
  const isComplete = progressCount >= targetCount;

  const nextStep = NEXT_STEP_BY_STEP[currentStep];
  const nextStepMeta = nextStep ? SPRINT_FLOW_STEPS.find((step) => step.id === nextStep) : null;

  const handleStartSprint = () => {
    const parsed = Number(targetInput);
    const finalTarget = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SPRINT_TARGET;
    const nextState: SprintFlowState = {
      targetCount: finalTarget,
      companyIds: [],
      startedAt: new Date().toISOString(),
    };
    save(nextState);
  };

  const helperCount = typeof qualifyingCount === "number" ? qualifyingCount : progressCount;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          Sprint CRM
          {sprintFlow ? <Badge variant="secondary">En cours</Badge> : <Badge variant="outline">Inactif</Badge>}
        </CardTitle>
        <CardDescription>
          Regroupe les mêmes entreprises entre Qualification → Opportunités → Services → Lead Magnet pour bosser par séries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sprintFlow ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-[180px]">
              <Input
                type="number"
                min={1}
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="10"
              />
            </div>
            <Button onClick={handleStartSprint}>Démarrer un sprint</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isComplete ? "default" : "secondary"}>
                {progressCount}/{targetCount} entreprises dans le set
              </Badge>
              {currentStep === "qualification" ? (
                <span className="text-muted-foreground">Qualifiées sur cet écran: {helperCount}</span>
              ) : (
                <span className="text-muted-foreground">Filtre automatique actif sur cette étape.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {nextStepMeta ? (
                isComplete ? (
                  <Button asChild>
                    <Link href={nextStepMeta.href}>Étape suivante: {nextStepMeta.label}</Link>
                  </Button>
                ) : (
                  <Button disabled>Étape suivante: {nextStepMeta.label}</Button>
                )
              ) : null}
              <Button variant="outline" onClick={clear}>Réinitialiser le sprint</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
