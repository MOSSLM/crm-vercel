"use client";

import React from "react";
import { CLAUDE_DESIGN_THEME_CSS } from "./claude-design-theme.css";

/**
 * Injects the scoped builder chrome styles (ported from the SAMA "Builder
 * Designs Claude" mockup). Everything is namespaced under `.cd-scope` so the
 * mockup palette/typography never bleeds into the surrounding CRM (shadcn) UI.
 *
 * Wrap the builder/hub content in a `.cd-scope` element and render this once
 * inside it.
 */
export function ClaudeDesignTheme() {
  return <style dangerouslySetInnerHTML={{ __html: CLAUDE_DESIGN_THEME_CSS }} />;
}

export default ClaudeDesignTheme;
