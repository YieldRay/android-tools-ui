import type { ComponentProps, ReactNode } from "react";
import { IconButton, PlainTooltip, TooltipHolder } from "soda-material";

type IconButtonProps = ComponentProps<typeof IconButton>;
type Placement = ComponentProps<typeof TooltipHolder>["placement"];

interface IconButtonWithTooltipProps extends IconButtonProps {
  /** Tooltip label content */
  tooltip: ReactNode;
  placement?: Placement;
}

/**
 * IconButton with a plain tooltip. When the button is `disabled`, the tooltip
 * is dropped entirely — otherwise soda-material's TooltipHolder wraps the
 * trigger in a div whose hover listeners still fire on a disabled button.
 */
export function IconButtonWithTooltip({
  tooltip,
  placement = "bottom",
  ...iconButtonProps
}: IconButtonWithTooltipProps) {
  if (iconButtonProps.disabled) {
    return <IconButton {...iconButtonProps} />;
  }

  return (
    <TooltipHolder
      placement={placement}
      trigger={<IconButton {...iconButtonProps} />}
      content={<PlainTooltip>{tooltip}</PlainTooltip>}
    />
  );
}
