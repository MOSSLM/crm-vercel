"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/components/ui/utils";

/**
 * Studio presentational primitives — the shared visual language of the
 * Studio V1 design. These are pure presentation: page restyles wrap their
 * existing (unchanged) logic/markup in them to get the new look consistently.
 */

export type StudioTab = {
  id: string;
  label: string;
  /** Small mono badge/count shown after the label. */
  badge?: string | number;
  /** Either a link target or a click handler — whichever the page uses. */
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

/** Level-3 tab strip (sits under the topbar). Matches `.tabs-strip`. */
export function StudioTabs({
  tabs,
  className,
  right,
}: {
  tabs: StudioTab[];
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "sticky top-0 z-10 flex h-10 items-center gap-0 border-b border-border bg-background px-4 md:px-[18px]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const content = (
          <>
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "rounded-[3px] px-[5px] py-px font-mono text-[10px]",
                  tab.active ? "bg-[var(--accent-tint)] text-[var(--accent-2)]" : "bg-[var(--bg-2)] text-[var(--text-3)]",
                )}
              >
                {tab.badge}
              </span>
            )}
          </>
        );
        const cls = cn(
          "-mb-px inline-flex h-10 items-center gap-[7px] border-b-2 px-3.5 text-[12.5px] font-medium tracking-[-0.005em] transition-colors",
          tab.active
            ? "border-primary text-foreground"
            : "border-transparent text-[var(--text-3)] hover:text-foreground",
        );
        return tab.href ? (
          <Link key={tab.id} href={tab.href} role="tab" aria-selected={tab.active} className={cls}>
            {content}
          </Link>
        ) : (
          <button key={tab.id} type="button" role="tab" aria-selected={tab.active} onClick={tab.onClick} className={cls}>
            {content}
          </button>
        );
      })}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * Page frame: optional tab strip, a serif title header with an actions slot,
 * then the scrollable content. Use `bare` to skip the header (tabs only).
 */
export function StudioPage({
  title,
  subtitle,
  actions,
  tabs,
  children,
  className,
  contentClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: StudioTab[];
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col", className)}>
      {tabs && tabs.length > 0 && <StudioTabs tabs={tabs} />}
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-6 md:px-8">
          <div className="min-w-0">
            {title && <h1 className="font-serif text-2xl tracking-tight md:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-[var(--text-2)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("flex-1 px-4 pb-16 pt-5 md:px-8", contentClassName)}>{children}</div>
    </div>
  );
}

/** Surface card. Matches `.card` (surface bg, border-2, 14px radius). */
export function StudioCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[14px] border border-[var(--border-2)] bg-[var(--surface)]",
        className,
      )}
      {...props}
    />
  );
}

/** Small mono pill. Matches `.pill`. */
export function StudioPill({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-[5px] rounded-[5px] bg-[var(--bg-2)] px-[7px] font-mono text-[10.5px] font-medium tracking-[0.02em] text-[var(--text-2)]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** A horizontal toolbar row (filters / search) above content. */
export function StudioToolbar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

export default StudioPage;
