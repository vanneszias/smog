import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

function Subject() {
  const { show } = useToast();

  return <Button onPress={() => show("Saved")}>Save</Button>;
}

describe("Toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows nothing until something is shown", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows the message", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Saved")).toBeOnTheScreen();
  });

  it("dismisses itself", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("announces itself to assistive technology", () => {
    render(
      <ToastProvider>
        <Subject />
      </ToastProvider>
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Saved")).toHaveProp(
      "accessibilityLiveRegion",
      "polite"
    );
  });

  it("throws outside a provider rather than silently doing nothing", () => {
    const spy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => render(<Subject />)).toThrow(/ToastProvider/);

    spy.mockRestore();
  });
});
