import { describe, expect, test } from "bun:test";
import { createI18n } from "@smog/i18n";
import { I18nextProvider } from "@smog/i18n/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { PreviewPicker } from "./preview-picker";

const GESTURES = [
  { id: "g1", name: "Broer", playbackId: "pb-broer" },
  { id: "g2", name: "Zus", playbackId: "pb-zus" },
  { id: "g3", name: "Mama", playbackId: "pb-mama" },
];

function Picker(): ReactNode {
  const [selected, setSelected] = useState("g1");
  return (
    <>
      <PreviewPicker
        gestures={GESTURES}
        onSelect={setSelected}
        selectedId={selected}
      />
      <output data-testid="shown">{selected}</output>
    </>
  );
}

function renderPicker(locale: "en" | "nl" = "en") {
  return render(
    <I18nextProvider i18n={createI18n(locale)}>
      <Picker />
    </I18nextProvider>
  );
}

function toggle(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("PreviewPicker (phase 7 ruling 8)", () => {
  test("a labelled row of poster toggles, the first chosen", () => {
    renderPicker();
    const group = screen.getByRole("toolbar", {
      name: "Choose the gesture to preview",
    });
    expect(group).toBeDefined();
    expect(toggle("Broer").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("Zus").getAttribute("aria-pressed")).toBe("false");
    const poster = toggle("Zus").querySelector("img");
    expect(poster?.getAttribute("src")).toBe(
      "https://image.mux.com/pb-zus/thumbnail.webp?width=160"
    );
    expect(poster?.getAttribute("alt")).toBe("");
  });

  test("a click switches the gesture and keeps the focus on the toggle", () => {
    renderPicker();
    act(() => toggle("Zus").focus());
    fireEvent.click(toggle("Zus"));
    expect(screen.getByTestId("shown").textContent).toBe("g2");
    expect(toggle("Zus").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("Broer").getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(toggle("Zus"));
  });

  test("one tab stop; the arrow keys, Home and End move the focus", () => {
    renderPicker();
    expect(toggle("Broer").tabIndex).toBe(0);
    expect(toggle("Zus").tabIndex).toBe(-1);
    act(() => toggle("Broer").focus());
    fireEvent.keyDown(toggle("Broer"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(toggle("Zus"));
    fireEvent.keyDown(toggle("Zus"), { key: "End" });
    expect(document.activeElement).toBe(toggle("Mama"));
    fireEvent.keyDown(toggle("Mama"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(toggle("Broer"));
    fireEvent.keyDown(toggle("Broer"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(toggle("Mama"));
    fireEvent.keyDown(toggle("Mama"), { key: "Home" });
    expect(document.activeElement).toBe(toggle("Broer"));
    // Moving the focus does not choose; Enter or Space (a click) does.
    expect(screen.getByTestId("shown").textContent).toBe("g1");
    fireEvent.keyDown(toggle("Broer"), { key: "ArrowDown" });
    fireEvent.click(toggle("Zus"));
    expect(screen.getByTestId("shown").textContent).toBe("g2");
    expect(document.activeElement).toBe(toggle("Zus"));
    expect(toggle("Zus").tabIndex).toBe(0);
  });

  test("its label in Dutch", () => {
    renderPicker("nl");
    expect(
      screen.getByRole("toolbar", {
        name: "Kies het gebaar voor het voorbeeld",
      })
    ).toBeDefined();
  });
});
