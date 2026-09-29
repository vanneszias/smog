import { describe, expect, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import { classesOf, renderKit } from "../test/render";
import { OfflineBanner } from "./offline-banner";

describe("OfflineBanner", () => {
  test("controlled: a status message with the offline copy", () => {
    renderKit(<OfflineBanner online={false} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("You're offline");
    expect(classesOf(banner)).toContain("bg-warning-subtle");
    expect(classesOf(banner)).toContain("text-warning-strong");
  });

  test("renders nothing while online", () => {
    const { container } = renderKit(<OfflineBanner online />);
    expect(container.textContent).toBe("");
  });

  test("uncontrolled: follows the browser's online/offline events", () => {
    renderKit(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
    const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain("You're offline");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
    if (original) {
      Object.defineProperty(navigator, "onLine", original);
    }
  });
});
