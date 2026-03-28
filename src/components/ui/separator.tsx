import * as React from "react";
import { Divider } from "@mantine/core";

function Separator({ orientation = "horizontal", ...props }: { orientation?: "horizontal" | "vertical" } & React.ComponentProps<typeof Divider>) {
  return <Divider orientation={orientation} {...props} />;
}

export { Separator };
