"use client";

import { SectionTabsNav } from "@/components/layout/SectionTabsNav";

const items = [
  { label: "Sprint • Opportunités", href: "/actions/sprint" },
  { label: "Sprint • Services", href: "/actions/sprint/services" },
  { label: "Sprint • Lead magnet", href: "/actions/sprint/lead-magnet" },
];

export function SprintModuleTabs() {
  return <SectionTabsNav items={items} />;
}
