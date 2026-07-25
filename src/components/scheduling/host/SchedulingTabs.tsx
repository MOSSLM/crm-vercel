"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarCog, Clock3, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sous-navigation du module Rendez-vous, partagée entre le CRM admin
 * (/rendez-vous/*) et l'espace agent (/espace-agent/rendez-vous/*).
 */
export default function SchedulingTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname() ?? "";
  const tabs = [
    { label: "Réservations", href: basePath, icon: CalendarCheck },
    { label: "Types d'évènements", href: `${basePath}/types`, icon: CalendarCog },
    { label: "Disponibilités", href: `${basePath}/disponibilites`, icon: Clock3 },
    { label: "Ma page & agendas", href: `${basePath}/parametres`, icon: Settings2 },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-sm">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== basePath && pathname.startsWith(tab.href + "/"));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
