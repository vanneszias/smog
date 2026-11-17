import { tokens } from "@smog/styles/tokens";
import { Easing } from "react-native-reanimated";

/**
 * The motion tokens as Reanimated values, so the app moves like the web:
 * arrives quickly, settles slowly, never bounces (the heart excepted).
 * Constants only; every component that animates still asks
 * `useReducedMotion` and skips the animation.
 */

const [ex1, ey1, ex2, ey2] = tokens.motion.easing.enter;

/** Entrances and exits: the web's `--ease-enter`. */
export const easeEnter = Easing.bezier(ex1, ey1, ex2, ey2);

/** The heart's settle after its pop: the one spring with a small bounce. */
export const popSpring = {
  dampingRatio: tokens.motion.popSpring.dampingRatio,
  duration: tokens.motion.popSpring.duration,
} as const;

/** The named durations in ms (`fast`, `normal`, `slow`, `gesture`). */
export const MOTION_MS = tokens.motion.duration;
