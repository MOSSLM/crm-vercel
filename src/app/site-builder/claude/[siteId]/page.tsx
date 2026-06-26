"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ClaudeDesignBuilder } from "@/components/site-builder/claude-design/ClaudeDesignBuilder";

export default function ClaudeDesignEditorPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params?.siteId;

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Éditeur Claude Design</h1>
          <Link href="/site-builder/claude">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Projets
            </Button>
          </Link>
        </div>
        {siteId && <ClaudeDesignBuilder siteId={siteId} />}
      </div>
    </AppLayout>
  );
}
