import { render, screen, waitFor } from "@testing-library/react-native";
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
   *
   * `FlashList`'s near-end check (`useBoundDetection`'s `checkBounds`) runs
   * off a layout commit that lands on a real `setTimeout(fn, 0)` — the
   * jest mock for `requestAnimationFrame` (confirmed directly: a throwaway
   * probe rendering this same component and awaiting
   * `waitFor(() => expect(onEndReached).toHaveBeenCalled())` resolved,
   * where reading the mock synchronously right after `render()` did not).
   * A short window and three fixed-size items comfortably "fit" the
   * measurement stubs `jest.setup.ts` gives `FlashList` (a 900×400 window,
   * a 900-tall content stub), so the list is "near its end" the moment it
   * first lays out — which is what makes `onEndReached` fire at all under
   * these mocks, not a scroll gesture. `waitFor` is what turns that from a
   * race into a deterministic `1`, which is the number this test asserts
   * before ever re-rendering — an earlier version of this test read the
   * call count synchronously, straight after `render()`, before that flush
   * had a chance to run; it was always `0`, and `0 === 0` after two
   * re-renders passed whether or not `onEndReached` was wired to
   * `FlashList` at all.
   */
  it("calls onEndReached once when the end is reached, not once per render", async () => {
    const onEndReached = jest.fn();
    const { rerender } = render(
      <GestureGrid gestures={GESTURES} onEndReached={onEndReached} />
    );

    await waitFor(() => {
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    rerender(<GestureGrid gestures={GESTURES} onEndReached={onEndReached} />);
    rerender(<GestureGrid gestures={GESTURES} onEndReached={onEndReached} />);

    expect(onEndReached).toHaveBeenCalledTimes(1);
  });
});
