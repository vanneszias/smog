import { StyleSheet, View } from "react-native";
import LogoSvg from "@/assets/images/logo.svg";
import LogoFlexibleSvg from "@/assets/images/logo-flexible.svg";
import { useTheme } from "@/context/ThemeContext";

type LogoProps = {
  variant?: "default" | "white" | "black" | "theme";
  width?: number;
  height?: number;
};

const Logo = ({ variant = "default", width = 240, height = 80 }: LogoProps) => {
  const { theme } = useTheme();

  const getLogoComponent = () => {
    switch (variant) {
      case "white":
        return (
          <LogoFlexibleSvg
            color="#FFFFFF"
            height={height}
            style={styles.logo}
            width={width}
          />
        );
      case "black":
        return (
          <LogoFlexibleSvg
            color="#000000"
            height={height}
            style={styles.logo}
            width={width}
          />
        );
      case "theme":
        return (
          <LogoFlexibleSvg
            color={theme.background}
            height={height}
            style={styles.logo}
            width={width}
          />
        );
      default: {
        // Default is primary green
        return <LogoSvg height={height} style={styles.logo} width={width} />;
      }
    }
  };

  return <View style={styles.logoContainer}>{getLogoComponent()}</View>;
};

const styles = StyleSheet.create({
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    marginBottom: 24,
  },
});

export default Logo;
