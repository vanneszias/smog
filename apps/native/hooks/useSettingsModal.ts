import { useCallback, useState } from "react";
import { Linking } from "react-native";

export const useSettingsModal = () => {
  const [isVisible, setIsVisible] = useState(false);

  const showModal = useCallback(() => {
    setIsVisible(true);
  }, []);

  const hideModal = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleSettingsPress = useCallback(
    (navigateToSettings: () => void) => {
      hideModal();
      navigateToSettings();
    },
    [hideModal]
  );

  const handleAboutPress = useCallback(() => {
    hideModal();
    Linking.openURL("https://smog.vlaanderen/over-ons");
  }, [hideModal]);

  const handleContactPress = useCallback(() => {
    hideModal();
    Linking.openURL("https://smog.vlaanderen/contact");
  }, [hideModal]);

  return {
    isVisible,
    showModal,
    hideModal,
    handleSettingsPress,
    handleAboutPress,
    handleContactPress,
  };
};
