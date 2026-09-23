import { useColorScheme } from "nativewind";
import { Image } from "react-native";

/**
 * Metro picks the `@2x`/`@3x` file next to each of these for the device's
 * pixel density, so one `require` per colour covers every screen.
 */
const GREEN_LOGO = require("../../assets/logo-green.png");
const WHITE_LOGO = require("../../assets/logo-white.png");

/** The 1x artwork's own size, in points; the art is 2666.67 × 578.88. */
const LOGO_WIDTH = 147;
const LOGO_HEIGHT = 32;

/**
 * The horizontal SMOG & Co logo: green on the light background, white on
 * the dark one. The colour follows NativeWind's colour scheme, not the OS
 * appearance directly, so a theme chosen in settings switches it too.
 */
export function BrandLogo() {
  const { colorScheme } = useColorScheme();

  return (
    <Image
      accessibilityLabel="SMOG & Co"
      accessibilityRole="image"
      resizeMode="contain"
      source={colorScheme === "dark" ? WHITE_LOGO : GREEN_LOGO}
      style={{ height: LOGO_HEIGHT, width: LOGO_WIDTH }}
      testID="brand-logo"
    />
  );
}
