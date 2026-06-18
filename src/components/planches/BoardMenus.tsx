"use client";

import React from "react";
import ReactDOM from "react-dom";
import { Icon } from "./boardIcons";

/** Portal target: the .pboard root so scoped CSS + vars apply (fixed-position
 *  popovers aren't clipped by the root's overflow). Falls back to body. */
function portalTarget(): HTMLElement {
  if (typeof document === "undefined") return null as unknown as HTMLElement;
  return document.getElementById("pboard-root") ?? document.body;
}

export function Popover({
  anchorRect,
  open,
  onClose,
  children,
  align = "start",
  offset = 6,
  className = "",
}: {
  anchorRect: DOMRect | null;
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  align?: "start" | "end";
  offset?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; align: string } | null>(null);
  React.useLayoutEffect(() => {
    if (!open || !anchorRect) return;
    const left = align === "end" ? anchorRect.right : anchorRect.left;
    setPos({ top: anchorRect.bottom + offset, left, align });
  }, [open, anchorRect, align, offset]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <div
      ref={ref}
      className={`pboard-pop popover ${className}`}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: pos.align === "end" ? "translateX(-100%)" : "none",
      }}
    >
      {children}
    </div>,
    portalTarget(),
  );
}

export function FloatingMenu({
  point,
  open,
  onClose,
  children,
  w = 224,
}: {
  point: { x: number; y: number } | null;
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  w?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open || !point) return null;
  const left = Math.min(point.x, window.innerWidth - w - 12);
  const top = Math.min(point.y, window.innerHeight - 360);
  return ReactDOM.createPortal(
    <div ref={ref} className="pboard-pop popover menu" style={{ position: "fixed", top, left, width: w }}>
      {children}
    </div>,
    portalTarget(),
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  kbd,
  dot,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  icon?: string;
  danger?: boolean;
  kbd?: string;
  dot?: string;
}) {
  return (
    <button
      className={`menu-item ${danger ? "danger" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {dot ? (
        <span className="menu-dot" style={{ background: dot }} />
      ) : icon ? (
        <Icon name={icon} className="ico" />
      ) : (
        <span className="menu-spacer" />
      )}
      <span className="lbl">{children}</span>
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}

export function MenuSep() {
  return <div className="menu-sep" />;
}
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="menu-label">{children}</div>;
}
