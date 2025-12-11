import { StyleSheet } from "react-native";
import Rive from "rive-react-native";

type RiveSplashScreenProps = {
  onAnimationComplete?: () => void;
};

export default function RiveSplashScreen({
  onAnimationComplete,
}: RiveSplashScreenProps) {
  return (
    <Rive
      onPause={() => {
        onAnimationComplete?.();
      }}
      onStop={() => {
        onAnimationComplete?.();
      }}
      resourceName="Splash"
      style={styles.animation}
    />
  );
}

const styles = StyleSheet.create({
  animation: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
