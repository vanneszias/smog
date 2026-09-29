import { createContext, type ReactNode, useContext } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Where overlays (Dialog, Sheet, Menu, Select, Tooltip, Toast) portal to.
 * Defaults to `document.body`. A themed subtree that is not the page theme
 * (the dark column of `/dev/ui`) passes an element inside its `.dark`
 * wrapper, so its overlays keep the theme variables.
 */
export function PortalContainerProvider({
  children,
  container,
}: {
  children: ReactNode;
  container: HTMLElement | null;
}): ReactNode {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/** The portal container for overlays; `undefined` means `document.body`. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
