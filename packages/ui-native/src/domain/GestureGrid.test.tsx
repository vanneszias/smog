import { render, screen } from "@testing-library/react-native";
import { Text } from "../components/Text";
import type { GestureSummary } from "./GestureCard";
import { GestureGrid } from "./GestureGrid";

const GESTURES: GestureSummary[] = [
  { id: "1", name: "Hallo" },
  { id: "2", name: "Dag" },
  { id: "3", name: "Dank je wel" },
];

describe("GestureGrid", () => {
  it("renders every gesture", () => {
    render(<GestureGrid gestures={GESTURES} />);

    expect(screen.getByText("Hallo")).toBeOnTheScreen();
    expect(screen.getByText("Dag")).toBeOnTheScreen();
    expect(screen.getByText("Dank je wel")).toBeOnTheScreen();
  });

  it("renders an empty state for an empty array", () => {
    render(<GestureGrid empty={<Text>Geen gebaren</Text>} gestures={[]} />);

    expect(screen.getByText("Geen gebaren")).toBeOnTheScreen();
  });

  it("renders a default empty state when no empty prop is given", () => {
    render(<GestureGrid gestures={[]} />);

    expect(screen.getByText("Geen gebaren gevonden")).toBeOnTheScreen();
  });

  it("renders no empty state when there are gestures", () => {
    render(
      <GestureGrid empty={<Text>Geen gebaren</Text>} gestures={GESTURES} />
    );

    expect(screen.queryByText("Geen gebaren")).toBeNull();
  });

  it("shows skeletons rather than an empty state while loading", () => {
    render(
      <GestureGrid empty={<Text>Geen gebaren</Text>} gestures={[]} loading />
    );

    expect(screen.queryByText("Geen gebaren")).toBeNull();
  });

  it("shows skeletons rather than cards while loading", () => {
    render(<GestureGrid gestures={GESTURES} loading />);

    expect(screen.queryByText("Hallo")).toBeNull();
  });

  it("renders a custom item when renderItem is given", () => {
    render(
      <GestureGrid
        gestures={GESTURES}
        renderItem={(gesture) => <Text>{gesture.name.toUpperCase()}</Text>}
      />
    );

    expect(screen.getByText("HALLO")).toBeOnTheScreen();
    expect(screen.queryByText("Hallo")).toBeNull();
  });

  /*
   * The bug this guards: an unstable inline `onEndReached` or a layout
   * re-measurement on every render can fire the callback again each time
   * the list re-renders, not only when the list is actually approached —
   * paging in duplicate results.
   */
  it("calls onEndReached once when the end is reached, not once per render", () => {
    const onEndReached = jest.fn();
    const { rerender } = render(
      <GestureGrid gestures={GESTURES} onEndReached={onEndReached} />
    );

    const callsAfterMount = onEndReached.mock.calls.length;

    rerender(<GestureGrid gestures={GESTURES} onEndReached={onEndReached} />);
    rerender(<GestureGrid gestures={GESTURES} onEndReached={onEndReached} />);

    expect(onEndReached.mock.calls.length).toBe(callsAfterMount);
  });
});
