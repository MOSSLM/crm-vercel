"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  ArrowRight,
  Repeat,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { RecentActivity } from "./types";

type TaskStatus = "a_faire" | "en_cours" | "termine";
type TaskPriority = "haute" | "moyenne" | "basse";

interface TaskCalendarItem {
  id: string;
  titre: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
}

interface MonthDay {
  dateKey: string;
  day: number;
  tasks: TaskCalendarItem[];
}

interface Props {
  recentActivity: RecentActivity[];
  totalRelances: number;
  totalSigned: number;
  totalCollected: number;
  todayTasks: TaskCalendarItem[];
  todayKey: string;
  monthDays: (MonthDay | null)[];
  taskMonthLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}

const priorityBadgeClasses: Record<TaskPriority, string> = {
  haute: "bg-red-100 text-red-700 border-red-200",
  moyenne: "bg-orange-100 text-orange-700 border-orange-200",
  basse: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <ArrowUp className="h-4 w-4 text-green-600" />;
  if (trend === "down") return <ArrowDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-600" />;
}

export function RecentActivityCard({
  recentActivity,
  totalRelances,
  totalSigned,
  totalCollected,
  todayTasks,
  todayKey,
  monthDays,
  taskMonthLabel,
  onPreviousMonth,
  onNextMonth,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activité récente</CardTitle>
        <CardDescription>Résumé de votre activité commerciale</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-4">
          {/* Activity list */}
          <div className="space-y-4 lg:col-span-3">
            <div className="grid gap-2 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-2 md:p-3 border rounded-lg">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1 md:gap-2">
                      <activity.icon className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs md:text-sm font-medium leading-tight truncate">
                        <span className="md:hidden">{activity.shortAction}</span>
                        <span className="hidden md:inline">{activity.action}</span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-4 md:ml-6">{activity.period}</p>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                    <span className="text-sm md:text-lg font-bold">{activity.count}</span>
                    <div className="hidden md:block">
                      <TrendIcon trend={activity.trend} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 md:space-y-0 md:grid md:gap-3 md:grid-cols-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium">Relances totales</span>
                  </div>
                  <span className="text-xl font-bold text-blue-600">{totalRelances}</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">Total cumulé des relances</p>
              </div>

              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium">Taux d&apos;encaissement</span>
                  </div>
                  <span className="text-xl font-bold text-green-600">
                    {totalSigned > 0 ? Math.round((totalCollected / totalSigned) * 100) : 0}%
                  </span>
                </div>
                <p className="text-xs text-green-600 mt-1">Part encaissée du signé</p>
              </div>
            </div>
          </div>

          {/* Task calendar */}
          <Card className="border-dashed">
            <CardHeader className="pb-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Tâches du jour</CardTitle>
                  <CardDescription>{todayTasks.length} à exécuter aujourd&apos;hui</CardDescription>
                </div>
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/production/taches" aria-label="Voir les tâches">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {todayTasks.length > 0 ? (
                  todayTasks.slice(0, 3).map((task) => (
                    <Tooltip key={task.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className={priorityBadgeClasses[task.priority]}>
                          {task.titre.length > 12 ? task.titre.slice(0, 12) + "…" : task.titre}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{task.titre}</TooltipContent>
                    </Tooltip>
                  ))
                ) : (
                  <Badge variant="secondary">Aucune tâche aujourd&apos;hui</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreviousMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="capitalize">{taskMonthLabel}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
                {["L", "M", "M", "J", "V", "S", "D"].map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {monthDays.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} className="h-8" />;
                  const isToday = day.dateKey === todayKey;
                  const hasTasks = day.tasks.length > 0;

                  return (
                    <Tooltip key={day.dateKey}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={`h-8 rounded-md border text-xs ${
                            isToday
                              ? "border-primary bg-primary/10 font-semibold"
                              : "border-border"
                          } ${hasTasks ? "text-primary" : "text-muted-foreground"}`}
                        >
                          {day.day}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {hasTasks
                          ? `${day.tasks.length} tâche(s) — ${day.tasks
                              .slice(0, 3)
                              .map((t) => t.titre)
                              .join(", ")}`
                          : "Aucune tâche"}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
