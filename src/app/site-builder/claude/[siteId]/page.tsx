"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ClaudeDesignBuilder } from "@/components/site-builder/claude-design/ClaudeDesignBuilder";

/**
 * Full-screen Claude Design template editor — no CRM sidebar (mirrors the base
 * site builder which renders without AppLayout). Navigation back to the CRM is
 * the arrow in the editor topbar.
 */
export default function ClaudeDesignEditorPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params?.siteId;
  if (!siteId) return null;
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <ClaudeDesignBuilder siteId={siteId} />
    </div>
  );
}
