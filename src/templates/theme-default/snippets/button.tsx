import React from "react";

interface ButtonProps {
  text: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  variables?: Record<string, string>;
}

const Button: React.FC<ButtonProps> = ({
  text,
  href,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
}) => {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variants: Record<string, string> = {
    primary:
      "bg-[var(--color-primary)] text-white hover:brightness-110 focus:ring-[var(--color-primary)]",
    secondary:
      "bg-[var(--color-secondary)] text-white hover:brightness-110 focus:ring-[var(--color-secondary)]",
    outline:
      "border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white focus:ring-[var(--color-primary)]",
    ghost:
      "text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 focus:ring-[var(--color-primary)]",
  };

  const sizes: Record<string, string> = {
    sm: "text-sm px-4 py-2",
    md: "text-base px-6 py-3",
    lg: "text-lg px-8 py-4",
  };

  const classes = [base, variants[variant] ?? variants.primary, sizes[size] ?? sizes.md, className].join(" ");

  if (href) {
    return (
      <a href={href} className={classes}>
        {text}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {text}
    </button>
  );
};

export default Button;
