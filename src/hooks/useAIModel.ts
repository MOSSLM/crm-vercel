"use client";

import React from "react";
import type { AIModelId } from "@/components/site-builder/relume-builder/SitemapWorkspace";

const STORAGE_KEY = "site-builder-ai-model";
const DEFAULT_MODEL: AIModelId = "claude-sonnet-4-6";

export function useAIModel(): [AIModelId, (m: AIModelId) => void] {
  const [model, setModelState] = React.useState<AIModelId>(DEFAULT_MODEL);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AIModelId | null;
    if (stored) setModelState(stored);
  }, []);

  const setModel = React.useCallback((m: AIModelId) => {
    setModelState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  return [model, setModel];
}
