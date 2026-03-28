import * as React from "react";
import { TextInput } from "@mantine/core";
import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <TextInput
      type={type}
      radius="md"
      className={cn(className)}
      styles={{ input: { minHeight: 40, background: "var(--input-background)", borderColor: "var(--border)" } }}
      {...props}
    />
  );
}

export { Input };
