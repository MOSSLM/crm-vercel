"use client";

import Link from "next/link";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DEFAULT_SPRINT_TARGET,
  SprintFlowStep,
  SprintFlowState,
  SPRINT_FLOW_STEPS,
  clearSprintFlow,
  readSprintFlow,
  saveSprintFlow,
} from "@/utils/sprintFlow";

const NEXT_STEP_BY_STEP: Record<SprintFlowStep, SprintFlowStep | null> = {
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
  selectionCount?: number;
  onStartFromSelection?: (targetCount: number) => void;
  progressLabel?: string;
  progressCurrent?: number;
  progressTarget?: number;
  className?: string;
}> = ({ currentStep, selectionCount = 0, onStartFromSelection, progressLabel, progressCurrent, progressTarget, className }) => {
  const { sprintFlow, clear } = useSprintFlowState();
  const [targetInput, setTargetInput] = React.useState(String(DEFAULT_SPRINT_TARGET));

  React.useEffect(() => {
    if (sprintFlow?.targetCount) {
      setTargetInput(String(sprintFlow.targetCount));
    }
  }, [sprintFlow?.targetCount]);

  const progressCount = sprintFlow?.opportunityIds.length ?? 0;
  const targetCount = sprintFlow?.targetCount ?? DEFAULT_SPRINT_TARGET;
  const isComplete = progressCount >= targetCount;
  const uiProgressCurrent = typeof progressCurrent === "number" ? progressCurrent : progressCount;
  const uiProgressTarget = typeof progressTarget === "number" ? progressTarget : targetCount;
  const uiProgress = uiProgressTarget > 0 ? Math.min(100, Math.round((uiProgressCurrent / uiProgressTarget) * 100)) : 0;

  const nextStep = NEXT_STEP_BY_STEP[currentStep];
  const nextStepMeta = nextStep ? SPRINT_FLOW_STEPS.find((step) => step.id === nextStep) : null;

  const handleStartSprint = () => {
    if (!onStartFromSelection) return;
    const parsed = Number(targetInput);
    const finalTarget = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SPRINT_TARGET;
    onStartFromSelection(finalTarget);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          Sprint CRM
          {sprintFlow ? <Badge variant="secondary">En cours</Badge> : <Badge variant="outline">Inactif</Badge>}
        </CardTitle>
        <CardDescription>
          Regroupe le même lot d&apos;opportunités entre Opportunités → Services → Lead Magnet pour bosser par séries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sprintFlow ? (
          currentStep === "opportunities" && onStartFromSelection ? (
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
              <Button onClick={handleStartSprint} disabled={selectionCount === 0}>
                Démarrer avec {selectionCount} opportunité{selectionCount > 1 ? "s" : ""}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Lance le sprint depuis la page Opportunités en sélectionnant d&apos;abord tes opportunités.
            </p>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isComplete ? "default" : "secondary"}>
                {progressCount}/{targetCount} opportunités dans le sprint
              </Badge>
              <span className="text-muted-foreground">{progressLabel ?? "Filtre automatique actif sur cette étape."}</span>
            </div>
            <Progress value={uiProgress} />
            <p className="text-xs text-muted-foreground">
              Progression: {uiProgressCurrent}/{uiProgressTarget}
            </p>
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
