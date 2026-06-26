"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { SiteKanban } from "@/components/site-builder/claude-design/SiteKanban";

export default function ClaudeDesignBoardPage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Projets — sites Claude Design</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Suivez la création des sites démo : À faire · En cours · À vérifier · Prêt
            </p>
          </div>
          <Link href="/site-builder">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Site Builder
            </Button>
          </Link>
        </div>

        <SiteKanban />
      </div>
    </AppLayout>
  );
}
