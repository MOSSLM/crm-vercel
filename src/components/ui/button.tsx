"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button as MantineButton } from "@mantine/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva("font-semibold transition-all", {
  variants: {
    variant: {
      default: "",
      destructive: "",
      outline: "",
      secondary: "",
      ghost: "",
      link: "",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const variantMap = {
  default: "filled",
  destructive: "filled",
  outline: "default",
  secondary: "light",
  ghost: "subtle",
  link: "transparent",
} as const;

const colorMap = {
  default: "indigo",
  destructive: "red",
  outline: "gray",
  secondary: "gray",
  ghost: "gray",
  link: "indigo",
} as const;

const sizeMap = {
  default: "md",
  sm: "sm",
  lg: "lg",
  icon: "md",
} as const;

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const safeVariant = (variant ?? "default") as keyof typeof variantMap;
  const safeSize = (size ?? "default") as keyof typeof sizeMap;
  if (asChild) {
    return <Slot ref={ref} className={cn(buttonVariants({ variant: safeVariant, size: safeSize }), className)} {...props} />;
  }

  return (
    <MantineButton
      ref={ref}
      variant={variantMap[safeVariant]}
      color={colorMap[safeVariant]}
      size={sizeMap[safeSize]}
      radius="md"
      className={cn(buttonVariants({ variant: safeVariant, size: safeSize }), className)}
      style={safeSize === "icon" ? { width: 42, height: 42, padding: 0 } : undefined}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
