import { useCallback, useState } from "react";

/**
 * A simple hook to manage the visibility state of a bottom sheet or modal.
 *
 * @returns An object containing the visibility state and functions to control it.
 * - `isVisible`: A boolean indicating if the sheet should be visible.
 * - `showBottomSheet`: A function to set `isVisible` to true.
 * - `hideBottomSheet`: A function to set `isVisible` to false.
 */
export const useBottomSheet = () => {
  const [isVisible, setIsVisible] = useState(false);

  const showBottomSheet = useCallback(() => {
    setIsVisible(true);
  }, []);

  const hideBottomSheet = useCallback(() => {
    setIsVisible(false);
  }, []);

  return { isVisible, showBottomSheet, hideBottomSheet };
};
