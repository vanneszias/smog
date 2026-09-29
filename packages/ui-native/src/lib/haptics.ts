import {
  NotificationFeedbackType,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";

function report(error: unknown): void {
  // Haptics are feedback only; a device without them must not break a tap.
  console.error("[uiNative] Failed to play haptic feedback:", error);
}

/** A light tick for toggles (Switch, Chip; spec §16). */
export function hapticToggle(): void {
  selectionAsync().catch(report);
}

/** A warning pulse when a destructive (`danger`) action is confirmed. */
export function hapticDanger(): void {
  notificationAsync(NotificationFeedbackType.Warning).catch(report);
}
