import { fireEvent, render, screen } from "@testing-library/react-native";
import { GestureCard } from "./GestureCard";

const GESTURE = {
  id: "1",
  name: "Aangenaam kennis met je te maken",
  categories: [{ id: "c1", name: "Begroeting" }],
  playbackId: "abc",
};

describe("GestureCard", () => {
  it("shows the gesture's name", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.getByText(GESTURE.name)).toBeOnTheScreen();
  });

  it("keeps a long name on one line", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.getByText(GESTURE.name)).toHaveProp("numberOfLines", 1);
  });

  it("is not a button without onPress", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.queryByRole("button", { name: GESTURE.name })).toBeNull();
  });

  it("is a button with onPress", () => {
    const onPress = jest.fn();
    render(<GestureCard gesture={GESTURE} onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: /Aangenaam/ }));

    expect(onPress).toHaveBeenCalledWith("1");
  });

  it("renders no favourite control without onFavorite", () => {
    render(<GestureCard gesture={GESTURE} />);

    expect(screen.queryByLabelText("Favourite")).toBeNull();
  });

  it("keeps one accessible name in both favourite states", () => {
    const { rerender } = render(
      <GestureCard
        favoriteLabel="Favourite"
        gesture={GESTURE}
        isFavorite={false}
        onFavorite={() => undefined}
      />
    );

    expect(screen.getByLabelText("Favourite")).not.toBeSelected();

    rerender(
      <GestureCard
        favoriteLabel="Favourite"
        gesture={GESTURE}
        isFavorite
        onFavorite={() => undefined}
      />
    );

    expect(screen.getByLabelText("Favourite")).toBeSelected();
  });

  it("renders a gesture with no categories", () => {
    render(<GestureCard gesture={{ id: "2", name: "Hallo" }} />);

    expect(screen.getByText("Hallo")).toBeOnTheScreen();
  });
});
