import { useState } from "react";
import { Button, Dialog, List, RadioButton } from "soda-material";
import { Scrim } from "./Scrim";
import { IconButtonWithTooltip } from "./IconButtonWithTooltip";
import { mdiFormatListBulleted } from "@mdi/js";

interface SelectDialogProps {
  headline: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Format option label, defaults to identity */
  formatLabel?: (option: string) => string;
  /** Tooltip text for the trigger button */
  tooltip?: string;
  /** Custom trigger icon path, defaults to mdiFormatListBulleted */
  iconPath?: string;
  disabled?: boolean;
}

export function SelectDialog({
  headline,
  options,
  value,
  onChange,
  formatLabel,
  tooltip = "Select",
  iconPath = mdiFormatListBulleted,
  disabled,
}: SelectDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButtonWithTooltip
        tooltip={tooltip}
        placement="left"
        path={iconPath}
        onClick={() => setOpen(true)}
        disabled={disabled}
      />
      <Scrim open={open} center onScrimClick={() => setOpen(false)}>
        <Dialog
          headline={headline}
          noPadding
          buttons={
            <Button onClick={() => setOpen(false)} variant="text">
              Cancel
            </Button>
          }
        >
          <div className="min-w-xs my-8">
            {options.map((opt) => (
              <List
                key={opt}
                headline={<span className="font-mono text-sm">{formatLabel ? formatLabel(opt) : opt}</span>}
                trailingIcon={<RadioButton checked={opt === value} />}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </Dialog>
      </Scrim>
    </>
  );
}
