import { colors } from "./colors";

export type ShadowStyle = {
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export const createShadow = (
  color = "#000",
  opacity = 0.15,
  radius = 4,
  offset: { width: number; height: number } = { width: 0, height: 2 },
  elevation = 3
): ShadowStyle => ({
  shadowColor: color,
  shadowOffset: offset,
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const SHADOWS = {
  small: createShadow(colors.shadow, 0.08, 2, { width: 0, height: 1 }, 2),
  medium: createShadow(colors.shadow, 0.12, 4, { width: 0, height: 2 }, 3),
  large: createShadow(colors.shadow, 0.2, 8, { width: 0, height: 4 }, 5),
} as const;
