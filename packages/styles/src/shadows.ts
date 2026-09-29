import { colors } from "./colors";

export interface ShadowStyle {
  elevation: number;
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowOpacity: number;
  shadowRadius: number;
}

export interface ShadowOptions {
  color?: string;
  elevation?: number;
  offset?: { width: number; height: number };
  opacity?: number;
  radius?: number;
}

export const createShadow = ({
  color = "#000",
  opacity = 0.15,
  radius = 4,
  offset = { height: 2, width: 0 },
  elevation = 3,
}: ShadowOptions = {}): ShadowStyle => ({
  elevation,
  shadowColor: color,
  shadowOffset: offset,
  shadowOpacity: opacity,
  shadowRadius: radius,
});

export const SHADOWS = {
  large: createShadow({
    color: colors.shadow,
    elevation: 5,
    offset: { height: 4, width: 0 },
    opacity: 0.2,
    radius: 8,
  }),
  medium: createShadow({
    color: colors.shadow,
    elevation: 3,
    offset: { height: 2, width: 0 },
    opacity: 0.12,
    radius: 4,
  }),
  small: createShadow({
    color: colors.shadow,
    elevation: 2,
    offset: { height: 1, width: 0 },
    opacity: 0.08,
    radius: 2,
  }),
} as const;
