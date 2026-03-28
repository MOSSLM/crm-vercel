import * as React from "react";
import { Progress as MantineProgress } from "@mantine/core";

function Progress({ value = 0, ...props }: React.ComponentProps<typeof MantineProgress>) {
  return <MantineProgress value={value} radius="xl" size="md" {...props} />;
}

export { Progress };
