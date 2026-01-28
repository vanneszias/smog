import { colors } from "./colors";

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ShadowOptions {
  color?: string;
  opacity?: number;
  radius?: number;
  offset?: { width: number; height: number };
  elevation?: number;
}

export const createShadow = ({
  color = "#000",
  opacity = 0.15,
  radius = 4,
  offset = { width: 0, height: 2 },
  elevation = 3,
}: ShadowOptions = {}): ShadowStyle => ({
  shadowColor: color,
  shadowOffset: offset,
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const SHADOWS = {
  small: createShadow({
    color: colors.shadow,
    opacity: 0.08,
    radius: 2,
    offset: { width: 0, height: 1 },
    elevation: 2,
  }),
  medium: createShadow({
    color: colors.shadow,
    opacity: 0.12,
    radius: 4,
    offset: { width: 0, height: 2 },
    elevation: 3,
  }),
  large: createShadow({
    color: colors.shadow,
    opacity: 0.2,
    radius: 8,
    offset: { width: 0, height: 4 },
    elevation: 5,
  }),
} as const;
