import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { TextLink } from "../../../../../ui-native/src/components/text-link";
import { renderKit } from "../../../../support/ui-native/render";

describe("TextLink", () => {
  it("is a pressable link named by its text with a 44 pt target", async () => {
    const onPress = jest.fn();
    await renderKit(<TextLink onPress={onPress}>Maak er een aan</TextLink>);
    const link = screen.getByRole("link", { name: "Maak er een aan" });
    expect(link).toHaveStyle({ paddingBottom: 12, paddingTop: 12 });
    await fireEvent.press(link);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
