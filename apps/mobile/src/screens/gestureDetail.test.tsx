import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import GestureDetailScreen from "../../app/gestures/[id]";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

describe("the gesture detail screen", () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "7" });
  });

  it("shows a loading state before the first response", () => {
    global.fetch = jest.fn(
      () => new Promise(() => undefined)
    ) as unknown as typeof fetch;

    render(<GestureDetailScreen />);

    expect(screen.getByLabelText(/gebaar laden/i)).toBeOnTheScreen();
  });

  it("shows the gesture's name once it arrives", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    render(<GestureDetailScreen />);

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.queryByLabelText(/gebaar laden/i)).toBeNull();
  });

  it("renders the labelled placeholder for a gesture with no video, not an error", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: null })
    ) as unknown as typeof fetch;

    render(<GestureDetailScreen />);

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
    expect(screen.getByText(/video niet beschikbaar/i)).toBeOnTheScreen();
    expect(screen.queryByText(/probeer opnieuw/i)).toBeNull();
  });

  it("shows an error with a retry when the request fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    render(<GestureDetailScreen />);

    expect(await screen.findByText(/probeer opnieuw/i)).toBeOnTheScreen();
  });

  it("retries when the retry control is pressed", async () => {
    const fetchMock = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("offline"))
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<GestureDetailScreen />);

    fireEvent.press(
      await screen.findByRole("button", { name: /probeer opnieuw/i })
    );

    expect(await screen.findByText("Hallo")).toBeOnTheScreen();
  });

  it("goes back when the back control is pressed", async () => {
    global.fetch = jest.fn(() =>
      json({ categories: [], id: 7, name: "Hallo", playbackId: "abc" })
    ) as unknown as typeof fetch;

    render(<GestureDetailScreen />);
    await screen.findByText("Hallo");

    fireEvent.press(screen.getByTestId("back"));

    expect(router.back).toHaveBeenCalled();
  });
});
