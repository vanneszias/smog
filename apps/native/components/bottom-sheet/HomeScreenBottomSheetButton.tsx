import type React from "react";
import { CircularButton } from "@/components/common";

interface SettingsButtonProps {
  onPress: () => void;
}

const HomeScreenBottomSheetButton: React.FC<SettingsButtonProps> = ({
  onPress,
}) => <CircularButton icon="menu" onPress={onPress} size="large" />;

export default HomeScreenBottomSheetButton;
