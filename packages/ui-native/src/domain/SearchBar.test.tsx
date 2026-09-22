import { fireEvent, render, screen } from "@testing-library/react-native";
import { SearchBar } from "./SearchBar";

const field = (): ReturnType<typeof screen.getByTestId> =>
  screen.getByTestId("root-field");

describe("SearchBar, on the clock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not search on mount", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    jest.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("does not search before the debounce elapses", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    jest.advanceTimersByTime(299);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches once the debounce elapses", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    jest.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  /*
   * The difference between a debounce and a throttle: every keystroke has
   * to restart the clock, not merely rate-limit it.
   */
  it("restarts the wait on every keystroke", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "h");
    jest.advanceTimersByTime(200);
    fireEvent.changeText(field(), "ha");
    jest.advanceTimersByTime(200);
    expect(onSearch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("ha");
  });

  it("reports a word typed at speed once, not once per letter", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "h");
    fireEvent.changeText(field(), "ha");
    fireEvent.changeText(field(), "hal");
    jest.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("honours a caller's delay instead of the default", () => {
    const onSearch = jest.fn();
    render(<SearchBar delay={1000} onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    jest.advanceTimersByTime(300);
    expect(onSearch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(700);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  it("searches immediately on submit, without waiting for the debounce", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    fireEvent(field(), "submitEditing");
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  /*
   * The half that is easy to miss: submitting has to cancel the pending
   * debounce, or the same query is searched twice and the slower answer
   * lands last.
   */
  it("cancels the pending debounce when it submits", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    fireEvent(field(), "submitEditing");
    jest.advanceTimersByTime(1000);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("reports the empty query immediately when it is cleared", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    fireEvent.press(screen.getByLabelText("Wissen"));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("cancels the pending debounce when it is cleared", () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    fireEvent.press(screen.getByLabelText("Wissen"));
    jest.advanceTimersByTime(1000);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not search after it has been unmounted", () => {
    const onSearch = jest.fn();
    const { unmount } = render(<SearchBar onSearch={onSearch} />);
    fireEvent.changeText(field(), "hal");
    unmount();
    jest.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe("SearchBar", () => {
  it("renders a labelled search field", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    expect(screen.getByLabelText("Zoeken")).toBeOnTheScreen();
  });

  it("lets a caller relabel the field", () => {
    render(<SearchBar label="Zoek een gebaar" onSearch={jest.fn()} />);
    expect(screen.getByLabelText("Zoek een gebaar")).toBeOnTheScreen();
  });

  it("starts from a caller's initial query", () => {
    render(<SearchBar defaultValue="hal" onSearch={jest.fn()} />);
    expect(field()).toHaveProp("value", "hal");
  });

  it("keeps what is typed in it", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    fireEvent.changeText(field(), "hal");
    expect(field()).toHaveProp("value", "hal");
  });

  it("keeps the clear button out of the submission path", () => {
    render(<SearchBar defaultValue="hal" onSearch={jest.fn()} />);
    expect(screen.getByLabelText("Wissen")).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });

  it("renders no clear button while the field is empty", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    expect(screen.queryByLabelText("Wissen")).toBeNull();
  });

  it("renders a clear button once something is typed", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    fireEvent.changeText(field(), "h");
    expect(screen.getByLabelText("Wissen")).toBeOnTheScreen();
  });

  it("empties the field on the clear button", () => {
    render(<SearchBar onSearch={jest.fn()} />);
    fireEvent.changeText(field(), "hal");
    fireEvent.press(screen.getByLabelText("Wissen"));
    expect(field()).toHaveProp("value", "");
  });

  it("lets a caller relabel the clear button", () => {
    render(
      <SearchBar
        clearLabel="Leegmaken"
        defaultValue="hal"
        onSearch={jest.fn()}
      />
    );
    expect(screen.getByLabelText("Leegmaken")).toBeOnTheScreen();
  });

  it("is a search landmark", () => {
    /*
     * Queried by testID, not `getByRole("search")`: the root deliberately
     * carries no `accessible` prop of its own, so the field and the clear
     * button stay individually reachable to a screen reader rather than
     * collapsing into one opaque group — the same call `Card`'s
     * `interactive` variant makes for a very different reason. A role
     * without `accessible` is metadata a screen reader still reads off the
     * container without swallowing its children, which `toHaveProp` checks
     * directly.
     */
    render(<SearchBar onSearch={jest.fn()} />);
    expect(screen.getByTestId("root")).toHaveProp(
      "accessibilityRole",
      "search"
    );
  });

  it("lets className override a base class on the root", () => {
    render(
      <SearchBar className="w-12" onSearch={jest.fn()} testID="subject" />
    );
    expect(screen.getByTestId("subject")).not.toHaveStyle({ width: "100%" });
  });

  it("spreads unknown props onto the root", () => {
    render(<SearchBar accessibilityHint="zoeken" onSearch={jest.fn()} />);
    expect(screen.getByTestId("root")).toHaveProp(
      "accessibilityHint",
      "zoeken"
    );
  });
});
