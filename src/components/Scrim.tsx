import type { CSSProperties, ReactNode } from "react";

interface ScrimProps {
  open: boolean;
  center?: boolean;
  onScrimClick?: () => void;
  children?: ReactNode;
}

const scrimStyle: CSSProperties = {
  animation: "scrim-fade-in 200ms cubic-bezier(0.2, 0, 0, 1) forwards",
};

const contentStyle: CSSProperties = {
  animation: "scrim-content-in 250ms cubic-bezier(0.05, 0.7, 0.1, 1) forwards",
};

/** Scrim with M3 enter animation. Unmounts immediately on close. */
export function Scrim({ open, center, onScrimClick, children }: ScrimProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      style={{
        ...scrimStyle,
        ...(center ? { display: "flex", alignItems: "center", justifyContent: "center" } : undefined),
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onScrimClick?.();
      }}
    >
      <div style={contentStyle}>{children}</div>
    </div>
  );
}
