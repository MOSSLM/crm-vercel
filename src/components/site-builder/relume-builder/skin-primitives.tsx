"use client";

import React from "react";

type Cn = string | false | null | undefined;
const cx = (...xs: Cn[]) => xs.filter(Boolean).join(" ");

// ─── Button ───────────────────────────────────────────────────────────────────

export type BtnVariant = "ghost" | "outline" | "subtle" | "primary" | "accent" | "magic" | "danger";
export type BtnSize = "xs" | "sm" | "md";

export const Btn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: boolean;
  pressed?: boolean;
}>(function Btn({ variant, size, icon, pressed, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      aria-pressed={pressed ? "true" : undefined}
      className={cx("btn", variant && variant, size && size, icon && "icon", className)}
      {...rest}
    >
      {children}
    </button>
  );
});

// ─── Segmented control ────────────────────────────────────────────────────────

export function Seg({ className, compact, children }: { className?: string; compact?: boolean; children: React.ReactNode }) {
  return <div className={cx("seg", compact && "compact", className)}>{children}</div>;
}

export function SegButton({ pressed, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      aria-pressed={pressed ? "true" : undefined}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

export type PillTone = "default" | "ok" | "info" | "warn" | "accent" | "magic" | "danger";

export function Pill({ tone = "default", className, children }: { tone?: PillTone; className?: string; children: React.ReactNode }) {
  return <span className={cx("pill", tone !== "default" && tone, className)}>{children}</span>;
}

// ─── TopChip (topbar dropdown trigger pill) ───────────────────────────────────

export const TopChip = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { empty?: boolean }>(
  function TopChip({ empty, className, children, ...rest }, ref) {
    return (
      <button ref={ref} className={cx("topchip", empty && "empty", className)} {...rest}>
        {children}
      </button>
    );
  },
);

// ─── Pane (left/right sidebar column) ─────────────────────────────────────────

export function Pane({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return <aside className={cx("pane", className)} style={style}>{children}</aside>;
}

export function PaneHeader({
  contextual,
  withIcon,
  actions,
  className,
  children,
}: {
  contextual?: boolean;
  withIcon?: boolean;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("pane-hd", contextual && "contextual", className)}>
      <div className={withIcon ? "title-with-icon" : undefined}>{children}</div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function PaneBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("pane-body", className)}>{children}</div>;
}

// ─── Section group (accordion in pane) ────────────────────────────────────────

export function SectionGroup({
  title,
  count,
  defaultOpen = true,
  className,
  children,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cx("section", className)}>
      <button
        type="button"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((o) => !o)}
        className="section-hd"
        style={{ width: "100%", appearance: "none", border: 0, background: "transparent", textAlign: "left" }}
      >
        <ChevSmall className="chev" />
        <span>{title}</span>
        {count != null && <span className="count">{count}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function ChevSmall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cx("ico-sm", className)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── Field & label ────────────────────────────────────────────────────────────

export function Field({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("field", className)}>{children}</div>;
}

export function FieldLabel({ required, hint, className, children }: { required?: boolean; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("field-label", className)}>
      <span>{children}</span>
      {required && <span className="req">*</span>}
      {hint != null && <span className="hint">{hint}</span>}
    </div>
  );
}

// ─── Toggle (binary switch) ───────────────────────────────────────────────────

export function Toggle({ checked, onChange, className, ...rest }: { checked: boolean; onChange: (v: boolean) => void; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={() => onChange(!checked)}
      className={cx("toggle", className)}
      {...rest}
    />
  );
}

// ─── Alert soft ───────────────────────────────────────────────────────────────

export function AlertSoft({ tone = "info", className, children }: { tone?: "warn" | "info" | "ok"; className?: string; children: React.ReactNode }) {
  return <div className={cx("alert-soft", tone, className)}>{children}</div>;
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export function ModalShell({
  open,
  size = "md",
  onClose,
  className,
  children,
}: {
  open: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sb-skin">
      <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div className={cx("modal-shell", size, className)} role="dialog" aria-modal="true">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ModalHd({
  icon,
  iconTone = "accent",
  title,
  subtitle,
  right,
  className,
}: {
  icon?: React.ReactNode;
  iconTone?: "accent" | "magic" | "info";
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("modal-hd", className)}>
      {icon != null && (
        <div className={cx("ic-wrap", iconTone !== "accent" && iconTone)}>{icon}</div>
      )}
      <div className="grow">
        <div className="title">{title}</div>
        {subtitle != null && <div className="subtitle">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function ModalBody({ dense, className, children }: { dense?: boolean; className?: string; children: React.ReactNode }) {
  return <div className={cx("modal-body", dense && "dense", className)}>{children}</div>;
}

export function ModalFt({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("modal-ft", className)}>{children}</div>;
}

// ─── Popover ──────────────────────────────────────────────────────────────────

export function Pop({ style, className, children, onClick }: { style?: React.CSSProperties; className?: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return <div className={cx("pop", className)} style={style} onClick={onClick}>{children}</div>;
}

// ─── Small inline cx helper (export for reuse) ────────────────────────────────

export { cx };
