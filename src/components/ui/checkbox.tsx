import * as React from "react";
import { Checkbox as MantineCheckbox } from "@mantine/core";

type CheckboxProps = Omit<React.ComponentProps<typeof MantineCheckbox>, "onChange"> & {
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
};

function Checkbox({ onCheckedChange, checked, defaultChecked, ...props }: CheckboxProps) {
  return (
    <MantineCheckbox
      checked={typeof checked === "boolean" ? checked : undefined}
      defaultChecked={defaultChecked as boolean | undefined}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  );
}

export { Checkbox };
