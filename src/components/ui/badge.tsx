import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Badge as MantineBadge } from "@mantine/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva("", {
  variants: { variant: { default: "", secondary: "", destructive: "", outline: "" } },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant = "default", asChild = false, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  if (asChild) {
    const Comp = Slot;
    return <Comp className={cn(className)} {...props} />;
  }

  const color = variant === "destructive" ? "red" : variant === "secondary" ? "gray" : "indigo";
  const v = variant === "outline" ? "outline" : "light";
  return <MantineBadge variant={v} color={color} radius="sm" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
