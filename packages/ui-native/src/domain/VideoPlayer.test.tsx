import { render, screen } from "@testing-library/react-native";
import { VideoPlayer } from "./VideoPlayer";

describe("VideoPlayer", () => {
  it("renders a player for a playback id", () => {
    render(<VideoPlayer playbackId="abc" title="Hallo" />);

    expect(screen.getByTestId("root-view")).toBeOnTheScreen();
  });

  it("renders no placeholder alongside a player", () => {
    render(<VideoPlayer playbackId="abc" title="Hallo" />);

    expect(screen.queryByTestId("root-empty")).toBeNull();
  });

  it("renders a labelled placeholder for a null playback id", () => {
    render(<VideoPlayer playbackId={null} title="Hallo" />);

    expect(screen.queryByTestId("root-view")).toBeNull();
    expect(screen.getByText("Video niet beschikbaar")).toBeOnTheScreen();
  });

  it("renders a labelled placeholder for a missing playback id", () => {
    render(<VideoPlayer title="Hallo" />);

    expect(screen.queryByTestId("root-view")).toBeNull();
    expect(screen.getByText("Video niet beschikbaar")).toBeOnTheScreen();
  });

  it("treats an empty playback id as a missing one", () => {
    render(<VideoPlayer playbackId="" title="Hallo" />);

    expect(screen.queryByTestId("root-view")).toBeNull();
  });

  /*
   * A gesture with no video yet is an ordinary state in this data set — a
   * video still processing, or a gesture that never got one — not an error.
   */
  it("does not throw for a gesture with no video yet", () => {
    expect(() =>
      render(<VideoPlayer playbackId={null} title="Hallo" />)
    ).not.toThrow();
  });

  it("gives the player the gesture's title as its accessible name", () => {
    render(<VideoPlayer playbackId="abc" title="Hallo" />);

    expect(screen.getByTestId("root")).toHaveAccessibleName("Hallo");
  });

  it("gives the placeholder the gesture's title as its accessible name too", () => {
    render(<VideoPlayer playbackId={null} title="Hallo" />);

    expect(screen.getByTestId("root")).toHaveAccessibleName("Hallo");
  });

  it("lets a caller's className override a base class", () => {
    render(
      <VideoPlayer
        className="rounded-none"
        playbackId="abc"
        testID="subject"
        title="Hallo"
      />
    );

    expect(screen.getByTestId("subject")).toHaveStyle({ borderRadius: 0 });
  });
});
