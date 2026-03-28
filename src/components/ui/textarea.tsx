import * as React from "react";
import { Textarea as MantineTextarea } from "@mantine/core";
import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <MantineTextarea radius="md" className={cn(className)} minRows={3} {...props} />;
}

export { Textarea };
