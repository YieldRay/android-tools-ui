import { useRef, useEffect, type ReactNode } from "react";
/**
 * Wraps children in a div that prevents interactions from reaching an ancestor
 * `List` (its ripple + row-navigation onClick).
 *
 * - `pointerdown` is stopped with a NATIVE listener, because soda-material's
 *   List ripple binds `addEventListener("pointerdown")` directly on the List
 *   element; a React synthetic handler runs from the root, too late to stop it.
 * - `click` is stopped with a REACT synthetic handler, NOT a native one. A
 *   native click listener here would call stopPropagation before the event
 *   bubbles to React's root container, preventing the child button's own
 *   `onClick` from ever firing. The synthetic handler stops the row's
 *   navigation onClick while still letting the child button's onClick run.
 */
export function StopPropagation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
