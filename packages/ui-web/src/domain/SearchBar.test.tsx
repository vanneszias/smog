import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "./SearchBar";

const classesOf = (element: Element): string[] =>
  (element.getAttribute("class") ?? "").split(" ").filter(Boolean);

const field = (): HTMLInputElement =>
  screen.getByRole("searchbox") as HTMLInputElement;

const type = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
};

/*
 * Two blocks, because `userEvent` and Vitest's fake timers do not work
 * together in this repository: `user.type` never resolves under
 * `vi.useFakeTimers()`, with or without `delay: null`, with or without
 * `advanceTimers` — a minimal probe over a bare `<input>` hangs for the full
 * five-second timeout as well, so it is not this component.
 *
 * The clock tests therefore drive the field with `fireEvent`, which is
 * synchronous and needs no timers of its own, and the interaction tests run
 * on real timers where `userEvent` behaves. Nothing is lost: the debounce is
 * a property of our change handler, and `fireEvent.change` is what reaches it.
 */
describe("SearchBar, on the clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search on mount", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    vi.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("does not search before the debounce elapses", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    vi.advanceTimersByTime(299);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches once the debounce elapses", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  /*
   * The difference between a debounce and a throttle, and the reason the two
   * tests above are not enough between them: every keystroke has to restart
   * the clock, not merely rate-limit it.
   */
  it("restarts the wait on every keystroke", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("h");
    vi.advanceTimersByTime(200);
    type("ha");
    vi.advanceTimersByTime(200);
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("ha");
  });

  it("reports a word typed at speed once, not once per letter", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("h");
    type("ha");
    type("hal");
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("honours a caller's delay instead of the default", () => {
    const onSearch = vi.fn();
    render(<SearchBar delay={1000} onSearch={onSearch} />);
    type("hal");
    vi.advanceTimersByTime(300);
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  it("searches immediately on submit, without waiting for the debounce", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("hal");
  });

  /*
   * The half that is easy to miss: submitting has to cancel the pending
   * debounce, or the same query is searched twice and the slower answer
   * lands last.
   */
  it("cancels the pending debounce when it submits", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    fireEvent.submit(screen.getByRole("search"));
    vi.advanceTimersByTime(1000);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not reload the page when it is submitted", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    type("hal");
    const submitted = fireEvent.submit(screen.getByRole("search"));
    expect(submitted).toBe(false);
  });

  it("reports the empty query immediately when it is cleared", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("cancels the pending debounce when it is cleared", () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    type("hal");
    fireEvent.click(screen.getByRole("button", { name: "Wissen" }));
    vi.advanceTimersByTime(1000);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  /*
   * A debounce that outlives its component calls back into a page that has
   * moved on. React says nothing about it; only the cleanup does.
   */
  it("does not search after it has been unmounted", () => {
    const onSearch = vi.fn();
    const { unmount } = render(<SearchBar onSearch={onSearch} />);
    type("hal");
    unmount();
    vi.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe("SearchBar", () => {
  it("renders a labelled search field", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.getByRole("searchbox", { name: "Zoeken" })).toBeDefined();
  });

  it("lets a caller relabel the field", () => {
    render(<SearchBar label="Zoek een gebaar" onSearch={vi.fn()} />);
    expect(
      screen.getByRole("searchbox", { name: "Zoek een gebaar" })
    ).toBeDefined();
  });

  it("is a search landmark", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.getByRole("search")).toBeDefined();
  });

  it("starts from a caller's initial query", () => {
    render(<SearchBar defaultValue="hal" onSearch={vi.fn()} />);
    expect(field().value).toBe("hal");
  });

  it("keeps what is typed in it", async () => {
    const user = userEvent.setup();
    render(<SearchBar onSearch={vi.fn()} />);
    await user.type(field(), "hal");
    expect(field().value).toBe("hal");
  });

  /*
   * Enter has to submit the form, and the clear button must not be what it
   * presses. `Button` sets no default `type`, and an HTML button without one
   * is a submit button — so a clear control that forgets `type="button"`
   * turns Enter into "erase what I just typed".
   */
  it("searches for what was typed when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    await user.type(field(), "hal{Enter}");
    expect(onSearch).toHaveBeenCalledWith("hal");
    expect(field().value).toBe("hal");
  });

  it("keeps the clear button out of the form's submission", () => {
    render(<SearchBar defaultValue="hal" onSearch={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Wissen" }).getAttribute("type")
    ).toBe("button");
  });

  it("renders no clear button while the field is empty", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Wissen" })).toBeNull();
  });

  it("renders a clear button once something is typed", async () => {
    const user = userEvent.setup();
    render(<SearchBar onSearch={vi.fn()} />);
    await user.type(field(), "h");
    expect(screen.getByRole("button", { name: "Wissen" })).toBeDefined();
  });

  it("empties the field on the clear button", async () => {
    const user = userEvent.setup();
    render(<SearchBar onSearch={vi.fn()} />);
    await user.type(field(), "hal");
    await user.click(screen.getByRole("button", { name: "Wissen" }));
    expect(field().value).toBe("");
  });

  /*
   * Clearing with the mouse moves focus to the button, and the button then
   * unmounts itself — which drops focus on `<body>` and loses a keyboard
   * user's place entirely. Focus goes back to the field it emptied.
   */
  it("returns focus to the field after clearing", async () => {
    const user = userEvent.setup();
    render(<SearchBar onSearch={vi.fn()} />);
    const input = field();
    await user.type(input, "hal");
    await user.click(screen.getByRole("button", { name: "Wissen" }));
    expect(document.activeElement).toBe(input);
  });

  it("lets a caller relabel the clear button", () => {
    render(
      <SearchBar clearLabel="Leegmaken" defaultValue="hal" onSearch={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Leegmaken" })).toBeDefined();
  });

  it("forwards its ref to the field", () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchBar onSearch={vi.fn()} ref={ref} />);
    expect(ref.current).toBe(field());
  });

  it("lets className override a base class on the form", () => {
    render(<SearchBar className="w-12" onSearch={vi.fn()} />);
    const classes = classesOf(screen.getByRole("search"));
    expect(classes).toContain("w-12");
    expect(classes).not.toContain("w-full");
  });

  it("spreads unknown props onto the form", () => {
    render(<SearchBar data-testid="zoeken" onSearch={vi.fn()} />);
    expect(screen.getByTestId("zoeken").tagName).toBe("FORM");
  });
});
