import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `value` / `defaultValue` / `onChange`, the Radix convention the web kit
 * follows: controlled when `value` is defined, otherwise it keeps its own.
 * The setter is stable; it always calls the latest `onChange`.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void
): [T, (next: T) => void];
/** Without a default the state may be empty (a Select with no choice yet). */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T | undefined,
  onChange?: (next: T) => void
): [T | undefined, (next: T) => void];
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T | undefined,
  onChange?: (next: T) => void
): [T | undefined, (next: T) => void] {
  const [own, setOwn] = useState<T | undefined>(defaultValue);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const current = value === undefined ? own : value;
  const set = useCallback((next: T): void => {
    setOwn(next);
    onChangeRef.current?.(next);
  }, []);
  return [current, set];
}
