import {
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";

function report(error: unknown): void {
  // Haptics are feedback only; a device without them must not break a tap.
  console.error("[uiNative] Failed to play haptic feedback:", error);
}

/** A light tick for toggles (Switch, Chip, a heart switched off; spec §16). */
export function hapticToggle(): void {
  selectionAsync().catch(report);
}

/** A light tap when something is kept (the heart switched on). */
export function hapticCommit(): void {
  impactAsync(ImpactFeedbackStyle.Light).catch(report);
}

/**
 * A warning pulse when a destructive action is confirmed (the confirm of a
 * danger `AlertDialog`), never when the confirmation merely opens.
 */
export function hapticDanger(): void {
  notificationAsync(NotificationFeedbackType.Warning).catch(report);
}

/** A success pulse, in the same frame as a success toast appears. */
export function hapticSuccess(): void {
  notificationAsync(NotificationFeedbackType.Success).catch(report);
}
