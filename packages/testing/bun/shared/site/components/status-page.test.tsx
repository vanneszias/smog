/**
 * The full-page states (issue #6): the 404 and a failed route, with one h1,
 * the recovery actions and a retry that says so when it failed again.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { RouteError } from "../../../../../../apps/site/src/components/learning/page";
import { NotFoundPage } from "../../../../../../apps/site/src/components/status-page";
import { renderSite } from "../../../../support/site/render";

/** A route whose loader fails `failures` times, then loads. */
function flakyRoute(failures: number) {
  let calls = 0;
  return createRoute({
    component: (): ReactNode => <p>Loaded</p>,
    errorComponent: RouteError,
    getParentRoute: () => createRootRoute(),
    // Async, as a real fetch: the boundary resets itself when the load
    // ends, before the retry's own promise settles.
    loader: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      calls += 1;
      if (calls <= failures) {
        throw new Error(`load ${calls} failed`);
      }
      return null;
    },
    path: "/flaky",
  });
}

let consoleError: ReturnType<typeof spyOn>;
beforeEach(() => {
  consoleError = spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("NotFoundPage", () => {
  test("is the page's one h1 with the way home and to every gesture", async () => {
    await renderSite(() => (
      <div data-testid="page">
        <NotFoundPage />
      </div>
    ));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" })
    ).toBeDefined();
    expect(screen.getByText("Error 404")).toBeDefined();
    // A 404 is a page, not an alert.
    expect(screen.queryByRole("alert")).toBeNull();
    const home = screen.getByRole("link", { name: "Go to the home page" });
    const browse = screen.getByRole("link", { name: "View all gestures" });
    expect(home.getAttribute("href")).toBe("/");
    expect(browse.getAttribute("href")).toBe("/gestures");
    expect(home.getAttribute("data-variant")).toBe("primary");
  });
});

describe("RouteError", () => {
  test("offers a retry first, and the home page as the alternative", async () => {
    await renderSite(null, {
      path: "/flaky",
      routes: [[flakyRoute(1), "/flaky"]],
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This page didn't load");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.getAttribute("data-variant")).toBe("primary");
    expect(
      screen
        .getByRole("link", { name: "Go to the home page" })
        .getAttribute("data-variant")
    ).toBe("secondary");
    // The error itself is logged, never shown.
    expect(document.body.textContent).not.toContain("load 1 failed");
  });

  test("a retry that fails again says so and puts the home page first", async () => {
    await renderSite(null, {
      path: "/flaky",
      routes: [[flakyRoute(2), "/flaky"]],
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" })
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "The page still won't load",
    });
    const [first, second] =
      screen.getByRole("alert").parentElement?.querySelectorAll("a, button") ??
      [];
    expect(first?.textContent).toBe("Go to the home page");
    expect(first?.getAttribute("data-variant")).toBe("primary");
    expect(second?.textContent).toContain("Try again");
    expect(second?.getAttribute("data-variant")).toBe("secondary");

    // The third load succeeds.
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Loaded");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a fresh failure after a successful retry is not reported as repeated", async () => {
    const route = flakyRoute(1);
    const { router } = await renderSite(null, {
      path: "/flaky",
      routes: [[route, "/flaky"]],
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" })
    );
    await screen.findByText("Loaded");
    // The same page fails later, with no retry in between.
    route.update({
      loader: () => {
        throw new Error("later");
      },
    } as never);
    await router.invalidate();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "This page didn't load" })
      ).toBeDefined()
    );
  });
});
