import * as React from "react";
import { Text } from "@mantine/core";
import { cn } from "./utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <Text component="label" fw={600} size="sm" className={cn(className)} {...props} />;
}

export { Label };
